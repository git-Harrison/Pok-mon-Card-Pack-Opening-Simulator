-- ============================================================
-- 박스 일괄 구매 / 환불 RPC — 50박스 한 번에 처리.
--
-- 배경:
--   기존 클라(SetView openMulti) 는 N 박스 = N × buy_box(uuid, text)
--   round-trip. 50박스 = 50 round-trip → 모바일에서 체감 지연 큼.
--   사용자 spec 으로 "50박스 한 번에" 가 추가되면서 1회 RPC 로
--   축약 필요.
--
-- 이 마이그레이션:
--   buy_boxes_bulk(user_id, set_code, count) — 단일 트랜잭션,
--     포인트 한 번 차감, JSON 반환.
--   refund_boxes_bulk(user_id, set_code, count) — 일괄 환불,
--     실패 시 rollback 경로용.
--
--   둘 다 set_code 는 현재 미사용 (모든 세트 BOX_COST 30,000p
--   균일) 이지만 시그니처 일관성 + 향후 per-set 가격 차등 가능성
--   을 위해 받아둠.
--
--   카운트 상한은 100 (현 UI 50박스보다 여유). > 100 일괄은 이
--   RPC 가 거부.
-- ============================================================

create or replace function buy_boxes_bulk(
  p_user_id uuid,
  p_set_code text,
  p_count int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int := 30000;
  v_count int := coalesce(p_count, 0);
  v_total int;
  v_points int;
begin
  if v_count <= 0 then
    return json_build_object('ok', false, 'error', '박스 개수가 올바르지 않아요.');
  end if;
  if v_count > 100 then
    return json_build_object('ok', false,
      'error', '한 번에 최대 100박스까지 구매할 수 있어요.');
  end if;

  v_total := v_price * v_count;

  select points into v_points from users where id = p_user_id for update;
  if coalesce(v_points, 0) < v_total then
    return json_build_object(
      'ok', false,
      'error', format('포인트가 부족해요. 필요 %s p, 보유 %s p',
                      v_total, coalesce(v_points, 0)),
      'price', v_price,
      'count', v_count,
      'total_spent', v_total,
      'points', coalesce(v_points, 0)
    );
  end if;

  update users set points = points - v_total where id = p_user_id;

  return json_build_object(
    'ok', true,
    'price', v_price,
    'count', v_count,
    'total_spent', v_total,
    'points', v_points - v_total
  );
end;
$$;

grant execute on function buy_boxes_bulk(uuid, text, int) to anon, authenticated;

create or replace function refund_boxes_bulk(
  p_user_id uuid,
  p_set_code text,
  p_count int
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int := 30000;
  v_count int := coalesce(p_count, 0);
  v_total int;
  v_new_points int;
begin
  if v_count <= 0 then
    return json_build_object('ok', false, 'error', '환불 개수가 올바르지 않아요.');
  end if;

  v_total := v_price * v_count;

  update users set points = points + v_total
    where id = p_user_id
    returning points into v_new_points;

  return json_build_object(
    'ok', true,
    'refunded', v_total,
    'count', v_count,
    'points', v_new_points
  );
end;
$$;

grant execute on function refund_boxes_bulk(uuid, text, int) to anon, authenticated;

notify pgrst, 'reload schema';

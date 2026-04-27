-- ============================================================
-- 일괄 판매 보안 + 가격 정합
--
-- 1) bulk_sell_cards 보안 수정 — 클라가 보내는 price 신뢰 제거.
--    이전: items[].price 를 그대로 곱해 적립. 클라 조작 시 무한
--    포인트 가능 (보안 결함).
--    이후: items 에 rarity 포함, 서버에서 bulk_sell_price(rarity)
--    로 가격 계산. 클라가 보낸 price 필드는 무시.
--    `supabase/psa-v3.sql` 의 manual 정의는 migration ledger 에
--    포함 안 돼 있을 수 있어 이 마이그레이션이 단일 진실 소스.
--
-- 2) pcl_sell_price 가격 클라이언트와 동기화 — 서버 단가가 10배
--    높았던 mismatch. PCL 슬랩 환산이 박스 가격 대비 합리적인
--    수준 (서버 측) 으로 통일.
--
-- 클라 측 변경 (별도 commit):
--    src/lib/psa.ts PCL_SELL_PRICE  → 서버 값으로
--    src/lib/db.ts BulkSellItem      → price 대신 rarity
--    src/components/BulkSellView     → rarity 전달
-- ============================================================

create or replace function bulk_sell_cards(
  p_user_id uuid,
  p_items jsonb
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_item record;
  v_owned int;
  v_unit_price int;
  v_total bigint := 0;
  v_new_points int;
  v_sold int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    return json_build_object('ok', false, 'error', '판매할 카드가 없습니다.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 1차: 보유량 검증 (모든 항목 통과해야 적용 시작 — atomic 보장)
  for v_item in
    select * from jsonb_to_recordset(p_items)
      as t(card_id text, "count" int, rarity text)
  loop
    if coalesce(v_item."count", 0) < 1 then
      return json_build_object('ok', false, 'error', '잘못된 판매 항목입니다.');
    end if;
    if v_item.rarity is null or bulk_sell_price(v_item.rarity) <= 0 then
      return json_build_object(
        'ok', false,
        'error', format('알 수 없는 등급: %s', coalesce(v_item.rarity, '?'))
      );
    end if;
    select count into v_owned from card_ownership
      where user_id = p_user_id and card_id = v_item.card_id
      for update;
    if not found or coalesce(v_owned, 0) < v_item."count" then
      return json_build_object(
        'ok', false,
        'error', format('보유 수량 부족: %s', v_item.card_id)
      );
    end if;
  end loop;

  -- 2차: 적용 (서버 가격으로 적립)
  for v_item in
    select * from jsonb_to_recordset(p_items)
      as t(card_id text, "count" int, rarity text)
  loop
    v_unit_price := bulk_sell_price(v_item.rarity);
    update card_ownership set count = count - v_item."count",
           last_pulled_at = now()
      where user_id = p_user_id and card_id = v_item.card_id;
    delete from card_ownership
      where user_id = p_user_id and card_id = v_item.card_id and count = 0;
    v_total := v_total + (v_item."count"::bigint * v_unit_price);
    v_sold := v_sold + v_item."count";
  end loop;

  if v_total > 0 then
    update users set points = points + v_total::int
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object('ok', true,
    'sold', v_sold,
    'earned', v_total::int,
    'points', v_new_points);
end;
$$;

grant execute on function bulk_sell_cards(uuid, jsonb) to anon, authenticated;

-- pcl_sell_price 가격 — 서버 측 값으로 통일.
-- 박스 1개 (~30k) 대비 합리적인 환산: PCL 10 슬랩 = 박스 6배 가치.
-- 감별 성공률 30% × 등급분포 가중평균하면 박스당 PCL 슬랩 환산
-- 평균 ~40~80k 수준이라 박스 경제와 균형.
create or replace function pcl_sell_price(p_grade int) returns int
language sql immutable as $$
  select case
    when p_grade = 10 then 200000
    when p_grade = 9  then 100000
    when p_grade = 8  then  20000
    when p_grade in (6, 7) then 10000
    else 0
  end
$$;

grant execute on function pcl_sell_price(int) to anon, authenticated;

notify pgrst, 'reload schema';

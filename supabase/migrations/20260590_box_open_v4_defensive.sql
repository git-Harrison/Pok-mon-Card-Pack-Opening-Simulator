-- ============================================================
-- record_pack_pulls_batch v4 — 30 박스 500 timeout 방어형 재작성.
--
-- 가설:
--   1) v3 (20260589) 가 CI 에 미적용 → 옛 v2 (4500 row pulls insert)
--      그대로라 30 박스에서 statement_timeout 으로 500.
--   2) 또는 임시 테이블 (tmp_pack_cards / tmp_pack_ids) 생성/드롭이
--      900+row 부하와 합쳐져 timeout 임계 근처를 친다.
--
-- 본 마이그레이션:
--   · 임시 테이블 완전 제거. 모든 처리 single CTE 안에서.
--   · pack_opens insert 는 generate_series 1줄.
--   · card_ownership upsert 는 jsonb 직접 GROUP BY 1줄.
--   · v_total_kept 계산 + cap 검사 동일 CTE 안에서 한 번.
--   · set local statement_timeout = '60s' — anon role 기본 timeout
--     초과 케이스 명시적 회피.
--   · 자동판매 보상 폐기 (포인트 0). 자동삭제만.
--
-- 응답 키는 클라 호환 위해 v3 형식 유지:
--   ok, pack_count, total_kept, total_sold_count, total_sold_earned,
--   total_deleted_count, points.
-- ============================================================

create or replace function record_pack_pulls_batch(
  p_user_id uuid,
  p_set_code text,
  p_pulls jsonb,
  p_auto_sell_rarities text[]
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_count int;
  v_total_kept int := 0;
  v_total_deleted int := 0;
  v_current int;
  v_new_points int;
  v_kept_card_ids text[];
begin
  -- 30 박스 케이스에서 전체 작업이 ~1~3 초. 60s 면 충분 + safety.
  set local statement_timeout = '60s';

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_pulls is null or jsonb_typeof(p_pulls) <> 'array' then
    return json_build_object('ok', false, 'error', '팩 데이터가 없어요.');
  end if;

  v_pack_count := jsonb_array_length(p_pulls);
  if v_pack_count = 0 then
    return json_build_object('ok', false, 'error', '팩 데이터가 비어 있어요.');
  end if;

  -- 1) 한 번의 CTE 로 모든 카드 unwind + auto_sell 분류 + 집계.
  --    임시 테이블 X. 결과는 keepers (kept 카드 ID 목록) + 통계.
  with packs as (
    select pack_obj
      from jsonb_array_elements(p_pulls) as t(pack_obj)
  ),
  flattened as (
    select
      c.card_id,
      r.rarity
    from packs p
    cross join lateral (
      select value::text as card_id, ord as idx
      from jsonb_array_elements_text(p.pack_obj->'card_ids') with ordinality as t(value, ord)
    ) c
    cross join lateral (
      select value::text as rarity, ord as idx
      from jsonb_array_elements_text(p.pack_obj->'rarities') with ordinality as t(value, ord)
    ) r
    where c.idx = r.idx
  ),
  classified as (
    select
      card_id,
      rarity,
      not (p_auto_sell_rarities is not null and rarity = any(p_auto_sell_rarities)) as is_kept
    from flattened
  )
  select
    coalesce(array_agg(card_id) filter (where is_kept), '{}'::text[]),
    coalesce(count(*) filter (where is_kept), 0)::int,
    coalesce(count(*) filter (where not is_kept), 0)::int
    into v_kept_card_ids, v_total_kept, v_total_deleted
    from classified;

  -- 2) cap 검사 (현재 보유 + kept ≤ 50,000)
  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;
  if v_current + v_total_kept > 50000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 50,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  -- 3) pack_opens — pack_count 만큼 row insert (id default gen_random_uuid).
  --    900 row 단발 INSERT. trigger 없음. 부하 미미.
  insert into pack_opens (user_id, set_code)
  select p_user_id, p_set_code
    from generate_series(1, v_pack_count);

  -- 4) card_ownership upsert — kept 카드만, card_id 별 그룹 카운트.
  if v_total_kept > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_card_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  -- 5) 자동삭제 카드는 포인트 적립 X. 현재 포인트만 응답.
  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'pack_count', v_pack_count,
    'total_kept', v_total_kept,
    'total_sold_count', v_total_deleted,
    'total_sold_earned', 0,
    'total_deleted_count', v_total_deleted,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pulls_batch(uuid, text, jsonb, text[]) to anon, authenticated;

notify pgrst, 'reload schema';

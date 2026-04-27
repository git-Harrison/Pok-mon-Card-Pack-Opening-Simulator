-- ============================================================
-- 박스 개봉 RPC 성능/경제 재구성 + 체육관 밸런스
--
-- 1) record_pack_pulls_batch / record_pack_pull_v4 — 자동판매 → 자동
--    삭제, 그리고 30 박스 (≈4,500 카드) 에서 발생하던 500 timeout 수정.
--    · 더이상 카드가 자동판매되지 않음. 선택한 등급은 카드_ownership
--      에 들어가지 않고 그냥 사라짐 (포인트 적립 X). 사용자 피드백
--      "돈이 너무 많이 모여" 해결.
--    · audit 로그용 pulls 테이블 insert 제거 — 어디서도 SELECT 하지
--      않는 dead write 였고 30 박스에서 4,500 row 삽입이 statement
--      timeout 의 주범이었음. pack_opens 와 card_ownership 만으로 게임
--      상태는 충분.
--    · 응답 형식 (total_sold_count / total_sold_earned 키) 은 유지하되
--      total_sold_earned 는 항상 0. 클라이언트 표시는 "자동 삭제 N장"
--      으로 변경.
--
-- 2) 체육관 min_power 상향:
--    잎새 35,000 / 파도 50,000 / 암석 70,000 / 뇌전 90,000 /
--    불꽃 130,000 / 대지 170,000 / 빙하 230,000 / 초능력 300,000.
--
-- 3) 체육관 관장 포켓몬 — 모두 체육관 속성과 동일 + 3 종 모두 다른
--    종으로 정합. 뇌전 슬롯 2 의 코일(81, 강철) → 라이츄(26, 전기)
--    교체. 다른 체육관은 현재 시드 그대로 유지.
--
-- 모든 DDL 멱등.
-- ============================================================

-- 1-a) record_pack_pulls_batch v3 — no sell, no pulls insert
create or replace function record_pack_pulls_batch(
  p_user_id uuid,
  p_set_code text,
  p_pulls jsonb,
  p_auto_sell_rarities text[]   -- 이름 유지 (클라 호환). 의미는 "자동 삭제 등급".
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
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_pulls is null or jsonb_typeof(p_pulls) <> 'array' then
    return json_build_object('ok', false, 'error', '팩 데이터가 없어요.');
  end if;

  v_pack_count := jsonb_array_length(p_pulls);
  if v_pack_count = 0 then
    return json_build_object('ok', false, 'error', '팩 데이터가 비어 있어요.');
  end if;

  create temporary table tmp_pack_cards (
    pack_seq int not null,
    card_id text not null,
    rarity text not null,
    is_kept boolean not null
  ) on commit drop;

  insert into tmp_pack_cards (pack_seq, card_id, rarity, is_kept)
  with packs as (
    select
      (ord - 1)::int as pack_seq,
      pack_obj
    from jsonb_array_elements(p_pulls) with ordinality as t(pack_obj, ord)
  ),
  flattened as (
    select
      p.pack_seq,
      c.card_id,
      r.rarity,
      c.idx
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
  )
  select
    pack_seq,
    card_id,
    rarity,
    not (p_auto_sell_rarities is not null and rarity = any(p_auto_sell_rarities)) as is_kept
  from flattened;

  select count(*) filter (where is_kept), count(*) filter (where not is_kept)
    into v_total_kept, v_total_deleted
    from tmp_pack_cards;

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

  -- pack_opens — set 별 누계 / 통계용 1 row per pack. 30 박스 = 900 row,
  -- 단순 INSERT 라 부담 없음. (이전 버전이 가지고 있던 4,500 row 짜리
  -- pulls audit insert 가 timeout 의 주범이었음 — 제거.)
  insert into pack_opens (user_id, set_code)
  select p_user_id, p_set_code
    from generate_series(1, v_pack_count);

  if v_total_kept > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, card_id, count(*)::int, now()
      from tmp_pack_cards
     where is_kept
     group by card_id
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  -- 자동판매 보상 폐기 — 자동 삭제 카드는 포인트 적립 없음.
  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'pack_count', v_pack_count,
    'total_kept', v_total_kept,
    'total_sold_count', v_total_deleted,    -- 클라 호환 — 의미는 "삭제됨"
    'total_sold_earned', 0,
    'total_deleted_count', v_total_deleted,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pulls_batch(uuid, text, jsonb, text[]) to anon, authenticated;

-- 1-b) record_pack_pull_v4 v3 — no sell, no pulls insert
create or replace function record_pack_pull_v4(
  p_user_id uuid,
  p_set_code text,
  p_card_ids text[],
  p_rarities text[],
  p_auto_sell_sub_ar boolean
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
  v_current int;
  v_kept_count int := 0;
  v_deleted_count int := 0;
  v_new_points int;
  v_total int;
  v_idx int;
  v_kept_ids text[] := array[]::text[];
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_total := coalesce(array_length(p_card_ids, 1), 0);
  if v_total = 0 then
    return json_build_object('ok', false, 'error', '카드가 없어요.');
  end if;
  if p_rarities is null or coalesce(array_length(p_rarities, 1), 0) <> v_total then
    return json_build_object('ok', false, 'error', '레어도 정보가 일치하지 않아요.');
  end if;

  for v_idx in 1..v_total loop
    if p_auto_sell_sub_ar and is_sub_ar(p_rarities[v_idx]) then
      v_deleted_count := v_deleted_count + 1;
    else
      v_kept_ids := v_kept_ids || p_card_ids[v_idx];
      v_kept_count := v_kept_count + 1;
    end if;
  end loop;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_kept_count > 50000 then
    raise exception
      '지갑 보유 한도 초과 — 현재 %장 / 50,000장. 팔거나 감별/전시로 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
    values (p_user_id, p_set_code)
    returning id into v_pack_id;

  if v_kept_count > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'pack_open_id', v_pack_id,
    'sold_count', v_deleted_count,
    'sold_earned', 0,
    'deleted_count', v_deleted_count,
    'kept_count', v_kept_count,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pull_v4(uuid, text, text[], text[], boolean) to anon, authenticated;

-- 2) 체육관 min_power 상향 — 사용자가 직접 지정한 잎새 35k / 파도 50k
-- 외 나머지는 NORMAL → HARD → BOSS 곡선으로 자동 보정.
update gyms
   set min_power = case id
     when 'gym-grass'    then  35000   -- EASY
     when 'gym-water'    then  50000   -- NORMAL
     when 'gym-rock'     then  70000   -- NORMAL
     when 'gym-electric' then  90000   -- NORMAL
     when 'gym-fire'     then 130000   -- HARD
     when 'gym-ground'   then 170000   -- HARD
     when 'gym-ice'      then 230000   -- BOSS
     when 'gym-psychic'  then 300000   -- BOSS
     else min_power
   end
 where id in (
   'gym-grass','gym-water','gym-rock','gym-electric',
   'gym-fire','gym-ground','gym-ice','gym-psychic'
 );

-- 3) 뇌전 체육관 슬롯 2 — 코일(81, 강철) → 라이츄(26, 전기) 교체.
update gym_pokemon
   set name = '라이츄', type = '전기', dex = 26
 where gym_id = 'gym-electric' and slot = 2;

notify pgrst, 'reload schema';

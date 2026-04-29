-- ============================================================
-- 도감 ↔ 펫/체육관 독립성 검증 + hun 시드 결과 검증.
--
-- 사용자 요구 검증 항목 (반드시 체크):
--   A. 도감 데이터 정합성
--      A1. 펫(legacy + by_type) 슬롯에 dangling grading 없는지
--      A2. 방어덱 슬롯에 dangling grading 없는지
--      A3. pokedex_entries 와 펫·방어덱 슬롯이 동시에 같은 grading
--          을 가리키는 모순(=등록되며 슬랩 삭제돼야 함) 없는지
--   B. hun 시드 결과
--      B1. 펫에 PCL10 MUR/UR/SAR/SR 각 최소 1장 등록
--      B2. 동일 card_id 들이 card_ownership 에 count >= 1
--
-- 위반 등급:
--   · critical (raise exception) — A3 / B1 / B2 (사용자 명시 요구)
--   · warning  (raise notice)    — A1 / A2 (cleanup 으로 충분히 처리)
--
-- 멱등 — 모든 검증 통과 시 NOOP. 이 마이그레이션 자체는 데이터를
-- 변경하지 않음.
-- ============================================================

do $$
declare
  v_dangling_pet int := 0;
  v_dangling_def int := 0;
  v_pokedex_pet_overlap int := 0;
  v_hun_user_id uuid;
  v_pet_grades jsonb;
  v_missing_grades text[];
  v_chosen_card_ids text[];
  v_wallet_missing text[];
  v_target constant text[] := array['MUR', 'UR', 'SAR', 'SR'];
  v_r text;
begin
  -- ── A. 데이터 정합성 ──────────────────────────────────────

  -- A1. main_card_ids 또는 main_cards_by_type 에 죽은 grading uuid 가
  --     남아 있는지. cleanup 마이그레이션 후 0 이어야 정상.
  with pet_refs as (
    select u.id as user_id, ref as grading_id
      from users u, unnest(coalesce(u.main_card_ids, '{}'::uuid[])) ref
    union all
    select u.id, ref
      from users u, unnest(
             flatten_pet_ids_by_type(coalesce(u.main_cards_by_type, '{}'::jsonb))
           ) ref
  )
  select count(*)::int into v_dangling_pet
    from pet_refs p
   where not exists (
     select 1 from psa_gradings g
      where g.id = p.grading_id and g.user_id = p.user_id and g.grade = 10
   );

  if v_dangling_pet > 0 then
    raise warning '[verify] A1 펫 슬롯 dangling % 개 — 20260652 cleanup 재실행 필요',
      v_dangling_pet;
  else
    raise notice '[verify] A1 펫 dangling 없음 ✓';
  end if;

  -- A2. defense_pet_ids dangling.
  with def_refs as (
    select o.owner_user_id as user_id, ref as grading_id
      from gym_ownerships o, unnest(coalesce(o.defense_pet_ids, '{}'::uuid[])) ref
  )
  select count(*)::int into v_dangling_def
    from def_refs d
   where not exists (
     select 1 from psa_gradings g
      where g.id = d.grading_id and g.user_id = d.user_id and g.grade = 10
   );

  if v_dangling_def > 0 then
    raise warning '[verify] A2 방어덱 dangling % 개 — 20260652 cleanup 재실행 필요',
      v_dangling_def;
  else
    raise notice '[verify] A2 방어덱 dangling 없음 ✓';
  end if;

  -- A3. CRITICAL — pokedex_entries.source_grading_id 가 펫/방어덱
  --     슬롯에 그대로 살아 있으면 모순. 도감 등록 RPC 가 슬랩을
  --     삭제하므로 절대 발생하면 안 됨.
  --
  --     주의: 같은 card_id 의 *다른* PCL10 슬랩이 한쪽은 도감,
  --     한쪽은 펫에 있는 건 정상 (사용자가 도감 등록 후 그 카드를
  --     다시 PSA 해서 새 슬랩을 펫으로 쓰는 케이스). 그래서 card_id
  --     일치는 모순 아님 — source_grading_id 일치만 모순.
  with all_pet_def as (
    select u.id as user_id, ref as grading_id
      from users u, unnest(coalesce(u.main_card_ids, '{}'::uuid[])) ref
    union all
    select u.id, ref
      from users u, unnest(
             flatten_pet_ids_by_type(coalesce(u.main_cards_by_type, '{}'::jsonb))
           ) ref
    union all
    select o.owner_user_id, ref
      from gym_ownerships o, unnest(coalesce(o.defense_pet_ids, '{}'::uuid[])) ref
  )
  select count(*)::int into v_pokedex_pet_overlap
    from all_pet_def a
    join pokedex_entries pe
      on pe.user_id = a.user_id
     and pe.source_grading_id = a.grading_id;

  if v_pokedex_pet_overlap > 0 then
    raise exception '[verify] A3 CRITICAL — 펫/방어덱과 도감이 같은 카드를 동시에 보유 (% 건). 도감 등록 정책 위반.',
      v_pokedex_pet_overlap;
  else
    raise notice '[verify] A3 도감↔펫/방어덱 분리 ✓';
  end if;

  -- ── B. hun 시드 결과 ─────────────────────────────────────

  select id into v_hun_user_id from users where user_id = 'hun';
  if v_hun_user_id is null then
    raise notice '[verify] B hun 미존재 — skip';
    return;
  end if;

  -- B1. 펫에 PCL10 MUR/UR/SAR/SR 각 최소 1장.
  with pet_grading_ids as (
    select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
      from users where id = v_hun_user_id
    union
    select unnest(flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb)))
      from users where id = v_hun_user_id
  ),
  pet_pcl10 as (
    select g.rarity, g.card_id
      from psa_gradings g
     where g.user_id = v_hun_user_id
       and g.grade = 10
       and g.id in (select id from pet_grading_ids where id is not null)
  )
  select coalesce(jsonb_object_agg(rarity, cnt), '{}'::jsonb)
    into v_pet_grades
    from (
      select rarity, count(*)::int as cnt from pet_pcl10 group by rarity
    ) t;

  v_missing_grades := '{}'::text[];
  foreach v_r in array v_target loop
    if coalesce((v_pet_grades ->> v_r)::int, 0) < 1 then
      v_missing_grades := v_missing_grades || v_r;
    end if;
  end loop;

  if coalesce(array_length(v_missing_grades, 1), 0) > 0 then
    raise exception '[verify] B1 hun 펫에 PCL10 등급 누락: %  (요구: MUR/UR/SAR/SR 각 1장)',
      v_missing_grades;
  else
    raise notice '[verify] B1 hun 펫 PCL10 MUR/UR/SAR/SR 모두 ✓ (%)', v_pet_grades;
  end if;

  -- B2. 시드된 4 card_id 들이 card_ownership 에 count >= 1.
  --     B1 의 펫 카드 중 등급별 1장씩만 추리고 그 card_id 들이 지갑에
  --     있는지 검사 (등급당 첫 번째 card_id 사용).
  with pet_grading_ids as (
    select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
      from users where id = v_hun_user_id
    union
    select unnest(flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb)))
      from users where id = v_hun_user_id
  ),
  pet_pcl10 as (
    select g.rarity, g.card_id, g.id
      from psa_gradings g
     where g.user_id = v_hun_user_id
       and g.grade = 10
       and g.rarity = any(v_target)
       and g.id in (select id from pet_grading_ids where id is not null)
  ),
  per_rarity as (
    select distinct on (rarity) rarity, card_id
      from pet_pcl10
      order by rarity, card_id
  )
  select array_agg(card_id) into v_chosen_card_ids from per_rarity;

  v_wallet_missing := '{}'::text[];
  if v_chosen_card_ids is not null then
    select coalesce(array_agg(c), '{}'::text[]) into v_wallet_missing
      from unnest(v_chosen_card_ids) c
     where not exists (
       select 1 from card_ownership co
        where co.user_id = v_hun_user_id
          and co.card_id = c
          and co.count >= 1
     );
  end if;

  if coalesce(array_length(v_wallet_missing, 1), 0) > 0 then
    raise exception '[verify] B2 hun 카드 지갑에 없거나 count < 1: %', v_wallet_missing;
  else
    raise notice '[verify] B2 hun 지갑 4 card_id 보유 ✓ (%)', v_chosen_card_ids;
  end if;

  raise notice '[verify] === 모든 검증 통과 ===';
end $$;

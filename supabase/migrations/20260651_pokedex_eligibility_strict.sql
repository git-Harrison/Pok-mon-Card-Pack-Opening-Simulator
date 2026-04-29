-- ============================================================
-- 도감 등록 자격 엄격화 — 펫(by_type) + 방어 덱 제외 누락 픽스.
--
-- 사용자 리포트:
--   "펫에 등록된 카드 / 체육관 방어덱에 등록된 카드가 도감에 자동
--    반영되는 버그가 있음. 도감 등록은 명시적인 PCL10 획득 이벤트
--    기반으로만, 펫·체육관·전시·지갑 상태에서 파생되면 안 됨."
--
-- 원인:
--   · 20260543 이 main_card_ids (legacy) 만 제외 조건에 추가했는데,
--     20260619 에서 펫이 main_cards_by_type 구조로 이전됨. 결과로
--     by_type 에 든 슬랩이 도감 일괄 등록 시 빨려 들어감 (grading
--     row 가 삭제되며 main_cards_by_type 에 dangling uuid 만 남음).
--   · 체육관 방어덱(gym_ownerships.defense_pet_ids) 은 처음부터
--     제외 조건에 없었음.
--
-- 픽스 (단일 진입점 통일):
--   1) pokedex_eligible_grading_ids(p_user_id) — 도감 등록 가능한
--      슬랩 ID 를 산출하는 단일 헬퍼. 모든 등록 RPC 가 이걸 사용.
--   2) bulk_register_pokedex_entries / register_pokedex_entry 양쪽이
--      이 헬퍼만 신뢰하도록 본문 갱신. 정책 분기 흩어지지 않게.
--   3) 제외 조건 (전부 적용):
--      · grade <> 10
--      · showcase_cards 에 전시 중
--      · users.main_card_ids (legacy 펫)
--      · users.main_cards_by_type (현행 펫, by-type)
--      · gym_ownerships.defense_pet_ids (방어 덱)
--      · gifts(pending, 미만료)
--      · pokedex_entries 에 이미 같은 card_id 등록
--
-- 멱등 — CREATE OR REPLACE 만 사용. 함수 파라미터 이름·시그니처 동일.
-- ============================================================

-- 1) 단일 자격 헬퍼.
create or replace function pokedex_eligible_grading_ids(p_user_id uuid)
returns table(grading_id uuid, card_id text, rarity text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with pet_legacy as (
    select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
      from users where id = p_user_id
  ),
  pet_by_type as (
    select unnest(
             flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb))
           ) as id
      from users where id = p_user_id
  ),
  defense as (
    select unnest(coalesce(o.defense_pet_ids, '{}'::uuid[])) as id
      from gym_ownerships o
     where o.owner_user_id = p_user_id
  ),
  blocked as (
    select id from pet_legacy where id is not null
    union
    select id from pet_by_type where id is not null
    union
    select id from defense where id is not null
  )
  select g.id, g.card_id, g.rarity
    from psa_gradings g
   where g.user_id = p_user_id
     and g.grade = 10
     and not exists (select 1 from blocked b where b.id = g.id)
     and not exists (
       select 1 from showcase_cards sc where sc.grading_id = g.id
     )
     and not exists (
       select 1 from gifts gf
        where gf.grading_id = g.id
          and gf.status = 'pending'
          and gf.expires_at > now()
     )
     and not exists (
       select 1 from pokedex_entries pe
        where pe.user_id = p_user_id and pe.card_id = g.card_id
     );
$$;

grant execute on function pokedex_eligible_grading_ids(uuid) to anon, authenticated;

-- 2) bulk_register_pokedex_entries — 헬퍼만 신뢰.
create or replace function bulk_register_pokedex_entries(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_registered_ids uuid[];
  v_count int;
  v_total int;
  v_bonus int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  with eligible as (
    select grading_id as id, card_id, rarity
      from pokedex_eligible_grading_ids(p_user_id)
  ),
  deduped as (
    select distinct on (card_id) id, card_id, rarity
      from eligible
      order by card_id, id
  ),
  inserted as (
    insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
      select p_user_id, d.card_id, d.rarity, d.id
        from deduped d
      on conflict (user_id, card_id) do nothing
      returning source_grading_id
  )
  select coalesce(array_agg(source_grading_id), '{}'::uuid[])
    into v_registered_ids
    from inserted;

  v_count := coalesce(array_length(v_registered_ids, 1), 0);

  if v_count > 0 then
    delete from psa_gradings where id = any(v_registered_ids);
  end if;

  update users
     set pokedex_count = pokedex_count + v_count
   where id = p_user_id
   returning pokedex_count into v_total;

  v_bonus := pokedex_power_bonus(coalesce(v_total, 0));

  return json_build_object(
    'ok', true,
    'registered_count', v_count,
    'power_bonus', v_bonus,
    'new_pokedex_count', coalesce(v_total, 0)
  );
end;
$$;

grant execute on function bulk_register_pokedex_entries(uuid) to anon, authenticated;

-- 3) register_pokedex_entry — 동일 헬퍼 통과 여부로 판정 + 친절한
--    에러 메시지 (어떤 가드에 막혔는지 사용자에게 노출).
create or replace function register_pokedex_entry(
  p_user_id uuid,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_eligible record;
  v_count int;
  v_bonus int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select grading_id, card_id, rarity into v_eligible
    from pokedex_eligible_grading_ids(p_user_id)
   where grading_id = p_grading_id
   limit 1;

  if not found then
    -- 어디서 막혔는지 분기 — 헬퍼와 동일한 가드를 한 번 더 체크.
    if not exists (select 1 from psa_gradings where id = p_grading_id) then
      return json_build_object('ok', false, 'error', '슬랩을 찾을 수 없어요.');
    end if;
    if not exists (
      select 1 from psa_gradings where id = p_grading_id and user_id = p_user_id
    ) then
      return json_build_object('ok', false, 'error', '본인 소유 슬랩만 등록할 수 있어요.');
    end if;
    if not exists (
      select 1 from psa_gradings where id = p_grading_id and grade = 10
    ) then
      return json_build_object('ok', false, 'error', 'PCL 10 슬랩만 도감에 등록할 수 있어요.');
    end if;
    if exists (select 1 from showcase_cards where grading_id = p_grading_id) then
      return json_build_object('ok', false, 'error', '센터에 전시 중인 슬랩은 등록할 수 없어요.');
    end if;
    if exists (
      select 1 from users
       where id = p_user_id
         and (
           p_grading_id = any(coalesce(main_card_ids, '{}'::uuid[]))
           or p_grading_id = any(
                flatten_pet_ids_by_type(coalesce(main_cards_by_type, '{}'::jsonb))
              )
         )
    ) then
      return json_build_object('ok', false,
        'error', '펫으로 등록된 슬랩은 도감에 등록할 수 없어요. 펫 해제 후 다시 시도하세요.');
    end if;
    if exists (
      select 1 from gym_ownerships
       where owner_user_id = p_user_id
         and p_grading_id = any(coalesce(defense_pet_ids, '{}'::uuid[]))
    ) then
      return json_build_object('ok', false,
        'error', '체육관 방어 덱에 등록된 슬랩은 도감에 등록할 수 없어요.');
    end if;
    if exists (
      select 1 from gifts
       where grading_id = p_grading_id
         and status = 'pending'
         and expires_at > now()
    ) then
      return json_build_object('ok', false, 'error', '선물로 보낸 슬랩은 등록할 수 없어요.');
    end if;
    if exists (
      select 1
        from pokedex_entries pe
        join psa_gradings g on g.card_id = pe.card_id
       where pe.user_id = p_user_id and g.id = p_grading_id
    ) then
      return json_build_object('ok', false, 'error', '이미 도감에 등록된 카드예요.');
    end if;
    return json_build_object('ok', false, 'error', '등록할 수 없는 슬랩입니다.');
  end if;

  insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
    values (p_user_id, v_eligible.card_id, v_eligible.rarity, v_eligible.grading_id);

  delete from psa_gradings where id = v_eligible.grading_id;

  update users
     set pokedex_count = pokedex_count + 1
   where id = p_user_id
   returning pokedex_count into v_count;

  v_bonus := pokedex_power_bonus(v_count);

  return json_build_object(
    'ok', true,
    'pokedex_count', v_count,
    'power_bonus', v_bonus
  );
end;
$$;

grant execute on function register_pokedex_entry(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

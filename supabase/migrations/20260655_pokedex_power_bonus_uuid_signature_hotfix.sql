-- ============================================================
-- 핫픽스 — bulk_register_pokedex_entries / register_pokedex_entry
-- 의 pokedex_power_bonus 호출이 (int) 시그니처로 돼 있어 런타임에
-- "function pokedex_power_bonus(integer) does not exist" 던지던 버그.
--
-- 원인:
--   · 내가 20260651 을 20260543 (옛 int 시그니처 시절) 베이스로 작성.
--   · 그 사이 20260563 이 pokedex_power_bonus 를 (uuid) 로 재설계 +
--     `drop function if exists pokedex_power_bonus(int)` 으로 옛 버전
--     제거. 호출처도 모두 uuid 로 갱신.
--   · 내 20260651 은 v_bonus := pokedex_power_bonus(coalesce(v_total,0))
--     처럼 int 인자로 호출 → 함수 본문 lazy-compile 이라 적용은 성공,
--     실제 "도감 일괄 등록" 누를 때 undefined_function 으로 폭발.
--
-- 픽스: 두 함수의 v_bonus 계산을 pokedex_power_bonus(p_user_id) 로
-- 교체. 정책/가드 로직(헬퍼 사용)은 20260651 그대로. 단 pokedex_count
-- 의 update ... returning 은 그대로 둬서 응답 구조 유지.
-- ============================================================

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

  v_bonus := pokedex_power_bonus(p_user_id);

  return json_build_object(
    'ok', true,
    'registered_count', v_count,
    'power_bonus', v_bonus,
    'new_pokedex_count', coalesce(v_total, 0)
  );
end;
$$;

grant execute on function bulk_register_pokedex_entries(uuid) to anon, authenticated;

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

  v_bonus := pokedex_power_bonus(p_user_id);

  return json_build_object(
    'ok', true,
    'pokedex_count', v_count,
    'power_bonus', v_bonus
  );
end;
$$;

grant execute on function register_pokedex_entry(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

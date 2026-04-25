-- 도감 일괄 등록 시 펫 슬랩 (users.main_card_ids) 도 제외.
-- 이미 showcase_cards 는 제외되고 있으나, main_card_ids 는 빠져 있어 펫이 사라지는
-- 사고가 가능했음. 이번 패치로 양쪽 모두 안전하게 보호.

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
  v_pet_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(main_card_ids, '{}'::uuid[]) into v_pet_ids
    from users where id = p_user_id;

  with eligible as (
    select g.id, g.card_id, g.rarity
      from psa_gradings g
     where g.user_id = p_user_id
       and g.grade = 10
       and not (g.id = any(v_pet_ids))
       and not exists (
         select 1 from showcase_cards sc where sc.grading_id = g.id
       )
       and not exists (
         select 1 from pokedex_entries pe
          where pe.user_id = p_user_id and pe.card_id = g.card_id
       )
       and not exists (
         select 1 from gifts gf
          where gf.grading_id = g.id
            and gf.status = 'pending'
            and gf.expires_at > now()
       )
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

notify pgrst, 'reload schema';

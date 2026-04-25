create or replace function set_character(
  p_user_id uuid,
  p_character text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing text;
begin
  if not is_valid_character(p_character) then
    return json_build_object('ok', false, 'error', '유효하지 않은 캐릭터입니다.');
  end if;

  select "character" into v_existing from users where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;
  if v_existing is not null then
    return json_build_object(
      'ok', false,
      'error', '캐릭터는 한 번 선택하면 변경할 수 없어요.',
      'locked', true
    );
  end if;

  update users set "character" = p_character where id = p_user_id;
  return json_build_object('ok', true, 'character', p_character);
end;
$$;

create or replace function get_profile(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_character text;
  v_ids uuid[];
  v_pet_score int;
  v_cards jsonb;
  v_recomputed int;
  v_center_power int := 0;
  v_pokedex_count int := 0;
  v_pokedex_bonus int := 0;
begin
  select "character", main_card_ids, pet_score, coalesce(pokedex_count, 0)
    into v_character, v_ids, v_pet_score, v_pokedex_count
    from users
   where id = p_user_id;

  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없습니다.');
  end if;

  v_ids := coalesce(v_ids, '{}'::uuid[]);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'card_id', g.card_id,
           'grade', g.grade,
           'rarity', g.rarity,
           'graded_at', g.graded_at
         ) order by array_position(v_ids, g.id)), '[]'::jsonb)
    into v_cards
    from psa_gradings g
   where g.id = any(v_ids)
     and g.user_id = p_user_id
     and g.grade = 10;

  v_recomputed := pet_score_for(v_ids);
  if v_recomputed <> coalesce(v_pet_score, 0) then
    update users set pet_score = v_recomputed where id = p_user_id;
    v_pet_score := v_recomputed;
  end if;

  select coalesce(sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int, 0)
    into v_center_power
    from showcase_cards sc
    join user_showcases us on us.id = sc.showcase_id
    join psa_gradings g2 on g2.id = sc.grading_id
   where us.user_id = p_user_id;

  begin
    v_pokedex_bonus := pokedex_power_bonus(v_pokedex_count);
  exception when undefined_function then
    v_pokedex_bonus := 0;
  end;

  return json_build_object(
    'ok', true,
    'character', v_character,
    'character_locked', v_character is not null,
    'main_card_ids', to_jsonb(v_ids),
    'pet_score', v_pet_score,
    'main_cards', v_cards,
    'center_power', v_center_power + v_pokedex_bonus,
    'pokedex_count', v_pokedex_count,
    'pokedex_bonus', v_pokedex_bonus
  );
end;
$$;

grant execute on function set_character(uuid, text) to anon, authenticated;
grant execute on function get_profile(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

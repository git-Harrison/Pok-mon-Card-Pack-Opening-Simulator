-- ============================================================
-- get_gyms_state v4 — ownership 에 defender_pokemon 추가.
--
-- 사용자 보고: 방어 덱 설정해도 /gym 상세 "관장 포켓몬" 영역이
-- NPC 그대로. 클라가 ownership.has_defense_deck 만 알고, 실제
-- 방어 덱 카드 정보는 모르기 때문.
--
-- 변경:
-- ownership.defender_pokemon — defense_pet_ids 가 셋업돼 있으면
-- 3마리의 (slot, card_id, type, rarity, grade) 배열. 미설정이면 null.
-- 능력치(hp/atk) 는 클라가 카드 카탈로그(slabStats) 로 미리보기 산출.
-- ============================================================

create or replace function get_gyms_state(p_user_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  perform force_cleanup_stale_gym_challenges();

  with gyms_full as (
    select
      g.id, g.name, g.type, g.difficulty, g.leader_name, g.leader_sprite,
      g.location_x, g.location_y, g.min_power, g.display_order,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', p.id, 'slot', p.slot, 'name', p.name, 'type', p.type,
          'dex', p.dex, 'hp', p.hp, 'atk', p.atk, 'def', p.def, 'spd', p.spd
        ) order by p.slot)
         from gym_pokemon p where p.gym_id = g.id),
        '[]'::jsonb
      ) as pokemon,
      (select jsonb_build_object(
        'id', m.id, 'name', m.name, 'type', m.type, 'description', m.description
       ) from gym_medals m where m.gym_id = g.id) as medal,
      (select jsonb_build_object(
        'user_id', o.owner_user_id,
        'display_name', u.display_name,
        'character', u."character",
        'captured_at', o.captured_at,
        'protection_until', o.protection_until,
        'has_defense_deck',
          (o.defense_pet_ids is not null
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3),
        'defender_pokemon',
          case when o.defense_pet_ids is not null
                and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
          then (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'slot', t.idx,
                  'card_id', g2.card_id,
                  'type', o.defense_pet_types[t.idx],
                  'rarity', g2.rarity,
                  'grade', g2.grade
                ) order by t.idx
              ),
              null::jsonb
            )
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            left join psa_gradings g2 on g2.id = t.pid
          )
          else null end
       )
       from gym_ownerships o
       join users u on u.id = o.owner_user_id
       where o.gym_id = g.id) as ownership,
      (select jsonb_build_object(
        'id', c.id,
        'user_id', c.challenger_user_id,
        'display_name', cu.display_name,
        'started_at', c.started_at
       )
       from gym_challenges c
       join users cu on cu.id = c.challenger_user_id
       where c.gym_id = g.id and c.status = 'active'
       limit 1) as active_challenge,
      case
        when p_user_id is null then null
        else (
          select cd.cooldown_until
            from gym_cooldowns cd
           where cd.user_id = p_user_id
             and cd.gym_id = g.id
             and cd.cooldown_until > now()
           limit 1
        )
      end as user_cooldown_until,
      case
        when p_user_id is null then false
        else exists (
          select 1 from user_gym_medals m
           where m.user_id = p_user_id and m.gym_id = g.id
        )
      end as has_my_medal
    from gyms g
  )
  select coalesce(json_agg(row_to_json(g) order by g.display_order), '[]'::json)
    into v_rows
    from gyms_full g;
  return v_rows;
end;
$$;

grant execute on function get_gyms_state(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

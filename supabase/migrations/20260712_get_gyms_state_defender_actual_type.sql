-- ============================================================
-- get_gyms_state.defender_pokemon[].type → 카드의 실제 1차 속성으로 변경.
--
-- 사용자 보고: 방어덱 카드의 1차/2차 속성 배지가 틀리게 보임.
--
-- 원인:
--   20260703 정의에서 'type' 필드를 defense_pet_types[idx] (= gym.type
--   으로 정규화 저장된 값) 로 반환. MUR/UR 가 wild_type_2 매칭으로 등록
--   되면 gym.type 이 카드의 1차가 아닌 2차 속성과 같음.
--   예) MUR 리자몽 (드래곤/비행) 을 비행 체육관 방어덱 등록:
--       defense_pet_types[idx] = "비행"  (= gym.type)
--       card_types.wild_type    = "드래곤"
--       card_types.wild_type_2  = "비행"
--       → 응답: type=비행, wild_type_2=비행 → 비행/비행 중복.
--
-- 변경:
--   'type' 을 card_types.wild_type (카드의 실제 1차) 으로. wild_type_2 는
--   그대로. UI 가 1차+2차 배지 (드래곤/비행) 로 정확히 표시.
--   stale 슬롯 (g2.id is null) 은 fallback 으로 defense_pet_types[idx] 유지
--   (card_types lookup 불가 — 데이터 손상 placeholder 가 어차피 표시됨).
--
-- 매칭 로직 무영향:
--   sameAsGym 판정 = (type=gym.type OR wild_type_2=gym.type) — 이전엔
--   stored type 이 항상 gym.type 이라 자동 true. 새 로직은 카드 실제
--   1차/2차 중 매칭되는 쪽으로 true. 표시상 ★ 마크 / 등록 검증 등 모두
--   정상 동작.
--
-- 20260703 의 이외 부분 (display_hp/display_atk, has_defense_deck 등) 은
-- 그대로 — 본 마이그레이션은 'type' 한 줄만 변경.
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
      coalesce(g.chapter, 1) as chapter,
      (select gdr.money from gym_daily_reward(g.difficulty) gdr) as daily_money,
      (select gdr.rank_pts from gym_daily_reward(g.difficulty) gdr) as daily_rank_pts,
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
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx,
              'grading_id', t.pid,
              'card_id', g2.card_id,
              -- 'type' = 카드의 실제 1차 속성 (card_types.wild_type).
              -- defense_pet_types[idx] (gym.type 으로 정규화된 값) 대신
              -- 사용 → MUR/UR 가 wild_type_2 매칭이면 카드 실제 1차 (다른
              -- 속성) 가 표시됨. 매칭 로직은 type/wild_type_2 OR 검사라 무영향.
              -- stale 슬롯 (g2.id null) 은 데이터 손상 placeholder 라 의미 X
              -- → defense_pet_types[idx] fallback (UI 가 어차피 placeholder).
              'type',
                case when g2.id is null then o.defense_pet_types[t.idx]
                else coalesce(
                  (select ct1.wild_type from card_types ct1
                    where ct1.card_id = g2.card_id),
                  o.defense_pet_types[t.idx]
                ) end,
              'wild_type_2',
                case when g2.id is null then null
                else (select ct2.wild_type_2 from card_types ct2
                       where ct2.card_id = g2.card_id) end,
              'rarity', g2.rarity, 'grade', g2.grade,
              'display_hp',
                case when g2.id is null then null
                else (select ds.hp from gym_defender_display_stats(
                  g2.rarity, g2.grade,
                  o.defense_pet_types[t.idx], g.type) ds) end,
              'display_atk',
                case when g2.id is null then null
                else (select ds.atk from gym_defender_display_stats(
                  g2.rarity, g2.grade,
                  o.defense_pet_types[t.idx], g.type) ds) end
            ) order by t.idx), null::jsonb)
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            left join psa_gradings g2 on g2.id = t.pid
                                       and g2.user_id = o.owner_user_id
                                       and g2.grade = 10
          ) else null end,
        'daily_claimed_today',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else exists (
            select 1 from gym_rewards r
             where r.gym_id = g.id and r.reward_type = 'daily'
               and r.claimed_at > now() - interval '24 hours'
          ) end,
        'daily_next_claim_at',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else (
            select max(r.claimed_at) + interval '24 hours'
              from gym_rewards r
             where r.gym_id = g.id and r.reward_type = 'daily'
               and r.claimed_at > now() - interval '24 hours'
          ) end
       )
       from gym_ownerships o
       join users u on u.id = o.owner_user_id
       where o.gym_id = g.id) as ownership,
      (select jsonb_build_object(
        'id', c.id, 'user_id', c.challenger_user_id,
        'display_name', cu.display_name, 'started_at', c.started_at)
       from gym_challenges c
       join users cu on cu.id = c.challenger_user_id
       where c.gym_id = g.id and c.status = 'active'
       limit 1) as active_challenge,
      case when p_user_id is null then null
      else (select cd.cooldown_until from gym_cooldowns cd
            where cd.user_id = p_user_id and cd.gym_id = g.id
              and cd.cooldown_until > now() limit 1) end as user_cooldown_until,
      case when p_user_id is null then false
      else exists (select 1 from user_gym_medals m
                   where m.user_id = p_user_id and m.gym_id = g.id) end as has_my_medal
    from gyms g
  )
  select coalesce(json_agg(row_to_json(g) order by g.display_order), '[]'::json)
    into v_rows from gyms_full g;
  return v_rows;
end;
$$;

grant execute on function get_gyms_state(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260712_get_gyms_state_defender_actual_type.sql

-- ============================================================
-- get_gyms_state ownership.defender_pokemon 에 grading_id 추가.
--
-- 사용자 시나리오: 방어덱을 이미 설정한 뒤, 펫 슬롯에 같은 속성 PCL10
-- 카드가 없으면 GymDefenseDeckModal 의 풀이 비어 편집 불가. 클라가
-- 기존 방어덱 슬랩 정보를 알아야 풀에 합쳐서 보여주고 편집 가능.
-- defender_pokemon 의 각 row 에 slab uuid (grading_id) 노출.
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
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx,
              'grading_id', t.pid,
              'card_id', g2.card_id,
              'type', o.defense_pet_types[t.idx],
              'rarity', g2.rarity, 'grade', g2.grade
            ) order by t.idx), null::jsonb)
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            left join psa_gradings g2 on g2.id = t.pid
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

-- ============================================================
-- 방어덱 vs 도전자 밸런스 재조정 (사용자 보고: "절대 못 이기는 수치")
--
-- 원인: 직전 20260603 에서 defender ratio ×1.5 + cap 5x, MUR 추가 ×2
-- + cap 10x. 도전자는 cap 1.5x 라 center_power 가 높아도 bonus 가
-- 빠르게 cap 에 걸려 압도적 차이를 못 살림.
--
-- 변경:
--   1) 양쪽 cap 통일 — base ATK 의 5x. 높은 center_power 가 의미 있게
--      반영되도록.
--   2) defender 의 일반(×1.5) ratio 보너스 폐기 — pure 비례 스케일.
--      (center_power 차이가 그대로 결과에 반영)
--   3) MUR defender 만 추가 효율 유지 — ratio ×2, cap 10x. (chase
--      카드의 위협)
--   4) HP bonus 도 cap 5x 통일 (MUR defender 만 10x).
--
-- 결과: center_power 가 큰 쪽이 보통 이김. MUR 이 방어 덱에 들어가면
-- 같은 center_power 라도 강력한 위협이 됨.
-- ============================================================

create or replace function gym_pet_battle_stats(
  p_grading_id uuid,
  p_slot int,
  p_center_power int,
  p_gym_type text,
  p_pet_type text,
  p_is_defender boolean default false
) returns table(
  hp int, atk int, type text, name text, rarity text, grade int, card_id text
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_grading record;
  v_card_name text;
  v_pet_type text;
  v_base_hp int;
  v_base_atk int;
  v_grade_mult numeric;
  v_bonus_ratio numeric;
  v_cap_factor numeric;
  v_bonus int;
  v_atk_bonus int;
  v_hp_bonus int;
  v_final_hp int;
  v_final_atk int;
  v_valid_types constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select g.id, g.card_id, g.grade, g.rarity into v_grading
    from psa_gradings g where g.id = p_grading_id;
  if not found then return; end if;

  v_card_name := v_grading.card_id;
  if p_pet_type = any(v_valid_types) then
    v_pet_type := p_pet_type;
  else
    v_pet_type := '노말';
  end if;

  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_stats(v_grading.rarity) gs;
  v_grade_mult := gym_grade_mult(v_grading.grade);
  v_base_hp := round(v_base_hp * v_grade_mult);
  v_base_atk := round(v_base_atk * v_grade_mult);

  -- 슬롯 별 ratio. 양쪽 동일 — center_power 차이가 그대로 결과로.
  v_bonus_ratio := case p_slot
    when 1 then 0.10
    when 2 then 0.08
    when 3 then 0.06
    else 0
  end;

  -- MUR + 방어 덱 일 때만 추가 효율 (×2 ratio, cap × 2). 그 외는 모두
  -- 동일.
  v_cap_factor := 5.0;
  if p_is_defender and v_grading.rarity = 'MUR' then
    v_bonus_ratio := v_bonus_ratio * 2.0;
    v_cap_factor := 10.0;
  end if;

  v_bonus := round(coalesce(p_center_power, 0) * v_bonus_ratio)::int;
  v_atk_bonus := least(v_bonus, round(v_base_atk * v_cap_factor)::int);
  v_hp_bonus := least(round(v_bonus * 0.5)::int, round(v_base_hp * v_cap_factor)::int);

  v_final_hp := v_base_hp + v_hp_bonus;
  v_final_atk := v_base_atk + v_atk_bonus;

  if v_pet_type = p_gym_type then
    v_final_atk := round(v_final_atk * 1.05)::int;
  end if;

  hp := v_final_hp;
  atk := v_final_atk;
  type := v_pet_type;
  name := v_card_name;
  rarity := v_grading.rarity;
  grade := v_grading.grade;
  card_id := v_grading.card_id;
  return next;
end;
$$;

grant execute on function gym_pet_battle_stats(uuid, int, int, text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

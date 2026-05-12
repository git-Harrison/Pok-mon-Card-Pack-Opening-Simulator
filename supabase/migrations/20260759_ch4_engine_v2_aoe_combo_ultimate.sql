-- ============================================================
-- 체육관 챕터 4 — Engine v2
--
-- 피드백 반영:
--   "보스 광역 시 한 명씩 공격당해 답답하다 — 동시에 맞아야 한다"
--   "힐 스킬이 중복으로 들어가 보스가 너무 쉽게 진다"
--   "연타/필살기 같은 빠른 스킬 / 화려한 스킬도 필요하다"
--
-- 변경 1) AOE 통합:
--   기존: aoe_warn 프레임 1개 + per-slot 'boss_skill' 프레임 N개 (4-5 프레임)
--   변경: 단일 'boss_skill_aoe' 프레임 + targets[]={slot, damage, target_hp, resist}
--
-- 변경 2) 새 kind 추가:
--   ch4_skills.kind 에 'multi_hit', 'ultimate' 허용
--   ch4_boss_skills.kind 에 'multi_hit' 허용
--   target 에 'all_allies' (이미 있음 — heal+ultimate 용) + 'enemy' (이미 있음)
--
-- 변경 3) 힐 너프 (별도 시드에서 처리하지만 엔진은 그대로):
--   role-supporter-heal power 0.30 → 0.15, cd 2 → 3
--   → 20260760 시드에서 적용
--
-- 변경 4) heal target='all_allies' (광역 회복) 처리 신규
-- ============================================================

-- ── kind 제약 완화 (multi_hit, ultimate 추가) ──
alter table ch4_skills drop constraint if exists ch4_skills_kind_check;
alter table ch4_skills add constraint ch4_skills_kind_check
  check (kind in ('attack','heal','buff','debuff','taunt','counter','multi_hit','ultimate'));

alter table ch4_boss_skills drop constraint if exists ch4_boss_skills_kind_check;
alter table ch4_boss_skills add constraint ch4_boss_skills_kind_check
  check (kind in ('single','aoe','debuff','self_heal','self_buff','multi_hit'));

-- ── 엔진 v2 ──
create or replace function resolve_ch4_battle(p_raid_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raid       ch4_raids%rowtype;
  v_boss       ch4_bosses%rowtype;
  v_part_count int;
  v_boss_state jsonb;
  v_parts      jsonb;
  v_frames     jsonb := '[]'::jsonb;
  v_t          int := 0;
  v_round      int := 1;
  v_max_rounds constant int := 50;
  v_result     text := null;
  v_boss_atk_buff numeric := 1.0;
  v_slot           int;
  v_skill_id       text;
  v_pick           text;
  v_skill          ch4_skills%rowtype;
  v_boss_skill     ch4_boss_skills%rowtype;
  v_p              jsonb;
  v_target_slot    int;
  v_target_p       jsonb;
  v_attack_type    text;
  v_type_mult      numeric;
  v_raw_dmg        numeric;
  v_dmg            int;
  v_actor_atk      int;
  v_defender_def   int;
  v_skill_pow      numeric;
  v_player_skill_mul numeric;
  v_crit           boolean;
  v_crit_seed      int;
  v_lowest_hp      int;
  v_lowest_slot    int;
  v_lowest_hp_pct  numeric;
  v_any_alive      boolean;
  v_aggro_slot     int;
  v_aggro_turns    int;
  v_buffs          jsonb;
  v_hp_now         int;
  v_phase          int := 1;
  v_actual_dmg_taken int;
  v_counter_active boolean;
  v_atk_buff_mult  numeric;
  v_def_buff_mult  numeric;
  v_heal_amount    int;
  v_alive_slots    int[];
  v_i              int;
  v_skill_meta     jsonb;
  v_targets_arr    jsonb;
  v_hits           int;
  v_hit_idx        int;
  v_per_hit_dmg    int;
  v_total_dmg      int;
  v_role_dmg_mul   numeric;
begin
  -- Validation
  select * into v_raid from ch4_raids where id = p_raid_id for update;
  if not found then return json_build_object('ok', false, 'error', '레이드를 찾을 수 없어요.'); end if;
  if v_raid.status <> 'waiting' then return json_build_object('ok', false, 'error', '이미 진행됐거나 종료된 레이드예요.'); end if;
  select count(*) into v_part_count from ch4_raid_participants where raid_id = p_raid_id;
  if v_part_count <> 3 then return json_build_object('ok', false, 'error', '참가자 3명이 모여야 시작할 수 있어요.'); end if;

  update ch4_raids set status = 'resolving' where id = p_raid_id;
  select * into v_boss from ch4_bosses where id = v_raid.boss_id;

  v_boss_state := jsonb_build_object(
    'id', v_boss.id, 'name', v_boss.name,
    'max_hp', v_boss.base_hp, 'hp', v_boss.base_hp,
    'atk', v_boss.base_atk, 'def', v_boss.base_def,
    'types', to_jsonb(v_boss.types), 'weak_to', to_jsonb(v_boss.weak_to),
    'phase', 1, 'alive', true,
    'buffs', '[]'::jsonb, 'debuffs', '[]'::jsonb,
    'cooldowns', '{}'::jsonb,
    'aggro_slot', null, 'aggro_turns', 0
  );

  with parts_raw as (
    select p.slot, p.user_id, p.role,
           p.starter_snapshot->>'species'                          as species,
           starter_species_type(p.starter_snapshot->>'species')    as species_type,
           (p.starter_snapshot->>'level')::int                     as level,
           coalesce((p.starter_snapshot->>'evolution_stage')::int, 0) as stage,
           p.skill_loadout,
           p.hp_scale, p.atk_scale, p.skill_mul,
           p.starter_snapshot->>'nickname'                         as nickname,
           u.user_id as username
      from ch4_raid_participants p
      join users u on u.id = p.user_id
     where p.raid_id = p_raid_id
     order by p.slot
  )
  select jsonb_agg(
    jsonb_build_object(
      'slot', slot, 'user_id', user_id, 'username', username, 'role', role,
      'species', species, 'species_type', species_type, 'nickname', nickname,
      'level', level, 'stage', stage,
      'max_hp', floor((50000 + level * 2000 + stage * 20000) * hp_scale
                * case role when 'tank' then 1.6 when 'dealer' then 0.8 else 1.0 end)::int,
      'hp',     floor((50000 + level * 2000 + stage * 20000) * hp_scale
                * case role when 'tank' then 1.6 when 'dealer' then 0.8 else 1.0 end)::int,
      'atk',    floor((200 + level * 30 + stage * 200) * atk_scale
                * case role when 'tank' then 0.7 when 'dealer' then 1.5 else 0.8 end)::int,
      'skill_mul', skill_mul,
      'loadout', to_jsonb(skill_loadout),
      'alive', true,
      'buffs', '[]'::jsonb, 'debuffs', '[]'::jsonb,
      'cooldowns', '{}'::jsonb
    ) order by slot
  ) into v_parts from parts_raw;

  v_frames := v_frames || jsonb_build_array(jsonb_build_object(
    't', v_t, 'type', 'battle_start',
    'boss', v_boss_state, 'participants', v_parts
  ));
  v_t := v_t + 1;

  -- ════════════════════════════════════════════
  while v_round <= v_max_rounds and v_result is null loop
    v_frames := v_frames || jsonb_build_array(jsonb_build_object(
      't', v_t, 'type', 'turn_start', 'round', v_round, 'phase', v_phase
    ));
    v_t := v_t + 1;

    for v_slot in 1..3 loop
      v_p := v_parts->(v_slot - 1);
      if not (v_p->>'alive')::boolean then continue; end if;
      if not (v_boss_state->>'alive')::boolean then exit; end if;

      ----- ① 스킬 선정 (역할별 AI) -----
      v_pick := null;

      if v_p->>'role' = 'tank' then
        -- 도발 → 방어 → 카운터 → ultimate → multi_hit → 강타(fallback)
        if exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-tank-taunt')
           and coalesce((v_p->'cooldowns'->>'role-tank-taunt')::int, 0) = 0
           and (coalesce((v_boss_state->>'aggro_turns')::int, 0) = 0
                or (v_boss_state->>'aggro_slot') is null) then
          v_pick := 'role-tank-taunt';
        end if;
        if v_pick is null
           and exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-tank-defense')
           and coalesce((v_p->'cooldowns'->>'role-tank-defense')::int, 0) = 0
           and (v_p->>'hp')::int < (v_p->>'max_hp')::int / 2 then
          v_pick := 'role-tank-defense';
        end if;
        if v_pick is null
           and exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-tank-counter')
           and coalesce((v_p->'cooldowns'->>'role-tank-counter')::int, 0) = 0 then
          v_pick := 'role-tank-counter';
        end if;
        -- ultimate: cd ready 시 항상 시전 (높은 우선순위)
        if v_pick is null then
          select id into v_pick from ch4_skills
           where id in (select jsonb_array_elements_text(v_p->'loadout'))
             and kind = 'ultimate'
             and coalesce((v_p->'cooldowns'->>id)::int, 0) = 0
           limit 1;
        end if;
        -- multi_hit > attack(power desc) — multi_hit 우선
        if v_pick is null then
          select id into v_pick from ch4_skills
           where id in (select jsonb_array_elements_text(v_p->'loadout'))
             and kind in ('multi_hit','attack')
             and coalesce((v_p->'cooldowns'->>id)::int, 0) = 0
           order by case kind when 'multi_hit' then 0 else 1 end, power desc
           limit 1;
        end if;

      elsif v_p->>'role' = 'dealer' then
        -- ultimate(cd ready 시 최우선) → 시그 → 일반공격(power desc)
        if v_pick is null then
          select id into v_pick from ch4_skills
           where id in (select jsonb_array_elements_text(v_p->'loadout'))
             and kind = 'ultimate'
             and coalesce((v_p->'cooldowns'->>id)::int, 0) = 0
           limit 1;
        end if;
        if v_pick is null then
          select id into v_pick from ch4_skills
           where id in (select jsonb_array_elements_text(v_p->'loadout'))
             and scope = 'species'
             and coalesce((v_p->'cooldowns'->>id)::int, 0) = 0
           order by power desc limit 1;
        end if;
        if v_pick is null then
          select id into v_pick from ch4_skills
           where id in (select jsonb_array_elements_text(v_p->'loadout'))
             and kind in ('attack','multi_hit')
             and coalesce((v_p->'cooldowns'->>id)::int, 0) = 0
           order by case kind when 'multi_hit' then 0 else 1 end, ai_priority desc, power desc
           limit 1;
        end if;

      elsif v_p->>'role' = 'supporter' then
        -- ultimate(아군 1명 이상 HP<50%) → mass_heal(HP<60% 평균) → 회복(저체력) → 디스펠 → 공격버프 → 일반공격
        if exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-supporter-ultimate')
           and coalesce((v_p->'cooldowns'->>'role-supporter-ultimate')::int, 0) = 0 then
          -- 아군 1명 이상 HP < 50%
          if exists (
            select 1 from generate_series(0,2) i
            where (v_parts->i->>'alive')::boolean
              and (v_parts->i->>'hp')::numeric / (v_parts->i->>'max_hp')::numeric < 0.5
          ) then
            v_pick := 'role-supporter-ultimate';
          end if;
        end if;
        if v_pick is null then
          v_lowest_hp_pct := 1.0;
          for v_i in 0..2 loop
            if (v_parts->v_i->>'alive')::boolean then
              v_lowest_hp_pct := least(v_lowest_hp_pct,
                (v_parts->v_i->>'hp')::numeric / (v_parts->v_i->>'max_hp')::numeric);
            end if;
          end loop;
          -- 광역회복 (둘 이상 HP<70%)
          if exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-supporter-mass-heal')
             and coalesce((v_p->'cooldowns'->>'role-supporter-mass-heal')::int, 0) = 0
             and (select count(*) from generate_series(0,2) i
                  where (v_parts->i->>'alive')::boolean
                    and (v_parts->i->>'hp')::numeric / (v_parts->i->>'max_hp')::numeric < 0.7) >= 2 then
            v_pick := 'role-supporter-mass-heal';
          end if;
          -- 단일 회복 (저체력)
          if v_pick is null
             and exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-supporter-heal')
             and coalesce((v_p->'cooldowns'->>'role-supporter-heal')::int, 0) = 0
             and v_lowest_hp_pct < 0.65 then
            v_pick := 'role-supporter-heal';
          end if;
        end if;
        if v_pick is null
           and exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-supporter-dispel')
           and coalesce((v_p->'cooldowns'->>'role-supporter-dispel')::int, 0) = 0
           and jsonb_array_length(v_boss_state->'buffs') > 0 then
          v_pick := 'role-supporter-dispel';
        end if;
        if v_pick is null
           and exists (select 1 from jsonb_array_elements_text(v_p->'loadout') l where l = 'role-supporter-buff')
           and coalesce((v_p->'cooldowns'->>'role-supporter-buff')::int, 0) = 0 then
          v_pick := 'role-supporter-buff';
        end if;
        -- fallback: 일반 공격(있으면) → 종 시그
        if v_pick is null then
          select id into v_pick from ch4_skills
           where id in (select jsonb_array_elements_text(v_p->'loadout'))
             and kind = 'attack'
             and coalesce((v_p->'cooldowns'->>id)::int, 0) = 0
           order by power desc limit 1;
        end if;
        if v_pick is null then
          select id into v_pick from ch4_skills
           where id in (select jsonb_array_elements_text(v_p->'loadout'))
             and scope = 'species'
             and coalesce((v_p->'cooldowns'->>id)::int, 0) = 0
           order by power desc limit 1;
        end if;
      end if;

      if v_pick is null then
        v_frames := v_frames || jsonb_build_array(jsonb_build_object(
          't', v_t, 'type', 'skip', 'actor', 'slot' || v_slot, 'round', v_round
        ));
        v_t := v_t + 1;
        continue;
      end if;

      select * into v_skill from ch4_skills where id = v_pick;

      v_skill_meta := jsonb_build_object(
        'template',     v_skill.fx_template,
        'color',        v_skill.fx_color,
        'color_2',      v_skill.fx_color_secondary,
        'intensity',    v_skill.fx_intensity,
        'duration_ms',  v_skill.fx_duration_ms,
        'shake',        v_skill.fx_shake,
        'zoom',         v_skill.fx_zoom,
        'text_style',   v_skill.fx_text_style,
        'fullscreen',   case when v_skill.kind = 'ultimate' then true else false end,
        'role',         v_p->>'role'
      );

      if v_skill.kind in ('attack','ultimate') then
        v_attack_type := case when v_skill.scope = 'species' then v_p->>'species_type' else null end;
        v_type_mult := 1.0;
        if v_attack_type is not null then
          if v_attack_type = any(v_boss.weak_to) then v_type_mult := 1.5;
          elsif v_attack_type = any(v_boss.types) then v_type_mult := 0.5;
          end if;
        end if;
        v_atk_buff_mult := 1.0;
        for v_i in 0 .. jsonb_array_length(v_p->'buffs') - 1 loop
          if v_p->'buffs'->v_i->>'kind' = 'atk_buff' then
            v_atk_buff_mult := v_atk_buff_mult * (1.0 + (v_p->'buffs'->v_i->>'value')::numeric);
          end if;
        end loop;
        v_crit := false;
        if v_p->>'role' = 'dealer' or v_skill.kind = 'ultimate' then
          v_crit_seed := abs(hashtext(p_raid_id::text || v_round::text || v_slot::text || v_pick)) % 100;
          if v_skill.kind = 'ultimate' or v_crit_seed < 20 then v_crit := true; end if;
        end if;
        v_actor_atk := (v_p->>'atk')::int;
        v_skill_pow := v_skill.power;
        v_player_skill_mul := (v_p->>'skill_mul')::numeric;
        v_defender_def := (v_boss_state->>'def')::int;
        v_raw_dmg := v_actor_atk * v_skill_pow * v_player_skill_mul * v_type_mult * v_atk_buff_mult;
        if v_crit then v_raw_dmg := v_raw_dmg * 1.5; end if;
        v_dmg := greatest(1, floor(v_raw_dmg - v_defender_def)::int);
        v_hp_now := greatest(0, (v_boss_state->>'hp')::int - v_dmg);
        v_boss_state := jsonb_set(v_boss_state, '{hp}', to_jsonb(v_hp_now));
        if v_hp_now = 0 then v_boss_state := jsonb_set(v_boss_state, '{alive}', 'false'::jsonb); end if;

        v_frames := v_frames || jsonb_build_array(jsonb_build_object(
          't', v_t, 'type', 'skill',
          'actor', 'slot' || v_slot, 'target', 'boss',
          'skill_id', v_skill.id, 'skill_name', v_skill.name,
          'kind', v_skill.kind, 'damage', v_dmg, 'crit', v_crit,
          'weakness', v_type_mult > 1.0, 'resist', v_type_mult < 1.0,
          'fx', v_skill_meta, 'boss_hp', v_hp_now,
          'targets', jsonb_build_array(jsonb_build_object(
            'target','boss','damage',v_dmg,'target_hp',v_hp_now,
            'crit',v_crit,'weakness',v_type_mult>1.0,'resist',v_type_mult<1.0))
        ));
        v_t := v_t + 1;

      elsif v_skill.kind = 'multi_hit' then
        v_hits := greatest(2, coalesce(v_skill.duration_turns, 3));  -- hits 수는 duration_turns 재활용
        v_attack_type := case when v_skill.scope = 'species' then v_p->>'species_type' else null end;
        v_type_mult := 1.0;
        if v_attack_type is not null then
          if v_attack_type = any(v_boss.weak_to) then v_type_mult := 1.5;
          elsif v_attack_type = any(v_boss.types) then v_type_mult := 0.5;
          end if;
        end if;
        v_actor_atk := (v_p->>'atk')::int;
        v_player_skill_mul := (v_p->>'skill_mul')::numeric;
        v_defender_def := (v_boss_state->>'def')::int;
        v_raw_dmg := v_actor_atk * v_skill.power * v_player_skill_mul * v_type_mult;
        v_per_hit_dmg := greatest(1, floor(v_raw_dmg - v_defender_def)::int);
        v_total_dmg := 0;
        v_targets_arr := '[]'::jsonb;
        for v_hit_idx in 1..v_hits loop
          v_total_dmg := v_total_dmg + v_per_hit_dmg;
          v_hp_now := greatest(0, (v_boss_state->>'hp')::int - v_per_hit_dmg);
          v_boss_state := jsonb_set(v_boss_state, '{hp}', to_jsonb(v_hp_now));
          v_targets_arr := v_targets_arr || jsonb_build_array(jsonb_build_object(
            'target','boss','damage',v_per_hit_dmg,'target_hp',v_hp_now,'hit_index',v_hit_idx));
          if v_hp_now = 0 then
            v_boss_state := jsonb_set(v_boss_state, '{alive}', 'false'::jsonb);
            exit;
          end if;
        end loop;
        v_frames := v_frames || jsonb_build_array(jsonb_build_object(
          't', v_t, 'type', 'skill',
          'actor', 'slot' || v_slot, 'target', 'boss',
          'skill_id', v_skill.id, 'skill_name', v_skill.name,
          'kind', 'multi_hit', 'hits', v_hits, 'damage', v_total_dmg,
          'weakness', v_type_mult > 1.0, 'resist', v_type_mult < 1.0,
          'fx', v_skill_meta, 'boss_hp', (v_boss_state->>'hp')::int,
          'targets', v_targets_arr
        ));
        v_t := v_t + 1;

      elsif v_skill.kind = 'heal' then
        if v_skill.target = 'all_allies' then
          -- 광역회복: 살아있는 모든 ally
          v_targets_arr := '[]'::jsonb;
          for v_i in 0..2 loop
            if (v_parts->v_i->>'alive')::boolean then
              v_heal_amount := floor((v_parts->v_i->>'max_hp')::int * v_skill.power)::int;
              v_hp_now := least((v_parts->v_i->>'max_hp')::int,
                (v_parts->v_i->>'hp')::int + v_heal_amount);
              v_parts := jsonb_set(v_parts, array[v_i::text, 'hp'], to_jsonb(v_hp_now));
              v_targets_arr := v_targets_arr || jsonb_build_array(jsonb_build_object(
                'target', 'slot' || ((v_parts->v_i->>'slot')::int),
                'heal', v_heal_amount, 'target_hp', v_hp_now));
            end if;
          end loop;
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'skill', 'actor', 'slot' || v_slot, 'target', 'all_allies',
            'skill_id', v_skill.id, 'skill_name', v_skill.name, 'kind', 'heal_all',
            'fx', v_skill_meta, 'targets', v_targets_arr
          ));
          v_t := v_t + 1;
        else
          v_lowest_hp_pct := 2.0; v_lowest_slot := v_slot;
          for v_i in 0..2 loop
            if (v_parts->v_i->>'alive')::boolean then
              if (v_parts->v_i->>'hp')::numeric / (v_parts->v_i->>'max_hp')::numeric < v_lowest_hp_pct then
                v_lowest_hp_pct := (v_parts->v_i->>'hp')::numeric / (v_parts->v_i->>'max_hp')::numeric;
                v_lowest_slot := (v_parts->v_i->>'slot')::int;
              end if;
            end if;
          end loop;
          v_target_p := v_parts->(v_lowest_slot - 1);
          v_heal_amount := floor((v_target_p->>'max_hp')::int * v_skill.power)::int;
          v_hp_now := least((v_target_p->>'max_hp')::int, (v_target_p->>'hp')::int + v_heal_amount);
          v_parts := jsonb_set(v_parts, array[(v_lowest_slot - 1)::text, 'hp'], to_jsonb(v_hp_now));
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'skill', 'actor', 'slot' || v_slot, 'target', 'slot' || v_lowest_slot,
            'skill_id', v_skill.id, 'skill_name', v_skill.name, 'kind', 'heal',
            'heal', v_heal_amount, 'target_hp', v_hp_now, 'fx', v_skill_meta,
            'targets', jsonb_build_array(jsonb_build_object(
              'target', 'slot' || v_lowest_slot, 'heal', v_heal_amount, 'target_hp', v_hp_now))
          ));
          v_t := v_t + 1;
        end if;

      elsif v_skill.kind = 'buff' then
        if v_skill.target = 'self' then
          v_buffs := v_p->'buffs' || jsonb_build_array(jsonb_build_object(
            'kind', 'def_up', 'value', 0.5, 'turns', v_skill.duration_turns
          ));
          v_parts := jsonb_set(v_parts, array[(v_slot - 1)::text, 'buffs'], v_buffs);
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'skill', 'actor', 'slot' || v_slot, 'target', 'slot' || v_slot,
            'skill_id', v_skill.id, 'skill_name', v_skill.name, 'kind', 'buff',
            'effect', jsonb_build_object('kind','def_up','value',0.5,'turns',v_skill.duration_turns),
            'fx', v_skill_meta
          ));
          v_t := v_t + 1;
        elsif v_skill.target = 'all_allies' then
          v_targets_arr := '[]'::jsonb;
          for v_i in 0..2 loop
            if (v_parts->v_i->>'alive')::boolean then
              v_buffs := v_parts->v_i->'buffs' || jsonb_build_array(jsonb_build_object(
                'kind', 'atk_buff', 'value', 0.3, 'turns', v_skill.duration_turns
              ));
              v_parts := jsonb_set(v_parts, array[v_i::text, 'buffs'], v_buffs);
              v_targets_arr := v_targets_arr || jsonb_build_array(jsonb_build_object(
                'target', 'slot' || ((v_parts->v_i->>'slot')::int)));
            end if;
          end loop;
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'skill', 'actor', 'slot' || v_slot, 'target', 'all_allies',
            'skill_id', v_skill.id, 'skill_name', v_skill.name, 'kind', 'buff',
            'effect', jsonb_build_object('kind','atk_buff','value',0.3,'turns',v_skill.duration_turns),
            'fx', v_skill_meta, 'targets', v_targets_arr
          ));
          v_t := v_t + 1;
        end if;

      elsif v_skill.kind = 'taunt' then
        v_boss_state := jsonb_set(v_boss_state, '{aggro_slot}', to_jsonb(v_slot));
        v_boss_state := jsonb_set(v_boss_state, '{aggro_turns}', to_jsonb(v_skill.duration_turns));
        v_frames := v_frames || jsonb_build_array(jsonb_build_object(
          't', v_t, 'type', 'skill', 'actor', 'slot' || v_slot, 'target', 'boss',
          'skill_id', v_skill.id, 'skill_name', v_skill.name, 'kind', 'taunt',
          'effect', jsonb_build_object('aggro_slot', v_slot, 'turns', v_skill.duration_turns),
          'fx', v_skill_meta
        ));
        v_t := v_t + 1;

      elsif v_skill.kind = 'counter' then
        v_buffs := v_p->'buffs' || jsonb_build_array(jsonb_build_object(
          'kind', 'counter', 'value', 0.3, 'turns', v_skill.duration_turns
        ));
        v_parts := jsonb_set(v_parts, array[(v_slot - 1)::text, 'buffs'], v_buffs);
        v_frames := v_frames || jsonb_build_array(jsonb_build_object(
          't', v_t, 'type', 'skill', 'actor', 'slot' || v_slot, 'target', 'slot' || v_slot,
          'skill_id', v_skill.id, 'skill_name', v_skill.name, 'kind', 'counter',
          'effect', jsonb_build_object('kind','counter','value',0.3,'turns',v_skill.duration_turns),
          'fx', v_skill_meta
        ));
        v_t := v_t + 1;

      elsif v_skill.kind = 'debuff' and v_skill.target = 'enemy_buffs' then
        v_boss_state := jsonb_set(v_boss_state, '{buffs}', '[]'::jsonb);
        v_frames := v_frames || jsonb_build_array(jsonb_build_object(
          't', v_t, 'type', 'skill', 'actor', 'slot' || v_slot, 'target', 'boss',
          'skill_id', v_skill.id, 'skill_name', v_skill.name, 'kind', 'dispel',
          'fx', v_skill_meta
        ));
        v_t := v_t + 1;
      end if;

      if v_skill.cooldown_turns > 0 then
        v_parts := jsonb_set(
          v_parts, array[(v_slot - 1)::text, 'cooldowns', v_skill.id],
          to_jsonb(v_skill.cooldown_turns)
        );
      end if;
    end loop;

    -- 페이즈 전환
    if v_boss.phase_switch_hp_ratio is not null
       and v_phase = 1
       and (v_boss_state->>'alive')::boolean
       and (v_boss_state->>'hp')::int < v_boss.phase_switch_hp_ratio * (v_boss_state->>'max_hp')::int
    then
      v_phase := 2;
      v_boss_state := jsonb_set(v_boss_state, '{phase}', '2'::jsonb);
      v_boss_atk_buff := 1.5;
      v_frames := v_frames || jsonb_build_array(jsonb_build_object(
        't', v_t, 'type', 'phase_transition', 'round', v_round, 'phase', 2,
        'boss_hp', (v_boss_state->>'hp')::int
      ));
      v_t := v_t + 1;
    end if;

    -- ── 보스 행동 ──
    if (v_boss_state->>'alive')::boolean then
      v_alive_slots := array[]::int[];
      for v_i in 0..2 loop
        if (v_parts->v_i->>'alive')::boolean then
          v_alive_slots := v_alive_slots || ((v_parts->v_i->>'slot')::int);
        end if;
      end loop;

      if array_length(v_alive_slots, 1) is not null then
        select id into v_pick from ch4_boss_skills
         where boss_id = v_boss.id
           and (requires_phase = 0 or requires_phase <= v_phase)
           and coalesce((v_boss_state->'cooldowns'->>id)::int, 0) = 0
         order by ai_priority desc, id limit 1;
        if v_pick is null then
          select id into v_pick from ch4_boss_skills
           where boss_id = v_boss.id and requires_phase = 0
           order by ai_priority asc limit 1;
        end if;
        select * into v_boss_skill from ch4_boss_skills where id = v_pick;
        v_skill_meta := jsonb_build_object(
          'template', v_boss_skill.fx_template, 'color', v_boss_skill.fx_color,
          'color_2', v_boss_skill.fx_color_secondary, 'intensity', v_boss_skill.fx_intensity,
          'duration_ms', v_boss_skill.fx_duration_ms, 'shake', v_boss_skill.fx_shake,
          'vignette', v_boss_skill.fx_vignette_color, 'zoom', v_boss_skill.fx_zoom,
          'text_style', v_boss_skill.fx_text_style
        );

        if v_boss_skill.kind = 'single' then
          v_target_slot := null;
          if (v_boss_state->>'aggro_slot') is not null and (v_boss_state->>'aggro_turns')::int > 0 then
            v_i := (v_boss_state->>'aggro_slot')::int;
            if (v_parts->(v_i - 1)->>'alive')::boolean then v_target_slot := v_i; end if;
          end if;
          if v_target_slot is null then
            v_lowest_hp := 2147483647; v_target_slot := v_alive_slots[1];
            for v_i in 0..2 loop
              if (v_parts->v_i->>'alive')::boolean and (v_parts->v_i->>'hp')::int < v_lowest_hp then
                v_lowest_hp := (v_parts->v_i->>'hp')::int;
                v_target_slot := (v_parts->v_i->>'slot')::int;
              end if;
            end loop;
          end if;
          v_target_p := v_parts->(v_target_slot - 1);
          v_attack_type := v_boss.types[1];
          v_type_mult := 1.0;
          if v_target_p->>'species_type' is not null and v_target_p->>'species_type' = v_attack_type then
            v_type_mult := 0.5;
          end if;
          v_def_buff_mult := 1.0; v_counter_active := false;
          for v_i in 0 .. jsonb_array_length(v_target_p->'buffs') - 1 loop
            if v_target_p->'buffs'->v_i->>'kind' = 'def_up' then
              v_def_buff_mult := v_def_buff_mult * (1.0 - (v_target_p->'buffs'->v_i->>'value')::numeric);
            elsif v_target_p->'buffs'->v_i->>'kind' = 'counter' then v_counter_active := true; end if;
          end loop;
          -- 역할별 데미지 보정: tank 80%, dealer 110%, supporter 100%
          v_role_dmg_mul := case v_target_p->>'role' when 'tank' then 0.80 when 'dealer' then 1.10 else 1.00 end;
          v_raw_dmg := (v_boss_state->>'atk')::int * v_boss_skill.power * v_type_mult * v_boss_atk_buff * v_def_buff_mult * v_role_dmg_mul;
          v_dmg := greatest(1, floor(v_raw_dmg)::int);
          v_hp_now := greatest(0, (v_target_p->>'hp')::int - v_dmg);
          v_parts := jsonb_set(v_parts, array[(v_target_slot - 1)::text, 'hp'], to_jsonb(v_hp_now));
          if v_hp_now = 0 then
            v_parts := jsonb_set(v_parts, array[(v_target_slot - 1)::text, 'alive'], 'false'::jsonb);
          end if;
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'boss_skill', 'actor', 'boss',
            'target', 'slot' || v_target_slot,
            'skill_id', v_boss_skill.id, 'skill_name', v_boss_skill.name,
            'kind', 'single', 'damage', v_dmg, 'weakness', false, 'resist', v_type_mult < 1.0,
            'fx', v_skill_meta, 'target_hp', v_hp_now,
            'targets', jsonb_build_array(jsonb_build_object(
              'target','slot' || v_target_slot, 'damage', v_dmg, 'target_hp', v_hp_now,
              'resist', v_type_mult < 1.0))
          ));
          v_t := v_t + 1;
          if v_counter_active and (v_target_p->>'alive')::boolean then
            v_actual_dmg_taken := floor(v_dmg * 0.3)::int;
            v_hp_now := greatest(0, (v_boss_state->>'hp')::int - v_actual_dmg_taken);
            v_boss_state := jsonb_set(v_boss_state, '{hp}', to_jsonb(v_hp_now));
            if v_hp_now = 0 then v_boss_state := jsonb_set(v_boss_state, '{alive}', 'false'::jsonb); end if;
            v_frames := v_frames || jsonb_build_array(jsonb_build_object(
              't', v_t, 'type', 'counter_reflect',
              'actor', 'slot' || v_target_slot, 'target', 'boss',
              'damage', v_actual_dmg_taken, 'boss_hp', v_hp_now
            ));
            v_t := v_t + 1;
          end if;

        elsif v_boss_skill.kind = 'aoe' then
          -- ★ 통합 AOE: 단일 프레임에 targets[]
          v_attack_type := v_boss.types[1];
          v_targets_arr := '[]'::jsonb;
          for v_i in 0..2 loop
            if not (v_parts->v_i->>'alive')::boolean then continue; end if;
            v_target_p := v_parts->v_i;
            v_type_mult := 1.0;
            if v_target_p->>'species_type' is not null and v_target_p->>'species_type' = v_attack_type then
              v_type_mult := 0.5;
            end if;
            v_def_buff_mult := 1.0;
            declare j int; begin
              for j in 0 .. jsonb_array_length(v_target_p->'buffs') - 1 loop
                if v_target_p->'buffs'->j->>'kind' = 'def_up' then
                  v_def_buff_mult := v_def_buff_mult * (1.0 - (v_target_p->'buffs'->j->>'value')::numeric);
                end if;
              end loop;
            end;
            -- 역할별 AOE 데미지 변화: tank 75%, dealer 120%, supporter 105%
            v_role_dmg_mul := case v_target_p->>'role' when 'tank' then 0.75 when 'dealer' then 1.20 else 1.05 end;
            v_raw_dmg := (v_boss_state->>'atk')::int * v_boss_skill.power * v_type_mult * v_boss_atk_buff * v_def_buff_mult * v_role_dmg_mul;
            v_dmg := greatest(1, floor(v_raw_dmg)::int);
            v_hp_now := greatest(0, (v_target_p->>'hp')::int - v_dmg);
            v_parts := jsonb_set(v_parts, array[v_i::text, 'hp'], to_jsonb(v_hp_now));
            if v_hp_now = 0 then v_parts := jsonb_set(v_parts, array[v_i::text, 'alive'], 'false'::jsonb); end if;
            v_targets_arr := v_targets_arr || jsonb_build_array(jsonb_build_object(
              'target', 'slot' || ((v_target_p->>'slot')::int),
              'damage', v_dmg, 'target_hp', v_hp_now, 'resist', v_type_mult < 1.0,
              'role', v_target_p->>'role'
            ));
          end loop;
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'boss_skill', 'actor', 'boss', 'target', 'all_allies',
            'skill_id', v_boss_skill.id, 'skill_name', v_boss_skill.name,
            'kind', 'aoe', 'fx', v_skill_meta, 'targets', v_targets_arr
          ));
          v_t := v_t + 1;

        elsif v_boss_skill.kind = 'multi_hit' then
          -- 보스 연타: HP 최저 대상 N회 타격
          v_hits := greatest(2, coalesce(v_boss_skill.cooldown_turns, 3));
          v_lowest_hp := 2147483647; v_target_slot := v_alive_slots[1];
          for v_i in 0..2 loop
            if (v_parts->v_i->>'alive')::boolean and (v_parts->v_i->>'hp')::int < v_lowest_hp then
              v_lowest_hp := (v_parts->v_i->>'hp')::int;
              v_target_slot := (v_parts->v_i->>'slot')::int;
            end if;
          end loop;
          v_target_p := v_parts->(v_target_slot - 1);
          v_role_dmg_mul := case v_target_p->>'role' when 'tank' then 0.8 when 'dealer' then 1.1 else 1.0 end;
          v_per_hit_dmg := greatest(1, floor((v_boss_state->>'atk')::int * v_boss_skill.power * v_boss_atk_buff * v_role_dmg_mul / v_hits)::int);
          v_total_dmg := 0;
          v_targets_arr := '[]'::jsonb;
          for v_hit_idx in 1..v_hits loop
            v_total_dmg := v_total_dmg + v_per_hit_dmg;
            v_hp_now := greatest(0, (v_target_p->>'hp')::int - v_total_dmg);
            v_targets_arr := v_targets_arr || jsonb_build_array(jsonb_build_object(
              'target', 'slot' || v_target_slot, 'damage', v_per_hit_dmg, 'target_hp', v_hp_now,
              'hit_index', v_hit_idx));
            if v_hp_now = 0 then exit; end if;
          end loop;
          v_parts := jsonb_set(v_parts, array[(v_target_slot - 1)::text, 'hp'], to_jsonb(v_hp_now));
          if v_hp_now = 0 then
            v_parts := jsonb_set(v_parts, array[(v_target_slot - 1)::text, 'alive'], 'false'::jsonb);
          end if;
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'boss_skill', 'actor', 'boss',
            'target', 'slot' || v_target_slot,
            'skill_id', v_boss_skill.id, 'skill_name', v_boss_skill.name,
            'kind', 'multi_hit', 'hits', v_hits, 'damage', v_total_dmg,
            'fx', v_skill_meta, 'targets', v_targets_arr
          ));
          v_t := v_t + 1;

        elsif v_boss_skill.kind = 'self_heal' then
          v_heal_amount := floor((v_boss_state->>'max_hp')::int * v_boss_skill.power)::int;
          v_hp_now := least((v_boss_state->>'max_hp')::int, (v_boss_state->>'hp')::int + v_heal_amount);
          v_boss_state := jsonb_set(v_boss_state, '{hp}', to_jsonb(v_hp_now));
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'boss_skill', 'actor', 'boss', 'target', 'boss',
            'skill_id', v_boss_skill.id, 'skill_name', v_boss_skill.name,
            'kind', 'self_heal', 'heal', v_heal_amount,
            'boss_hp', v_hp_now, 'fx', v_skill_meta
          ));
          v_t := v_t + 1;

        elsif v_boss_skill.kind = 'self_buff' then
          v_boss_state := jsonb_set(v_boss_state, '{buffs}',
            v_boss_state->'buffs' || jsonb_build_array(jsonb_build_object(
              'kind', 'atk_up', 'value', v_boss_skill.power, 'turns', 3
            )));
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'boss_skill', 'actor', 'boss', 'target', 'boss',
            'skill_id', v_boss_skill.id, 'skill_name', v_boss_skill.name,
            'kind', 'self_buff',
            'effect', jsonb_build_object('kind','atk_up','value',v_boss_skill.power,'turns',3),
            'fx', v_skill_meta
          ));
          v_t := v_t + 1;

        elsif v_boss_skill.kind = 'debuff' then
          v_targets_arr := '[]'::jsonb;
          for v_i in 0..2 loop
            if (v_parts->v_i->>'alive')::boolean then
              v_buffs := v_parts->v_i->'debuffs' || jsonb_build_array(jsonb_build_object(
                'kind','atk_down','value',0.3,'turns',2
              ));
              v_parts := jsonb_set(v_parts, array[v_i::text, 'debuffs'], v_buffs);
              v_targets_arr := v_targets_arr || jsonb_build_array(jsonb_build_object(
                'target','slot' || ((v_parts->v_i->>'slot')::int)));
            end if;
          end loop;
          v_frames := v_frames || jsonb_build_array(jsonb_build_object(
            't', v_t, 'type', 'boss_skill', 'actor', 'boss', 'target', 'all_allies',
            'skill_id', v_boss_skill.id, 'skill_name', v_boss_skill.name,
            'kind', 'debuff',
            'effect', jsonb_build_object('kind','atk_down','value',0.3,'turns',2),
            'fx', v_skill_meta, 'targets', v_targets_arr
          ));
          v_t := v_t + 1;
        end if;

        if v_boss_skill.cooldown_turns > 0 then
          v_boss_state := jsonb_set(
            v_boss_state, array['cooldowns', v_boss_skill.id],
            to_jsonb(v_boss_skill.cooldown_turns)
          );
        end if;
      end if;
    end if;

    if not (v_boss_state->>'alive')::boolean then v_result := 'win';
    else
      v_any_alive := false;
      for v_i in 0..2 loop if (v_parts->v_i->>'alive')::boolean then v_any_alive := true; exit; end if; end loop;
      if not v_any_alive then v_result := 'loss'; end if;
    end if;
    if v_result is not null then exit; end if;

    -- cd/buff tick
    declare v_new_cd jsonb := '{}'::jsonb; v_k text; v_v int; begin
      for v_k in select jsonb_object_keys(v_boss_state->'cooldowns') loop
        v_v := (v_boss_state->'cooldowns'->>v_k)::int - 1;
        if v_v > 0 then v_new_cd := jsonb_set(v_new_cd, array[v_k], to_jsonb(v_v)); end if;
      end loop;
      v_boss_state := jsonb_set(v_boss_state, '{cooldowns}', v_new_cd);
    end;
    declare v_new_buffs jsonb := '[]'::jsonb; v_b jsonb; v_turns int; begin
      for v_b in select * from jsonb_array_elements(v_boss_state->'buffs') loop
        v_turns := (v_b->>'turns')::int - 1;
        if v_turns > 0 then v_new_buffs := v_new_buffs || jsonb_build_array(jsonb_set(v_b, '{turns}', to_jsonb(v_turns))); end if;
      end loop;
      v_boss_state := jsonb_set(v_boss_state, '{buffs}', v_new_buffs);
      v_new_buffs := '[]'::jsonb;
      for v_b in select * from jsonb_array_elements(v_boss_state->'debuffs') loop
        v_turns := (v_b->>'turns')::int - 1;
        if v_turns > 0 then v_new_buffs := v_new_buffs || jsonb_build_array(jsonb_set(v_b, '{turns}', to_jsonb(v_turns))); end if;
      end loop;
      v_boss_state := jsonb_set(v_boss_state, '{debuffs}', v_new_buffs);
    end;
    if (v_boss_state->>'aggro_turns')::int > 0 then
      v_aggro_turns := (v_boss_state->>'aggro_turns')::int - 1;
      v_boss_state := jsonb_set(v_boss_state, '{aggro_turns}', to_jsonb(v_aggro_turns));
      if v_aggro_turns = 0 then v_boss_state := jsonb_set(v_boss_state, '{aggro_slot}', 'null'::jsonb); end if;
    end if;
    for v_i in 0..2 loop
      declare v_p_cd jsonb := '{}'::jsonb; v_p_buffs jsonb := '[]'::jsonb; v_p_debuffs jsonb := '[]'::jsonb;
              v_k text; v_v int; v_b jsonb; v_turns int; begin
        for v_k in select jsonb_object_keys(v_parts->v_i->'cooldowns') loop
          v_v := (v_parts->v_i->'cooldowns'->>v_k)::int - 1;
          if v_v > 0 then v_p_cd := jsonb_set(v_p_cd, array[v_k], to_jsonb(v_v)); end if;
        end loop;
        v_parts := jsonb_set(v_parts, array[v_i::text, 'cooldowns'], v_p_cd);
        for v_b in select * from jsonb_array_elements(v_parts->v_i->'buffs') loop
          v_turns := (v_b->>'turns')::int - 1;
          if v_turns > 0 then v_p_buffs := v_p_buffs || jsonb_build_array(jsonb_set(v_b, '{turns}', to_jsonb(v_turns))); end if;
        end loop;
        v_parts := jsonb_set(v_parts, array[v_i::text, 'buffs'], v_p_buffs);
        for v_b in select * from jsonb_array_elements(v_parts->v_i->'debuffs') loop
          v_turns := (v_b->>'turns')::int - 1;
          if v_turns > 0 then v_p_debuffs := v_p_debuffs || jsonb_build_array(jsonb_set(v_b, '{turns}', to_jsonb(v_turns))); end if;
        end loop;
        v_parts := jsonb_set(v_parts, array[v_i::text, 'debuffs'], v_p_debuffs);
      end;
    end loop;

    v_frames := v_frames || jsonb_build_array(jsonb_build_object(
      't', v_t, 'type', 'turn_end', 'round', v_round,
      'boss_hp', (v_boss_state->>'hp')::int,
      'participants_hp', jsonb_build_array(
        (v_parts->0->>'hp')::int, (v_parts->1->>'hp')::int, (v_parts->2->>'hp')::int)
    ));
    v_t := v_t + 1;

    v_round := v_round + 1;
  end loop;

  if v_result is null then v_result := 'loss'; end if;

  v_frames := v_frames || jsonb_build_array(jsonb_build_object(
    't', v_t, 'type', 'battle_end', 'result', v_result,
    'final_round', v_round - 1,
    'boss_hp', (v_boss_state->>'hp')::int,
    'participants_hp', jsonb_build_array(
      (v_parts->0->>'hp')::int, (v_parts->1->>'hp')::int, (v_parts->2->>'hp')::int)
  ));

  update ch4_raids
     set status='resolved', result=v_result, replay_data=v_frames,
         total_turns=v_round-1, resolved_at=now()
   where id = p_raid_id;

  if v_result = 'win' then
    insert into user_ch4_clears (user_id, boss_id, raid_id)
    select user_id, v_raid.boss_id, v_raid.id
      from ch4_raid_participants where raid_id = v_raid.id
    on conflict (user_id, boss_id) do nothing;
  end if;

  return json_build_object(
    'ok', true, 'result', v_result, 'total_turns', v_round - 1,
    'frame_count', jsonb_array_length(v_frames)
  );
end;
$$;

grant execute on function resolve_ch4_battle(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

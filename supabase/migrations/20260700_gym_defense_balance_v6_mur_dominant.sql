-- ============================================================
-- 체육관 방어덱 밸런스 v6 — MUR 압도 + 표시 stat 산식 일치.
--
-- 컨셉:
--   v5 (20260688) 의 "공격자 결정적 우위 + 방어자 화력 약화" 가
--   희귀도 가치를 덮어버려 SAR/UR 가 MUR 방어자를 일방적으로 이기는
--   현상이 보고됨. 공격자 우세 큰 틀은 유지하되:
--     1) 공격자 ATK 보정을 1.30 → 1.15 로 추가 완화
--     2) 방어자 ATK 페널티 0.85 → 1.00 로 원상복구
--     3) 방어자 HP 1.00 → 1.05 로 살짝 상향
--     4) 공격자 HP 1.15 → 1.10 으로 살짝 완화
--     5) MUR base 표 자체 상향 (240/60 → 280/70) — 희귀도 raw gap 확대
--     6) MUR 방어자 전용 보너스 신설 — HP×1.15 / ATK×1.10
--   결과: 같은 희귀도면 공격자 1턴 차로 승 (의도 유지) / 다른 희귀도면
--   상위가 명확히 우세 (특히 MUR 방어자는 SAR/UR 공격자에게 압도적).
--
-- 함께 처리:
--   체육관 클릭 → 방어덱 카드의 표시 stat 이 클라 slabStats (별개 표)
--   를 써서 실제 전투값과 어긋났던 문제 → 서버 helper
--   gym_defender_display_stats(rarity, grade, pet_type, gym_type) 신설
--   하고 get_gyms_state.defender_pokemon[] 에 display_hp / display_atk
--   필드 추가. 이제 표시값 = 실제 방어자 전투 stat (멀티플라이어 변경
--   시 자동 동기화).
--
-- 손계산 검증 (no-crit, jitter=1.0, eff=1.0, attacker-first; PCL10 기준):
--   SAR 공 vs MUR 방 (no type-match):
--     SAR=149/36 vs MUR=338/77  →  MUR 4턴만에 SAR KO. **MUR 압도**
--   UR 공 vs MUR 방:
--     UR=182/45 vs MUR=338/77   →  MUR 6턴만에 UR KO. **MUR 명확 승**
--   UR 공 type-match vs MUR 방 type-match:
--     UR=182/50 vs MUR=338/85   →  MUR 4턴만에 UR KO. **MUR 압도**
--   SAR 공 vs UR 방:
--     SAR=149/36 vs UR=173/39   →  UR 8턴만에 SAR KO. **UR 승**
--   같은 희귀도 (MUR/UR/SAR 끼리):
--     공격자 1턴 차로 승 (의도 유지)
--   MUR 공 vs UR 방:
--     MUR=308/85 vs UR=173/39   →  공격자 5턴만에 압살 (high-rarity 공격자 OK)
--
-- 미반영:
--   유저 전투력 (center_power) 기반 추가 stat 보정 — 도입 안 함.
-- ============================================================

-- ── 1) 4 multiplier helpers — v6 수치로 재정의 ──
create or replace function gym_attacker_atk_multiplier()
returns numeric language sql immutable as $$ select 1.15::numeric $$;

create or replace function gym_attacker_hp_multiplier()
returns numeric language sql immutable as $$ select 1.10::numeric $$;

create or replace function gym_defender_atk_multiplier()
returns numeric language sql immutable as $$ select 1.00::numeric $$;

create or replace function gym_defender_hp_multiplier()
returns numeric language sql immutable as $$ select 1.05::numeric $$;

grant execute on function gym_attacker_atk_multiplier() to anon, authenticated;
grant execute on function gym_attacker_hp_multiplier() to anon, authenticated;
grant execute on function gym_defender_atk_multiplier() to anon, authenticated;
grant execute on function gym_defender_hp_multiplier() to anon, authenticated;

-- ── 2) MUR 방어자 전용 보너스 (신규) ──
-- 같은 등급의 MUR 카드를 방어덱에 넣으면 한 단계 위라는 체감.
-- 공격자 MUR 보너스 (gym_mur_attack_multiplier 1.05) 와 별개.
create or replace function gym_mur_defender_hp_multiplier()
returns numeric language sql immutable as $$ select 1.15::numeric $$;

create or replace function gym_mur_defender_atk_multiplier()
returns numeric language sql immutable as $$ select 1.10::numeric $$;

grant execute on function gym_mur_defender_hp_multiplier() to anon, authenticated;
grant execute on function gym_mur_defender_atk_multiplier() to anon, authenticated;

-- ── 3) gym_rarity_base_stats — MUR base 상향 (희귀도 raw gap 확대) ──
-- MUR  240/60  →  280/70   (+17%)
-- 나머지 희귀도는 변경 없음 (UR 165/39, SAR 135/31, ...).
create or replace function gym_rarity_base_stats(p_rarity text)
returns table(hp int, atk int)
language sql immutable
set search_path = public, extensions
as $$
  select
    case p_rarity
      when 'MUR' then 280 when 'UR'  then 165 when 'SAR' then 135
      when 'SR'  then 110 when 'MA'  then 100 when 'AR'  then  90
      when 'RR'  then  70 when 'R'   then  60 when 'U'   then  50
      when 'C'   then  50 else 50
    end::int,
    case p_rarity
      when 'MUR' then 70 when 'UR'  then 39 when 'SAR' then 31
      when 'SR'  then 24 when 'MA'  then 21 when 'AR'  then 18
      when 'RR'  then 14 when 'R'   then 12 when 'U'   then 10
      when 'C'   then 10 else 10
    end::int;
$$;

grant execute on function gym_rarity_base_stats(text) to anon, authenticated;

-- ── 4) gym_pet_battle_stats — MUR 방어자 보너스 분기 추가 ──
-- 20260688 시그니처/본문 그대로 + (8) MUR 방어자 분기만 신규.
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
  v_pet_type text;
  v_base_hp int;
  v_base_atk int;
  v_hp numeric;
  v_atk numeric;
  v_valid_types constant text[] := array[
    '노말','불꽃','물','풀','전기','얼음','격투','독','땅',
    '비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리'
  ];
begin
  select g.id, g.card_id, g.grade, g.rarity into v_grading
    from psa_gradings g where g.id = p_grading_id;
  if not found then return; end if;

  -- (1) PCL 10 hard gate.
  if v_grading.grade is null or v_grading.grade <> gym_required_grade() then
    return;
  end if;

  -- (2) 펫 속성 정규화.
  if p_pet_type = any(v_valid_types) then
    v_pet_type := p_pet_type;
  else
    v_pet_type := '노말';
  end if;

  -- (3) 희귀도 base hp/atk.
  select gs.hp, gs.atk into v_base_hp, v_base_atk
    from gym_rarity_base_stats(v_grading.rarity) gs;

  -- (4) center_power 기반 보정 미사용 (v5 정책 그대로).
  v_hp  := v_base_hp::numeric;
  v_atk := v_base_atk::numeric;

  -- (5) 공격자 / 방어자 분기 보정.
  if p_is_defender then
    v_hp  := v_hp  * gym_defender_hp_multiplier();   -- 1.05
    v_atk := v_atk * gym_defender_atk_multiplier();  -- 1.00
  else
    v_hp  := v_hp  * gym_attacker_hp_multiplier();   -- 1.10
    v_atk := v_atk * gym_attacker_atk_multiplier();  -- 1.15
  end if;

  -- (6) MUR 공격자 ATK 보정 — 희소가치 차등 (유지).
  if v_grading.rarity = 'MUR' and not p_is_defender then
    v_atk := v_atk * gym_mur_attack_multiplier();
  end if;

  -- (7) 체육관 속성 일치 ATK 보정 (양측 동일 — 유지).
  if v_pet_type = p_gym_type then
    v_atk := v_atk * gym_type_match_multiplier();
  end if;

  -- (8) NEW v6 — MUR 방어자 보너스. MUR 카드를 방어덱에 넣으면 한
  -- 단계 위라는 체감. 공격자 MUR 보너스(6) 와 별개로 누적.
  if v_grading.rarity = 'MUR' and p_is_defender then
    v_hp  := v_hp  * gym_mur_defender_hp_multiplier();   -- 1.15
    v_atk := v_atk * gym_mur_defender_atk_multiplier();  -- 1.10
  end if;

  hp := round(v_hp)::int;
  atk := round(v_atk)::int;
  type := v_pet_type;
  name := v_grading.card_id;
  rarity := v_grading.rarity;
  grade := v_grading.grade;
  card_id := v_grading.card_id;
  return next;
end;
$$;

grant execute on function gym_pet_battle_stats(uuid, int, int, text, text, boolean)
  to anon, authenticated;
grant execute on function gym_pet_battle_stats(uuid, int, int, text, text)
  to anon, authenticated;

-- ── 5) gym_defender_display_stats — 표시용 단일 산식 진입점 ──
-- 체육관 detail 페이지의 방어덱 카드가 표시할 hp/atk. 같은 멀티플라이어
-- 들을 호출하므로 위 v6 변경이 표시값에 자동 반영됨.
-- grading_id 가 아니라 (rarity, grade, pet_type, gym_type) 만 받음 —
-- get_gyms_state 의 jsonb 빌더에서 row-by-row 부르기 위함.
create or replace function gym_defender_display_stats(
  p_rarity text,
  p_grade int,
  p_pet_type text,
  p_gym_type text
) returns table(hp int, atk int)
language sql
stable
set search_path = public, extensions
as $$
  with base as (
    select b.hp::numeric as hp, b.atk::numeric as atk
      from gym_rarity_base_stats(p_rarity) b
  ),
  applied as (
    select
      b.hp * gym_defender_hp_multiplier()
        * case when p_rarity = 'MUR' then gym_mur_defender_hp_multiplier() else 1.0 end
        as hp,
      b.atk * gym_defender_atk_multiplier()
        * case when p_rarity = 'MUR' then gym_mur_defender_atk_multiplier() else 1.0 end
        * case when p_pet_type = p_gym_type then gym_type_match_multiplier() else 1.0 end
        as atk
    from base b
  )
  select round(a.hp)::int, round(a.atk)::int
  from applied a
  -- PCL 등급 게이트 — 방어덱은 PCL10 만 허용되므로 외부 게이팅과 별개로
  -- 비-10 입력은 0/0 으로 안전 표시.
  where p_grade = gym_required_grade();
$$;

grant execute on function gym_defender_display_stats(text, int, text, text)
  to anon, authenticated;

-- ── 6) get_gyms_state — defender_pokemon[] 에 display_hp / display_atk 추가 ──
-- 20260686 정의 그대로 + jsonb_build_object 에 두 필드만 추가.
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
              'type', o.defense_pet_types[t.idx],
              'rarity', g2.rarity, 'grade', g2.grade,
              -- v6 신규 — 표시용 hp/atk. stale 슬롯 (g2 미존재) 은 null.
              -- 멀티플라이어 / MUR 보너스 / 속성 일치까지 모두 반영된
              -- 실제 방어 전투 stat 과 동일 산식.
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

-- 마이그레이션: 20260700_gym_defense_balance_v6_mur_dominant.sql

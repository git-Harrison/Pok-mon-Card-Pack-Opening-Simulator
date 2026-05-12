-- ============================================================
-- 체육관 챕터 4 — 역할별 5+1 스킬 시드 (피드백 반영)
--
-- 피드백:
--   "각 포지션마다 5가지 스킬 + 필살기 1개 (총 6개)"
--   "딜러/탱커/서포터마다 사용 스킬이 달라야 함"
--   "연타/연속공격 같은 빠른 스킬도 필요"
--   "필살기 시전 모션은 화려한 fullscreen 연출"
--   "힐 스킬이 중복 적용되어 너무 쉽게 이김" → 너프
--
-- 변경:
--   - 기존 role 9 스킬 (3×3) 보존 + 새 스킬 추가 (총 18 = 6×3)
--   - 기존 role-dealer-ultimate kind 'attack' → 'ultimate'
--   - 기존 role-supporter-heal power 0.30 → 0.15, cd 2 → 3
--   - 기존 role-dealer-combo kind 'attack' → 'multi_hit' (연타, duration_turns 재활용 = 4 hits)
--   - 새 스킬: tank-strike, tank-slam, tank-ultimate
--             dealer-power, dealer-pierce, dealer-burst
--             supporter-strike, supporter-mass-heal, supporter-ultimate
--
-- compute_ch4_loadout 갱신: role 6 + species 1 = 7 스킬
-- ============================================================

-- ── 기존 스킬 너프 / kind 변경 ──
update ch4_skills set
  power = 0.15, cooldown_turns = 3,
  fx_template = 'sparkle_heal', fx_color = '#66ff99',
  fx_intensity = 1.3, fx_duration_ms = 1700
 where id = 'role-supporter-heal';

update ch4_skills set
  kind = 'multi_hit', power = 0.55, cooldown_turns = 2,
  duration_turns = 4,  -- hits = 4
  fx_template = 'multi_strike', fx_color = '#ff6600',
  fx_intensity = 1.5, fx_duration_ms = 2200, fx_shake = 'medium'
 where id = 'role-dealer-combo';

update ch4_skills set
  kind = 'ultimate', power = 3.0, cooldown_turns = 4,
  fx_template = 'ultimate_burst', fx_color = '#ffd700', fx_color_secondary = '#ff3300',
  fx_intensity = 2.0, fx_duration_ms = 3000, fx_shake = 'screen'
 where id = 'role-dealer-ultimate';

-- ── 신규 스킬 (9개) ──
insert into ch4_skills (id, scope, role, name, kind, target, power, cooldown_turns, ai_priority, duration_turns,
                        fx_template, fx_color, fx_color_secondary, fx_intensity, fx_duration_ms, fx_shake, fx_zoom, fx_text_style)
values
  -- ── Tank ──
  ('role-tank-strike',    'role', 'tank',      '강타',         'attack',    'enemy',       0.90, 0, 1, 0,
   'slash_v',        '#3399ff', '#99ccff', 1.2, 1800, 'small',  1.00, 'default'),
  ('role-tank-slam',      'role', 'tank',      '방패강타',     'multi_hit', 'enemy',       0.45, 2, 2, 3,
   'multi_strike',   '#66aaff', '#3366cc', 1.4, 2200, 'medium', 1.00, 'default'),
  ('role-tank-ultimate',  'role', 'tank',      '불굴의 일격', 'ultimate',  'enemy',       2.20, 4, 6, 0,
   'ultimate_burst', '#1e90ff', '#ffffff', 2.0, 3000, 'screen', 1.10, 'default'),
  -- ── Dealer ──
  ('role-dealer-power',   'role', 'dealer',    '폭렬타',       'attack',    'enemy',       1.70, 2, 3, 0,
   'slash_v',        '#ff3300', '#ff9900', 1.5, 2000, 'large',  1.05, 'fire'),
  ('role-dealer-pierce',  'role', 'dealer',    '관통 일격',   'attack',    'enemy',       1.40, 3, 3, 0,
   'beam_ray',       '#ffcc00', '#ffffff', 1.6, 2100, 'medium', 1.05, 'fire'),
  ('role-dealer-burst',   'role', 'dealer',    '폭주 베기',   'attack',    'enemy',       1.90, 3, 3, 0,
   'slash_v',        '#ff0099', '#ff66cc', 1.6, 2100, 'large',  1.05, 'fire'),
  -- ── Supporter ──
  ('role-supporter-strike','role','supporter', '보조타',       'attack',    'enemy',       0.70, 0, 1, 0,
   'dash_strike',    '#bbbbbb', '#dddddd', 1.0, 1600, 'small',  1.00, 'default'),
  ('role-supporter-mass-heal','role','supporter','광역 회복','heal',       'all_allies',  0.12, 4, 4, 0,
   'sparkle_heal',   '#88ffaa', '#ffffff', 1.4, 2000, 'small',  1.00, 'default'),
  ('role-supporter-ultimate','role','supporter','성역',        'heal',     'all_allies',  0.50, 5, 6, 0,
   'ultimate_burst', '#aaffcc', '#ffffff', 2.0, 3000, 'screen', 1.05, 'default')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, target = excluded.target,
  power = excluded.power, cooldown_turns = excluded.cooldown_turns,
  ai_priority = excluded.ai_priority, duration_turns = excluded.duration_turns,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_color_secondary = excluded.fx_color_secondary, fx_intensity = excluded.fx_intensity,
  fx_duration_ms = excluded.fx_duration_ms, fx_shake = excluded.fx_shake,
  fx_zoom = excluded.fx_zoom, fx_text_style = excluded.fx_text_style;

-- ── 기존 스킬 fx_template 리뉴얼 (원형 위주 → 비원형) ──
update ch4_skills set fx_template = 'slash_v' where id = 'role-dealer-strike';
update ch4_skills set fx_template = 'slash_v' where id = 'sig-charmander';
update ch4_skills set fx_template = 'slash_v' where id = 'sig-dratini';
update ch4_skills set fx_template = 'multi_strike' where id = 'sig-piplup';

-- ── compute_ch4_loadout v2: role 6 + species 1 = 7 ──
create or replace function compute_ch4_loadout(p_role text, p_species text)
returns text[]
language sql
stable
set search_path = public
as $$
  select array(
    select id from (
      select id, 1 as ord from ch4_skills where scope = 'role'    and role    = p_role
      union all
      select id, 2 as ord from ch4_skills where scope = 'species' and species = p_species
    ) s order by ord, id
  );
$$;

notify pgrst, 'reload schema';

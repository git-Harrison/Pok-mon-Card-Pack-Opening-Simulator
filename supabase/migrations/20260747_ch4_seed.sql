-- ============================================================
-- 체육관 챕터 4 — Phase 0 / 2단계: 보스/스킬 시드
--
-- 보스 4 단계 + 보스 스킬 16 + 플레이어 스킬 19 (역할 9 + 종 10)
-- 모두 idempotent (ON CONFLICT DO UPDATE).
--
-- 애니메이션 fx_template:
--   dash_strike / beam_ray / summon_above / aoe_wave
--   floor_eruption / aura_buff / sparkle_heal / shadow_swipe
-- ============================================================

-- ── 보스 4 단계 ──
insert into ch4_bosses (id, stage_order, name, description, sprite_key, types, weak_to,
                        base_hp, base_atk, base_def, phase_switch_hp_ratio, unlock_requires_clear)
values
  ('ch4-boss-1', 1, '그림자 트레이너',
   '미지의 영역 입구를 지키는 어둠의 트레이너. 그의 정체는 알려지지 않았다.',
   'shadow-trainer', array['악'], array['격투'],
   200000, 1200, 200, null, null),

  ('ch4-boss-2', 2, '잊혀진 챔피언',
   '한때 최강이었던 트레이너의 잔존 사념체. 광역 어둠 마법을 구사한다.',
   'forgotten-champion', array['고스트','악'], array['페어리'],
   500000, 1800, 400, null, 'ch4-boss-1'),

  ('ch4-boss-3', 3, '미지의 자',
   '강철 비늘로 뒤덮인 드래곤. 광역 폭풍과 자가 회복을 가진다.',
   'unknown-one', array['드래곤','강철'], array['격투','페어리'],
   1000000, 2600, 600, null, 'ch4-boss-2'),

  ('ch4-boss-4', 4, 'Shadow Mewtwo',
   '어둠에 물든 절대 존재. HP 50% 미만 시 광폭화 모드로 전환된다.',
   'shadow-mewtwo', array['에스퍼','악'], array[]::text[],
   2000000, 3500, 900, 0.5, 'ch4-boss-3')
on conflict (id) do update set
  stage_order   = excluded.stage_order,
  name          = excluded.name,
  description   = excluded.description,
  sprite_key    = excluded.sprite_key,
  types         = excluded.types,
  weak_to       = excluded.weak_to,
  base_hp       = excluded.base_hp,
  base_atk      = excluded.base_atk,
  base_def      = excluded.base_def,
  phase_switch_hp_ratio = excluded.phase_switch_hp_ratio,
  unlock_requires_clear = excluded.unlock_requires_clear;

-- ── Stage 1: 그림자 트레이너 (3 skills) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority,
                             fx_template, fx_color, fx_intensity, fx_duration_ms, fx_shake, fx_text_style)
values
  ('ch4-b1-s1', 'ch4-boss-1', '그림자 일격',  'single', 1.0, 0, 1, 'shadow_swipe', '#4b0082', 1.0, 1800, 'medium', 'shadow'),
  ('ch4-b1-s2', 'ch4-boss-1', '어둠의 손길',  'single', 1.4, 2, 2, 'shadow_swipe', '#1a0033', 1.3, 2200, 'large',  'shadow'),
  ('ch4-b1-s3', 'ch4-boss-1', '위협의 외침',  'debuff', 0.0, 3, 3, 'aura_buff',    '#7a0066', 1.2, 1600, 'small',  'shadow')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_intensity = excluded.fx_intensity, fx_duration_ms = excluded.fx_duration_ms,
  fx_shake = excluded.fx_shake, fx_text_style = excluded.fx_text_style;

-- ── Stage 2: 잊혀진 챔피언 (4 skills) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority,
                             fx_template, fx_color, fx_intensity, fx_duration_ms, fx_shake, fx_vignette_color, fx_text_style)
values
  ('ch4-b2-s1', 'ch4-boss-2', '영혼 베기',    'single',    1.2, 0, 1, 'shadow_swipe', '#0f0a1e', 1.1, 1800, 'medium', null,      'shadow'),
  ('ch4-b2-s2', 'ch4-boss-2', '절망의 파동',  'aoe',       0.8, 3, 3, 'aoe_wave',     '#3b0a47', 1.6, 2600, 'large',  '#1a0033', 'shadow'),
  ('ch4-b2-s3', 'ch4-boss-2', '망각',         'debuff',    0.0, 3, 2, 'aura_buff',    '#5b2c75', 1.3, 1700, 'small',  null,      'shadow'),
  ('ch4-b2-s4', 'ch4-boss-2', '영혼 흡수',    'self_heal', 0.15, 4, 2, 'sparkle_heal','#b366c6', 1.4, 1900, 'small',  null,      'shadow')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_intensity = excluded.fx_intensity, fx_duration_ms = excluded.fx_duration_ms,
  fx_shake = excluded.fx_shake, fx_vignette_color = excluded.fx_vignette_color,
  fx_text_style = excluded.fx_text_style;

-- ── Stage 3: 미지의 자 (4 skills) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority,
                             fx_template, fx_color, fx_color_secondary, fx_intensity, fx_duration_ms,
                             fx_shake, fx_vignette_color, fx_zoom, fx_text_style)
values
  ('ch4-b3-s1', 'ch4-boss-3', '강철 발톱',    'single',    1.5,  0, 1, 'dash_strike',   '#9aa0a6', null,      1.3, 2000, 'large',  null,      1.05, 'dragon'),
  ('ch4-b3-s2', 'ch4-boss-3', '드래곤 폭풍',  'aoe',       1.0,  3, 4, 'aoe_wave',      '#3300ff', '#9aa0a6', 1.8, 2800, 'screen', '#1a0066', 1.10, 'dragon'),
  ('ch4-b3-s3', 'ch4-boss-3', '재생',         'self_heal', 0.15, 4, 2, 'sparkle_heal',  '#ffd700', null,      1.4, 1800, 'none',   null,      1.00, 'default'),
  ('ch4-b3-s4', 'ch4-boss-3', '위압',         'debuff',    0.0,  3, 3, 'aura_buff',     '#c0c8d2', '#3300ff', 1.3, 1700, 'small',  null,      1.00, 'dragon')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_color_secondary = excluded.fx_color_secondary, fx_intensity = excluded.fx_intensity,
  fx_duration_ms = excluded.fx_duration_ms, fx_shake = excluded.fx_shake,
  fx_vignette_color = excluded.fx_vignette_color, fx_zoom = excluded.fx_zoom,
  fx_text_style = excluded.fx_text_style;

-- ── Stage 4: Shadow Mewtwo (5 skills — s4/s5 는 phase 2 광폭화 모드 전용) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority, requires_phase,
                             fx_template, fx_color, fx_color_secondary, fx_intensity, fx_duration_ms,
                             fx_shake, fx_vignette_color, fx_zoom, fx_text_style)
values
  ('ch4-b4-s1', 'ch4-boss-4', '사이코키네시스', 'single',    1.6, 0, 1, 0, 'beam_ray',   '#ff66ff', '#ffffff', 1.5, 2200, 'large',  null,       1.08, 'psychic'),
  ('ch4-b4-s2', 'ch4-boss-4', '그림자 폭발',    'aoe',       1.2, 3, 4, 0, 'aoe_wave',   '#1a0033', '#ff00ff', 1.8, 2800, 'screen', '#330066',  1.12, 'shadow'),
  ('ch4-b4-s3', 'ch4-boss-4', '정신붕괴',       'debuff',    0.0, 3, 2, 0, 'aura_buff',  '#cc00ff', '#1a0033', 1.4, 1800, 'medium', null,       1.00, 'psychic'),
  ('ch4-b4-s4', 'ch4-boss-4', '광폭화',         'self_buff', 0.5, 0, 5, 1, 'aura_buff',  '#ff0033', '#1a0033', 2.0, 2400, 'screen', '#660000',  1.00, 'shadow'),
  ('ch4-b4-s5', 'ch4-boss-4', '시공 일격',      'single',    2.5, 4, 6, 1, 'beam_ray',   '#ff0099', '#1a0033', 2.0, 2600, 'screen', '#660033',  1.15, 'psychic')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  requires_phase = excluded.requires_phase,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_color_secondary = excluded.fx_color_secondary, fx_intensity = excluded.fx_intensity,
  fx_duration_ms = excluded.fx_duration_ms, fx_shake = excluded.fx_shake,
  fx_vignette_color = excluded.fx_vignette_color, fx_zoom = excluded.fx_zoom,
  fx_text_style = excluded.fx_text_style;

-- ── 플레이어 역할 스킬 (3 × 3 = 9개) ──
insert into ch4_skills (id, scope, role, name, kind, target, power, cooldown_turns, ai_priority, duration_turns,
                        fx_template, fx_color, fx_intensity, fx_duration_ms, fx_shake, fx_text_style)
values
  -- 탱커: 도발 / 방어자세 / 카운터
  ('role-tank-taunt',     'role', 'tank',      '도발',       'taunt',   'enemy',         0.00, 2, 3, 2, 'aura_buff',    '#ff5050', 1.2, 1500, 'small',  'default'),
  ('role-tank-defense',   'role', 'tank',      '방어자세',   'buff',    'self',          0.00, 3, 2, 2, 'aura_buff',    '#3399ff', 1.3, 1500, 'none',   'default'),
  ('role-tank-counter',   'role', 'tank',      '카운터',     'counter', 'self',          0.00, 3, 1, 1, 'aura_buff',    '#ffaa00', 1.2, 1500, 'none',   'default'),
  -- 딜러: 강타 / 연속타 / 필살
  ('role-dealer-strike',  'role', 'dealer',    '강타',       'attack',  'enemy',         1.30, 0, 1, 0, 'dash_strike',  '#ff3300', 1.2, 1800, 'medium', 'fire'),
  ('role-dealer-combo',   'role', 'dealer',    '연속타',     'attack',  'enemy',         1.60, 2, 2, 0, 'dash_strike',  '#ff6600', 1.4, 2200, 'large',  'fire'),
  ('role-dealer-ultimate','role', 'dealer',    '필살',       'attack',  'enemy',         2.00, 3, 4, 0, 'dash_strike',  '#ffd700', 1.8, 2600, 'screen', 'fire'),
  -- 서포터: 회복 / 공격버프 / 디스펠
  ('role-supporter-heal',  'role', 'supporter','회복',       'heal',    'ally_low_hp',   0.30, 2, 4, 0, 'sparkle_heal', '#66ff99', 1.2, 1700, 'none',   'default'),
  ('role-supporter-buff',  'role', 'supporter','공격버프',   'buff',    'all_allies',    0.30, 3, 2, 3, 'aura_buff',    '#ffcc00', 1.3, 1700, 'small',  'default'),
  ('role-supporter-dispel','role', 'supporter','디스펠',     'debuff',  'enemy_buffs',   0.00, 3, 3, 0, 'sparkle_heal', '#cc99ff', 1.2, 1500, 'small',  'default')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, target = excluded.target,
  power = excluded.power, cooldown_turns = excluded.cooldown_turns,
  ai_priority = excluded.ai_priority, duration_turns = excluded.duration_turns,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_intensity = excluded.fx_intensity, fx_duration_ms = excluded.fx_duration_ms,
  fx_shake = excluded.fx_shake, fx_text_style = excluded.fx_text_style;

-- ── 종 시그니처 스킬 (10개) ──
insert into ch4_skills (id, scope, species, name, kind, target, power, cooldown_turns, ai_priority, duration_turns,
                        fx_template, fx_color, fx_color_secondary, fx_intensity, fx_duration_ms,
                        fx_shake, fx_zoom, fx_text_style)
values
  ('sig-pikachu',    'species', 'pikachu',    '10만 볼트',         'attack', 'enemy', 2.2, 3, 5, 0, 'beam_ray',     '#ffd700', '#fff066', 1.7, 2200, 'large',  1.05, 'electric'),
  ('sig-charmander', 'species', 'charmander', '플레어 드라이브',   'attack', 'enemy', 2.3, 3, 5, 0, 'dash_strike',  '#ff5500', '#ffaa00', 1.7, 2200, 'large',  1.05, 'fire'),
  ('sig-squirtle',   'species', 'squirtle',   '하이드로 펌프',     'attack', 'enemy', 2.1, 3, 5, 0, 'beam_ray',     '#3399ff', '#99ccff', 1.6, 2200, 'medium', 1.05, 'default'),
  ('sig-bulbasaur',  'species', 'bulbasaur',  '솔라빔',            'attack', 'enemy', 2.4, 4, 5, 0, 'beam_ray',     '#66cc33', '#ccff66', 1.8, 2400, 'large',  1.08, 'default'),
  ('sig-gastly',     'species', 'gastly',     '섀도 볼',           'attack', 'enemy', 2.2, 3, 5, 0, 'summon_above', '#660099', '#cc66ff', 1.7, 2200, 'large',  1.05, 'shadow'),
  ('sig-dratini',    'species', 'dratini',    '드래곤 클로',       'attack', 'enemy', 2.3, 3, 5, 0, 'dash_strike',  '#3300ff', '#9966ff', 1.7, 2200, 'large',  1.05, 'dragon'),
  ('sig-pidgey',     'species', 'pidgey',     '돌풍',              'attack', 'enemy', 2.0, 3, 5, 0, 'aoe_wave',     '#cce6ff', '#ffffff', 1.5, 2200, 'medium', 1.05, 'default'),
  ('sig-piplup',     'species', 'piplup',     '아쿠아 제트',       'attack', 'enemy', 2.2, 3, 5, 0, 'dash_strike',  '#0066cc', '#66ccff', 1.6, 2000, 'medium', 1.05, 'default'),
  ('sig-mew',        'species', 'mew',        '에인션트 파워',     'attack', 'enemy', 2.3, 3, 5, 0, 'summon_above', '#ff66cc', '#ffccff', 1.7, 2200, 'large',  1.05, 'psychic'),
  ('sig-mewtwo',     'species', 'mewtwo',     '사이코 부스트',     'attack', 'enemy', 2.6, 3, 5, 0, 'beam_ray',     '#cc00ff', '#ff66ff', 1.9, 2400, 'screen', 1.10, 'psychic')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, target = excluded.target,
  power = excluded.power, cooldown_turns = excluded.cooldown_turns,
  ai_priority = excluded.ai_priority, duration_turns = excluded.duration_turns,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_color_secondary = excluded.fx_color_secondary, fx_intensity = excluded.fx_intensity,
  fx_duration_ms = excluded.fx_duration_ms, fx_shake = excluded.fx_shake,
  fx_zoom = excluded.fx_zoom, fx_text_style = excluded.fx_text_style;

notify pgrst, 'reload schema';

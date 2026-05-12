-- ============================================================
-- 체육관 챕터 4 — 보스 4종 실존 전설 포켓몬으로 교체
--
-- 기존 placeholder (그림자 트레이너 / 잊혀진 챔피언 / 미지의 자 / Shadow
-- Mewtwo) → 프로젝트 미사용 실존 전설 포켓몬으로 교체:
--
--   Stage 1: 마기라스   (Tyranitar 248) — 바위/악, 단단한 거포
--   Stage 2: 칠색조     (Ho-Oh 250)     — 불꽃/비행, 신성한 불의 새
--   Stage 3: 레쿠쟈     (Rayquaza 384)  — 드래곤/비행, 하늘의 지배자
--   Stage 4: 기라티나   (Giratina 487)  — 고스트/드래곤, 차원의 신 (광폭화)
--
-- 보스 스킬 이름/색감도 각 포켓몬 컨셉에 맞춰 cohesive 업데이트.
-- HP/ATK/cooldown 등 밸런스 수치는 그대로 (Phase 4 에서 별도 조정).
--
-- 스프라이트:
--   sprite_key 가 클라 bossSpriteUrl() 의 dex 매핑 키. 클라도 같이 업데이트.
-- ============================================================

-- ── 보스 4종 UPSERT (id 고정, 이름/스프라이트/타입만 교체) ──
insert into ch4_bosses (id, stage_order, name, description, sprite_key, types, weak_to,
                        base_hp, base_atk, base_def, phase_switch_hp_ratio, unlock_requires_clear)
values
  ('ch4-boss-1', 1, '마기라스',
   '단단한 비늘로 무장한 어둠의 거포. 그의 분노는 산을 부수고 대지를 갈랐다.',
   'tyranitar', array['바위','악'], array['격투','풀'],
   200000, 1200, 200, null, null),

  ('ch4-boss-2', 2, '칠색조',
   '일곱 빛깔 날개를 펼친 전설의 불새. 환란의 시대를 살리거나 멸한다.',
   'ho-oh', array['불꽃','비행'], array['물','전기','바위'],
   500000, 1800, 400, null, 'ch4-boss-1'),

  ('ch4-boss-3', 3, '레쿠쟈',
   '오존층의 절대 지배자. 운석조차 그의 권능 앞에선 한낱 먼지일 뿐.',
   'rayquaza', array['드래곤','비행'], array['얼음','페어리'],
   1000000, 2600, 600, null, 'ch4-boss-2'),

  ('ch4-boss-4', 4, '기라티나',
   '차원의 균열에서 나타난 어둠의 신. 빛이 닿지 않는 세계에서 영원히 군림한다. HP 50% 미만 시 광폭화 모드로 전환.',
   'giratina', array['고스트','드래곤'], array['페어리'],
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

-- ── Stage 1: 마기라스 스킬 (바위/악 컨셉, 갈색/검정) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority,
                             fx_template, fx_color, fx_intensity, fx_duration_ms, fx_shake, fx_text_style)
values
  ('ch4-b1-s1', 'ch4-boss-1', '깨물어부수기',  'single', 1.0, 0, 1, 'dash_strike', '#8b4513', 1.0, 1800, 'medium', 'shadow'),
  ('ch4-b1-s2', 'ch4-boss-1', '락 슬라이드',   'single', 1.4, 2, 2, 'summon_above','#a0522d', 1.4, 2200, 'large',  'default'),
  ('ch4-b1-s3', 'ch4-boss-1', '위협의 포효',   'debuff', 0.0, 3, 3, 'aura_buff',   '#5d4037', 1.2, 1700, 'small',  'shadow')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_intensity = excluded.fx_intensity, fx_duration_ms = excluded.fx_duration_ms,
  fx_shake = excluded.fx_shake, fx_text_style = excluded.fx_text_style;

-- ── Stage 2: 칠색조 스킬 (불꽃/비행 컨셉, 금색/주황) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority,
                             fx_template, fx_color, fx_intensity, fx_duration_ms, fx_shake,
                             fx_vignette_color, fx_text_style)
values
  ('ch4-b2-s1', 'ch4-boss-2', '신성한 불꽃',     'single',    1.2, 0, 1, 'beam_ray',     '#ff8c00', 1.3, 1900, 'medium', null,      'fire'),
  ('ch4-b2-s2', 'ch4-boss-2', '브레이브 버드',   'aoe',       0.8, 3, 3, 'aoe_wave',     '#ff4500', 1.6, 2600, 'large',  '#7f1d1d', 'fire'),
  ('ch4-b2-s3', 'ch4-boss-2', '안개의 결계',     'debuff',    0.0, 3, 2, 'aura_buff',    '#ffd700', 1.3, 1700, 'small',  null,      'default'),
  ('ch4-b2-s4', 'ch4-boss-2', '재생의 불꽃',     'self_heal', 0.15, 4, 2, 'sparkle_heal','#ffaa44', 1.4, 1900, 'small',  null,      'fire')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_intensity = excluded.fx_intensity, fx_duration_ms = excluded.fx_duration_ms,
  fx_shake = excluded.fx_shake, fx_vignette_color = excluded.fx_vignette_color,
  fx_text_style = excluded.fx_text_style;

-- ── Stage 3: 레쿠쟈 스킬 (드래곤/비행 컨셉, 에메랄드 그린/노랑) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority,
                             fx_template, fx_color, fx_color_secondary, fx_intensity, fx_duration_ms,
                             fx_shake, fx_vignette_color, fx_zoom, fx_text_style)
values
  ('ch4-b3-s1', 'ch4-boss-3', '용성군',         'single',    1.5,  0, 1, 'summon_above',  '#00ff7f', '#ffd700', 1.4, 2100, 'large',  null,      1.05, 'dragon'),
  ('ch4-b3-s2', 'ch4-boss-3', '화룡점정',       'aoe',       1.0,  3, 4, 'aoe_wave',      '#10b981', '#fbbf24', 1.8, 2800, 'screen', '#064e3b', 1.10, 'dragon'),
  ('ch4-b3-s3', 'ch4-boss-3', '대지의 힘 흡수', 'self_heal', 0.15, 4, 2, 'sparkle_heal',  '#34d399', null,      1.4, 1800, 'none',   null,      1.00, 'default'),
  ('ch4-b3-s4', 'ch4-boss-3', '거룡의 위압',    'debuff',    0.0,  3, 3, 'aura_buff',     '#22c55e', '#fbbf24', 1.3, 1700, 'small',  null,      1.00, 'dragon')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_color_secondary = excluded.fx_color_secondary, fx_intensity = excluded.fx_intensity,
  fx_duration_ms = excluded.fx_duration_ms, fx_shake = excluded.fx_shake,
  fx_vignette_color = excluded.fx_vignette_color, fx_zoom = excluded.fx_zoom,
  fx_text_style = excluded.fx_text_style;

-- ── Stage 4: 기라티나 스킬 (고스트/드래곤, 보라/검정 + 광폭화 핏빛) ──
insert into ch4_boss_skills (id, boss_id, name, kind, power, cooldown_turns, ai_priority, requires_phase,
                             fx_template, fx_color, fx_color_secondary, fx_intensity, fx_duration_ms,
                             fx_shake, fx_vignette_color, fx_zoom, fx_text_style)
values
  ('ch4-b4-s1', 'ch4-boss-4', '섀도 클로',      'single',    1.6, 0, 1, 0, 'dash_strike',  '#9333ea', '#1a0033', 1.5, 2100, 'large',  null,       1.05, 'shadow'),
  ('ch4-b4-s2', 'ch4-boss-4', '차원의 휘몰아침','aoe',       1.2, 3, 4, 0, 'aoe_wave',     '#581c87', '#ff00ff', 1.8, 2800, 'screen', '#3b0764',  1.12, 'shadow'),
  ('ch4-b4-s3', 'ch4-boss-4', '어둠의 손길',    'debuff',    0.0, 3, 2, 0, 'aura_buff',    '#7e22ce', '#1a0033', 1.4, 1800, 'medium', null,       1.00, 'shadow'),
  ('ch4-b4-s4', 'ch4-boss-4', '뒤바뀐 영혼',    'self_buff', 0.5, 0, 5, 1, 'aura_buff',    '#dc2626', '#1a0033', 2.0, 2400, 'screen', '#7f1d1d',  1.00, 'shadow'),
  ('ch4-b4-s5', 'ch4-boss-4', '차원 베기',      'single',    2.5, 4, 6, 1, 'beam_ray',     '#ef4444', '#1a0033', 2.0, 2600, 'screen', '#7f1d1d',  1.15, 'shadow')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, power = excluded.power,
  cooldown_turns = excluded.cooldown_turns, ai_priority = excluded.ai_priority,
  requires_phase = excluded.requires_phase,
  fx_template = excluded.fx_template, fx_color = excluded.fx_color,
  fx_color_secondary = excluded.fx_color_secondary, fx_intensity = excluded.fx_intensity,
  fx_duration_ms = excluded.fx_duration_ms, fx_shake = excluded.fx_shake,
  fx_vignette_color = excluded.fx_vignette_color, fx_zoom = excluded.fx_zoom,
  fx_text_style = excluded.fx_text_style;

notify pgrst, 'reload schema';

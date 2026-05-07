-- ============================================================
-- 체육관 전투 밸런스 v8 — 공격자 너프 + 방어자 약 보강 (평준화).
--
-- 사용자 보고:
--   "v7 공격자가 너무 강함. 방어덱이 너무 약하니 평준화될 수 있게
--    공격자 너프."
--
-- 변경 (v7 → v8):
--   공격자 ATK : 1.25 → 1.15  (-8%)
--   공격자 HP  : 1.25 → 1.15  (-8%)
--   방어자 ATK : 0.90 → 0.95  (+5.5%)
--   방어자 HP  : 0.90 → 0.95  (+5.5%)
--
-- 미변경:
--   MUR 방어자 HP   : 1.05  (그대로)
--   MUR 방어자 ATK  : 1.00  (그대로)
--   MUR 공격자 ATK  : 1.05  (그대로 — gym_mur_attack_multiplier)
--   체육관 속성 일치 ATK : 1.10  (그대로 — gym_type_match_multiplier)
--   카드 base stats / grade_mult / 속성 일치 룰 / sqrt 정규화 캡 0.35
--   /0.45 모두 그대로.
--
-- 의도:
--   v6 (공 1.15/1.10 vs 방 1.00/1.05) 와 v7 (공 1.25/1.25 vs 방
--   0.90/0.90) 사이로 회귀. 공격자 우세는 유지하되 방어덱 의미
--   부활. 동급 매치업에서 공격자 1턴 차 승 vs 약방어 (HP 부족) 시
--   공격자 우세 패턴.
--
-- 자동 반영 (live read):
--   gym_pet_battle_stats(...) 가 매 호출마다 multiplier helper 들을
--   읽음 → 본 마이그레이션 적용 시 즉시 모든 도전/방어 stats 에 반영.
--
-- 멱등 — CREATE OR REPLACE 만 사용. 호출부/시그니처 변경 없음.
-- ============================================================

create or replace function gym_attacker_atk_multiplier()
returns numeric language sql immutable as $$ select 1.15::numeric $$;

create or replace function gym_attacker_hp_multiplier()
returns numeric language sql immutable as $$ select 1.15::numeric $$;

create or replace function gym_defender_atk_multiplier()
returns numeric language sql immutable as $$ select 0.95::numeric $$;

create or replace function gym_defender_hp_multiplier()
returns numeric language sql immutable as $$ select 0.95::numeric $$;

grant execute on function gym_attacker_atk_multiplier() to anon, authenticated;
grant execute on function gym_attacker_hp_multiplier() to anon, authenticated;
grant execute on function gym_defender_atk_multiplier() to anon, authenticated;
grant execute on function gym_defender_hp_multiplier() to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260727_gym_battle_balance_v8_attacker_nerf.sql

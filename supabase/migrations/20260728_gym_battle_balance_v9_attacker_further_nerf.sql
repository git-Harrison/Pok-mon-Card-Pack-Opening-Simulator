-- ============================================================
-- 체육관 전투 밸런스 v9 — 공격자 추가 너프 (약한 공격자 우세).
--
-- 사용자 보고:
--   "v8 적용 후에도 공격자 덱이 방어덱보다 더 강함. 평준화될 수
--    있게 공격자 좀 더 너프."
--
-- v8 (현재) 멀티플라이어 비:
--   공 ATK / 방 ATK = 1.15 / 0.95 = 1.21  (+21%)
--   공 HP  / 방 HP  = 1.15 / 0.95 = 1.21  (+21%)
-- → 공격자 멀티 우위 21% + 선공이 겹쳐 방어덱이 의미 잃음.
--
-- 변경 (v8 → v9):
--   공격자 ATK : 1.15 → 1.05  (-9%)
--   공격자 HP  : 1.15 → 1.10  (-4%)
--   방어자 ATK : 0.95 → 1.00  (+5%)
--   방어자 HP  : 0.95 → 1.05  (+10%)
--
-- v9 멀티 비:
--   공 ATK / 방 ATK = 1.05 / 1.00 = 1.05  (+5%)
--   공 HP  / 방 HP  = 1.10 / 1.05 = 1.05  (+5%)
-- → 멀티 격차 21% → 5% 로 축소. 공격자 우세는 유지하되 방어덱 의미
--    회복.
--
-- 미변경:
--   MUR 방어자 HP   : 1.05  (그대로)
--   MUR 방어자 ATK  : 1.00  (그대로)
--   MUR 공격자 ATK  : 1.05  (그대로 — gym_mur_attack_multiplier)
--   체육관 속성 일치 ATK : 1.10  (그대로 — gym_type_match_multiplier)
--   카드 base stats / sqrt 정규화 캡 / 선공 룰 모두 그대로.
--
-- 손계산 (no-crit / jitter=1.0 / eff=1.0 / attacker-first / PCL10):
--   UR  공 182/41 vs UR  방 173/39
--     공→방 5턴 KO, 방→공 5턴 KO  → 공격자 1턴 차 승.
--   SAR 공 149/33 vs SAR 방 142/31
--     공→방 5턴 KO, 방→공 5턴 KO  → 공격자 1턴 차 승.
--   MUR 공 308/77 vs MUR 방 309/70
--     공→방 5턴 KO, 방→공 5턴 KO  → 공격자 1턴 차 승.
--   UR  공 vs MUR 방: 공 182/41 vs 방 309/70
--     공→방 8턴 KO, 방→공 3턴 KO  → 방어자 압도 (의도 유지).
--   SAR 공 vs MUR 방: 공 149/33 vs 방 309/70
--     공→방 10턴 KO, 방→공 3턴 KO  → 방어자 압도.
-- 결론: 같은 희귀도 공격자 1턴 차 승, 상위 방어덱 압도. v8 의 공격자
-- 압도 완화 + v6 의 방어덱 의미 부활 사이 균형점.
--
-- 자동 반영 (live read):
--   gym_pet_battle_stats / gym_defender_display_stats 가 매 호출마다
--   helper 들을 읽음 → 본 마이그레이션 적용 시 즉시 반영.
--
-- 멱등 — CREATE OR REPLACE 만 사용. 호출부/시그니처 변경 없음.
-- ============================================================

create or replace function gym_attacker_atk_multiplier()
returns numeric language sql immutable as $$ select 1.05::numeric $$;

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

notify pgrst, 'reload schema';

-- 마이그레이션: 20260728_gym_battle_balance_v9_attacker_further_nerf.sql

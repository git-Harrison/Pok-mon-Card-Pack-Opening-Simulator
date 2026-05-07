-- ============================================================
-- 체육관 전투 밸런스 v10 — 공격자 소폭 상향 (v9 너프 과도 보정).
--
-- 사용자 보고:
--   "v9 적용 후 공격자가 너무 약해진 느낌. 조금만 상향."
--
-- 히스토리 (멀티 격차 = 공/방 비율):
--   v7 : 공 1.25/1.25 vs 방 0.90/0.90  → +39%  (공격자 압도)
--   v8 : 공 1.15/1.15 vs 방 0.95/0.95  → +21%  (여전히 강함)
--   v9 : 공 1.05/1.10 vs 방 1.00/1.05  → +5%   (너무 약해짐)
--   v10: 공 1.10/1.10 vs 방 1.00/1.00  → +10%  (v8/v9 중간)
--
-- 변경 (v9 → v10):
--   공격자 ATK : 1.05 → 1.10  (+5%p)
--   공격자 HP  : 1.10 → 1.10  (유지)
--   방어자 ATK : 1.00 → 1.00  (유지)
--   방어자 HP  : 1.05 → 1.00  (-5%p)
--
-- 의도: 공/방 ATK·HP 격차 5% → 10% 로 2배. v8 의 21% 격차 절반 수준
-- 이라 공격자 압도까진 안 가되, 동급 매치업 1턴 차 승 회복.
--
-- 미변경:
--   MUR 방어자 HP   : 1.05  (그대로)
--   MUR 방어자 ATK  : 1.00  (그대로)
--   MUR 공격자 ATK  : 1.05  (그대로 — gym_mur_attack_multiplier)
--   체육관 속성 일치 ATK : 1.10  (그대로 — gym_type_match_multiplier)
--   카드 base stats / sqrt 정규화 캡 / 선공 룰 모두 그대로.
--
-- 손계산 (no-crit / jitter=1.0 / eff=1.0 / attacker-first / PCL10
-- / 속성 일치 미적용):
--
--   UR  공 182/43 vs UR  방 165/39
--     공→방 4턴 KO (165/43=3.84), 방→공 5턴 KO (182/39=4.67)
--     → 공격자 1턴 차 승.
--
--   SAR 공 149/34 vs SAR 방 135/31
--     공→방 4턴 KO (135/34=3.97), 방→공 5턴 KO (149/31=4.81)
--     → 공격자 1턴 차 승.
--
--   MUR 공 264/69 vs MUR 방 252/60
--     공 ATK = 60 × 1.10 × 1.05(MUR) = 69.3
--     방 HP  = 240 × 1.00 × 1.05(MUR_def) = 252
--     공→방 4턴 KO (252/69=3.65), 방→공 5턴 KO (264/60=4.4)
--     → 공격자 1턴 차 승.
--
--   UR  공 vs MUR 방: UR 공 182/43 vs MUR 방 252/60
--     공→방 6턴 KO (252/43=5.86), 방→공 4턴 KO (182/60=3.03)
--     → 방어자 압도 (의도 유지 — 한 등급 위 방어덱 의미 보존).
--
--   SAR 공 vs MUR 방: SAR 공 149/34 vs MUR 방 252/60
--     공→방 8턴 KO (252/34=7.41), 방→공 3턴 KO (149/60=2.48)
--     → 방어자 압도 (강한 방어덱 의미 보존).
--
-- 결론: 같은 희귀도 공격자 1턴 차 승 회복, 한 등급 위 방어덱 우위
-- 보존. v9 의 평준화 의도 유지하되 공격자 체감 우세 회복.
--
-- 자동 반영 (live read):
--   gym_pet_battle_stats / gym_defender_display_stats 가 매 호출마다
--   helper 들을 읽음 → 본 마이그레이션 적용 시 즉시 반영.
--
-- 멱등 — CREATE OR REPLACE 만 사용. 호출부/시그니처 변경 없음.
-- ============================================================

create or replace function gym_attacker_atk_multiplier()
returns numeric language sql immutable as $$ select 1.10::numeric $$;

create or replace function gym_attacker_hp_multiplier()
returns numeric language sql immutable as $$ select 1.10::numeric $$;

create or replace function gym_defender_atk_multiplier()
returns numeric language sql immutable as $$ select 1.00::numeric $$;

create or replace function gym_defender_hp_multiplier()
returns numeric language sql immutable as $$ select 1.00::numeric $$;

grant execute on function gym_attacker_atk_multiplier() to anon, authenticated;
grant execute on function gym_attacker_hp_multiplier() to anon, authenticated;
grant execute on function gym_defender_atk_multiplier() to anon, authenticated;
grant execute on function gym_defender_hp_multiplier() to anon, authenticated;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260735_gym_battle_balance_v10_attacker_slight_buff.sql

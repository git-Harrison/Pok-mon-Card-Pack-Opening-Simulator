-- ============================================================
-- 체육관 전투 밸런스 v7 — 공격자 추가 강화 + 방어덱 효율 약화.
--
-- 사용자 보고: 도전자가 너무 어렵다. 방어덱 3마리 우위가 과해
-- 같은 희귀도 / 살짝 낮은 희귀도 공격자가 거의 못 이김.
--
-- 변경 (v6 → v7):
--   공격자 ATK : 1.15 → 1.25  (+9%)
--   공격자 HP  : 1.10 → 1.25  (+14%)  ← 첫 펫 빨리 사망 완화
--   방어자 ATK : 1.00 → 0.90  (-10%)
--   방어자 HP  : 1.05 → 0.90  (-14%)  ← 가장 큰 변화 — 짧은 KO
--   MUR 방어자 HP 보너스 : 1.15 → 1.05  ← MUR 압도 완화
--   MUR 방어자 ATK 보너스: 1.10 → 1.00  ← MUR 압도 완화
--
-- MUR 공격자 ATK 보너스(1.05) 와 카드 base stats 표는 변경 없음
-- (희귀도별 raw 차이는 그대로 유지).
--
-- 손계산 (no-crit / jitter=1.0 / eff=1.0 / attacker-first / PCL10):
--   SAR 공 162/39 vs SAR 방 122/28
--     S→D 4턴 KO, D→S 5턴 KO  → 공격자 1턴 차 승.
--   UR  공 206/49 vs UR  방 149/35
--     U→U 5턴 KO, D→A 6턴 KO  → 공격자 1턴 차 승.
--   MUR 공 350/92 vs MUR 방 264/63
--     M→M 3턴 KO  → 강한 매치업 더 빠르게.
--   SAR 공 vs MUR 방: MUR 264/63 vs SAR 162/39
--     SAR→MUR 7턴 KO, MUR→SAR 5턴 KO  → MUR 방어자 우세 (의도 유지).
--   UR  공 vs MUR 방: MUR 264/63 vs UR 206/49
--     UR→MUR 5턴 KO, MUR→UR 5턴 KO  → 백중 (이전엔 MUR 압도).
-- 결론: 같은 희귀도 공격자 우세 유지, MUR 방어 우위는 살아있되 압도
-- 정도 완화 — 사용자 의도 부합.
--
-- 멱등 — CREATE OR REPLACE 만 사용, 호출부/시그니처 변경 없음.
-- ============================================================

-- ── 1) 4 multiplier helpers — v7 수치 ──
create or replace function gym_attacker_atk_multiplier()
returns numeric language sql immutable as $$ select 1.25::numeric $$;

create or replace function gym_attacker_hp_multiplier()
returns numeric language sql immutable as $$ select 1.25::numeric $$;

create or replace function gym_defender_atk_multiplier()
returns numeric language sql immutable as $$ select 0.90::numeric $$;

create or replace function gym_defender_hp_multiplier()
returns numeric language sql immutable as $$ select 0.90::numeric $$;

grant execute on function gym_attacker_atk_multiplier() to anon, authenticated;
grant execute on function gym_attacker_hp_multiplier() to anon, authenticated;
grant execute on function gym_defender_atk_multiplier() to anon, authenticated;
grant execute on function gym_defender_hp_multiplier() to anon, authenticated;

-- ── 2) MUR 방어자 보너스 — 상향분 일부 환수 ──
-- 1.15/1.10 → 1.05/1.00. MUR 카드가 방어덱일 때 한 등급 위 체감은
-- 유지되나 v6 의 "압도적" 정도는 아닌 수준으로 조정.
create or replace function gym_mur_defender_hp_multiplier()
returns numeric language sql immutable as $$ select 1.05::numeric $$;

create or replace function gym_mur_defender_atk_multiplier()
returns numeric language sql immutable as $$ select 1.00::numeric $$;

grant execute on function gym_mur_defender_hp_multiplier() to anon, authenticated;
grant execute on function gym_mur_defender_atk_multiplier() to anon, authenticated;

notify pgrst, 'reload schema';

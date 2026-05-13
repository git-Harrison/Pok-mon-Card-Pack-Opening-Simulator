-- ============================================================
-- 체육관 챕터 4 — "뒤바뀐 영혼" (ch4-b4-s4) 데미지 부여
--
-- 피드백: "뒤바뀐 영혼 시전해도 데미지가 안 들어감"
--
-- 원인:
--   kind 가 'self_buff' 라 의도상 자기 ATK 버프만 부여 (데미지 0).
--   추가로 엔진이 보스의 self_buff atk_up 을 후속 공격에 적용하지 않아
--   화려한 시각효과만 있고 실효 0 인 죽은 스킬.
--
-- 수정:
--   kind 'self_buff' → 'aoe'  (강력한 광역 공격으로 전환)
--   power 0.5 → 1.7           (Stage 4 AOE 수준)
--   cooldown_turns 99 → 4     (phase 2 내 주기적 발동)
--   ai_priority 7 유지        (차원 베기 8 다음 우선)
--   이름/시각효과 그대로
--
-- 결과 (phase 2 로테이션 예시):
--   R1: 차원 베기   (s5 ai_pri 8)
--   R2: 뒤바뀐 영혼 (s4 ai_pri 7, AOE)
--   R3: 차원의 휘몰아침 (s2 ai_pri 6, AOE)
--   R4: 섀도 클로   (s1)
--   R5: 차원 베기   (s5 cd 끝)
-- ============================================================

update ch4_boss_skills
   set kind           = 'aoe',
       power          = 1.7,
       cooldown_turns = 4
 where id = 'ch4-b4-s4';

notify pgrst, 'reload schema';

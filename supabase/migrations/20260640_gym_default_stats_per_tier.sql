-- ============================================================
-- default 체육관 펫 스탯 — 챕터/하위 티어별 정밀 재조정
--
-- 사용자 요청: PCL 10 만 쓰는 체육관에서 PCL10 AR 3장만으로 모든
-- 체육관을 깨면 안 되고, 챕터/티어에 맞는 희귀도가 필요해야 함.
-- 즉 "최소 전투력 + 속성 일치 + PCL10 + 희귀도 + 슬롯 조합" 모두
-- 의미 있게 작동해야 함.
--
-- 기존(20260637): 난이도(EASY/NORMAL/HARD/BOSS) 단위 4-tier 정규화.
--   문제: 같은 난이도 내에서 풀↔물↔바위 가 똑같이 EASY 였고,
--         18 체육관 progression 이 거칠게 4 단계로만 갈렸음.
-- 신규: 체육관 18개 각각 per-gym 스탯. 챕터 1 안에서도 초반/중반/후반
--   3 단계로 세분화하고, 챕터 3 7개도 smooth ramp.
--
-- 챕터/티어별 클리어 기준 (사용자 명시):
--   Ch1 초반 (풀/물/바위)            — AR/SR PCL10 × 3
--   Ch1 중반 (전기/불꽃/땅)           — SR/SAR
--   Ch1 후반 (얼음/에스퍼)            — SAR/UR
--   Ch2     (노말/격투/벌레)          — UR 중심 (일부 SAR 가능)
--   Ch3     (독/비행/고스트/페어리/   — UR/MUR 중심
--            강철/악/드래곤)            (후반부일수록 MUR 필수)
--
-- 검증 (gym_pet_battle_stats v3 산식 + 속성일치 ATK ×1.10 + 도전자 선공):
--   · AR ×3 cp 30k : 풀 클리어 가능, 전기 부터 어려움.
--   · SR ×3       : Ch1 후반(얼음) 까지 빡빡, 에스퍼 부터 안정.
--   · SAR ×3      : Ch2 보통, 독 까지는 무리.
--   · UR ×3       : Ch3 초중반(독~고스트) 안정, 강철 부터 한계.
--   · MUR ×3      : Ch3 전체 안정, 드래곤 슬롯3 까지 클리어.
--   · UR×3 vs 드래곤: 패배 — MUR 필수 layer 확보.
-- ============================================================

-- 슬롯 1(선봉) → 3(대장) 순서대로 강해짐.
-- 챕터/티어 progression 은 min_power 곡선과 동조.

update gym_pokemon gp
   set hp = case gp.gym_id
       -- ── Ch1 초반 (AR/SR clear) ─────────────────────────
       when 'gym-grass'    then case gp.slot when 1 then  50 when 2 then  65 when 3 then  80 end
       when 'gym-water'    then case gp.slot when 1 then  60 when 2 then  75 when 3 then  92 end
       when 'gym-rock'     then case gp.slot when 1 then  70 when 2 then  88 when 3 then 108 end
       -- ── Ch1 중반 (SR/SAR clear) ────────────────────────
       when 'gym-electric' then case gp.slot when 1 then  82 when 2 then 102 when 3 then 125 end
       when 'gym-fire'     then case gp.slot when 1 then  95 when 2 then 118 when 3 then 145 end
       when 'gym-ground'   then case gp.slot when 1 then 110 when 2 then 135 when 3 then 165 end
       -- ── Ch1 후반 (SAR/UR clear) ────────────────────────
       when 'gym-ice'      then case gp.slot when 1 then 125 when 2 then 155 when 3 then 190 end
       when 'gym-psychic'  then case gp.slot when 1 then 140 when 2 then 175 when 3 then 215 end
       -- ── Ch2 (UR 중심) ──────────────────────────────────
       when 'gym-normal'   then case gp.slot when 1 then 155 when 2 then 190 when 3 then 230 end
       when 'gym-fighting' then case gp.slot when 1 then 170 when 2 then 210 when 3 then 255 end
       when 'gym-bug'      then case gp.slot when 1 then 185 when 2 then 230 when 3 then 280 end
       -- ── Ch3 (UR/MUR — 후반일수록 MUR 필수) ────────────
       when 'gym-poison'   then case gp.slot when 1 then 200 when 2 then 245 when 3 then 295 end
       when 'gym-flying'   then case gp.slot when 1 then 215 when 2 then 265 when 3 then 320 end
       when 'gym-ghost'    then case gp.slot when 1 then 230 when 2 then 285 when 3 then 345 end
       when 'gym-fairy'    then case gp.slot when 1 then 250 when 2 then 305 when 3 then 370 end
       when 'gym-steel'    then case gp.slot when 1 then 270 when 2 then 330 when 3 then 400 end
       when 'gym-dark'     then case gp.slot when 1 then 290 when 2 then 355 when 3 then 430 end
       when 'gym-dragon'   then case gp.slot when 1 then 320 when 2 then 390 when 3 then 475 end
       else gp.hp
     end,
       atk = case gp.gym_id
       -- ── Ch1 초반 ──
       when 'gym-grass'    then case gp.slot when 1 then  10 when 2 then  13 when 3 then  16 end
       when 'gym-water'    then case gp.slot when 1 then  12 when 2 then  15 when 3 then  19 end
       when 'gym-rock'     then case gp.slot when 1 then  14 when 2 then  17 when 3 then  22 end
       -- ── Ch1 중반 ──
       when 'gym-electric' then case gp.slot when 1 then  17 when 2 then  21 when 3 then  27 end
       when 'gym-fire'     then case gp.slot when 1 then  20 when 2 then  26 when 3 then  32 end
       when 'gym-ground'   then case gp.slot when 1 then  24 when 2 then  30 when 3 then  37 end
       -- ── Ch1 후반 ──
       when 'gym-ice'      then case gp.slot when 1 then  28 when 2 then  35 when 3 then  43 end
       when 'gym-psychic'  then case gp.slot when 1 then  32 when 2 then  40 when 3 then  50 end
       -- ── Ch2 ──
       when 'gym-normal'   then case gp.slot when 1 then  36 when 2 then  44 when 3 then  53 end
       when 'gym-fighting' then case gp.slot when 1 then  40 when 2 then  50 when 3 then  60 end
       when 'gym-bug'      then case gp.slot when 1 then  45 when 2 then  56 when 3 then  68 end
       -- ── Ch3 ──
       when 'gym-poison'   then case gp.slot when 1 then  50 when 2 then  60 when 3 then  72 end
       when 'gym-flying'   then case gp.slot when 1 then  54 when 2 then  65 when 3 then  78 end
       when 'gym-ghost'    then case gp.slot when 1 then  58 when 2 then  70 when 3 then  85 end
       when 'gym-fairy'    then case gp.slot when 1 then  63 when 2 then  76 when 3 then  92 end
       when 'gym-steel'    then case gp.slot when 1 then  68 when 2 then  82 when 3 then 100 end
       when 'gym-dark'     then case gp.slot when 1 then  74 when 2 then  90 when 3 then 108 end
       when 'gym-dragon'   then case gp.slot when 1 then  82 when 2 then 100 when 3 then 120 end
       else gp.atk
     end;

notify pgrst, 'reload schema';

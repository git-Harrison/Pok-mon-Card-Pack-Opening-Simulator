/**
 * 내 포켓몬 LV → 유저 전투력 보너스 (정액).
 *
 * 표시/랭킹용 성장 지표. 체육관 실제 전투 스탯 (gym_pet_battle_stats)
 * 산식에는 절대 들어가지 않음 — center_power 표시값 (프로필/랭킹/내
 * 포켓몬 페이지) 에만 합산.
 *
 * 동일한 수치를 서버 함수 starter_level_power_bonus(int) 가 들고 있고,
 * get_profile / get_user_rankings 의 center_power 합산에 반영. 표 변경
 * 시 양쪽을 같이 업데이트.
 */
export const STARTER_LEVEL_POWER: Record<number, number> = {
  1:    10_000,
  2:    15_000,
  3:    21_000,
  4:    28_000,
  5:    36_000,
  6:    45_000,
  7:    55_000,
  8:    66_000,
  9:    78_000,
  10:   95_000,
  11:  112_000,
  12:  130_000,
  13:  150_000,
  14:  172_000,
  15:  196_000,
  16:  222_000,
  17:  250_000,
  18:  280_000,
  19:  312_000,
  20:  350_000,
  21:  390_000,
  22:  435_000,
  23:  485_000,
  24:  540_000,
  25:  600_000,
  26:  670_000,
  27:  750_000,
  28:  840_000,
  29:  940_000,
  30: 1_050_000,
};

/** 레벨 → 보너스. 범위 밖은 가장 가까운 끝 값으로 클램프. 0 이하면 0. */
export function starterLevelPower(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  const lv = Math.min(30, Math.max(1, Math.floor(level)));
  return STARTER_LEVEL_POWER[lv] ?? 0;
}

import type { WildType } from "./types";

/**
 * Type effectiveness matrix — attacker → defender → multiplier.
 * Values sourced verbatim from the user's spec.
 *
 * Multipliers:
 *   2   = 효과가 굉장했다!
 *   1   = normal (default, omitted from the table)
 *   0.5 = 효과가 별로였다…
 *   0   = 전혀 효과가 없었다…
 */

type Chart = Partial<Record<WildType, Partial<Record<WildType, number>>>>;

const CHART: Chart = {
  노말: {
    고스트: 0,
    바위: 0.5,
    강철: 0.5,
  },
  불꽃: {
    풀: 2,
    얼음: 2,
    벌레: 2,
    강철: 2,
    물: 0.5,
    바위: 0.5,
    불꽃: 0.5,
    드래곤: 0.5,
  },
  물: {
    불꽃: 2,
    땅: 2,
    바위: 2,
    물: 0.5,
    풀: 0.5,
    드래곤: 0.5,
  },
  전기: {
    물: 2,
    비행: 2,
    풀: 0.5,
    전기: 0.5,
    드래곤: 0.5,
    땅: 0,
  },
  풀: {
    물: 2,
    땅: 2,
    바위: 2,
    불꽃: 0.5,
    풀: 0.5,
    독: 0.5,
    비행: 0.5,
    벌레: 0.5,
    드래곤: 0.5,
    강철: 0.5,
  },
  얼음: {
    풀: 2,
    땅: 2,
    비행: 2,
    드래곤: 2,
    불꽃: 0.5,
    물: 0.5,
    얼음: 0.5,
    강철: 0.5,
  },
  격투: {
    노말: 2,
    얼음: 2,
    바위: 2,
    악: 2,
    강철: 2,
    비행: 0.5,
    에스퍼: 0.5,
    벌레: 0.5,
    페어리: 0.5,
    고스트: 0,
  },
  땅: {
    불꽃: 2,
    전기: 2,
    독: 2,
    바위: 2,
    강철: 2,
    풀: 0.5,
    벌레: 0.5,
    비행: 0,
  },
  비행: {
    풀: 2,
    격투: 2,
    벌레: 2,
    전기: 0.5,
    바위: 0.5,
    강철: 0.5,
  },
  에스퍼: {
    격투: 2,
    독: 2,
    강철: 0.5,
    악: 0,
  },
  벌레: {
    풀: 2,
    에스퍼: 2,
    악: 2,
    불꽃: 0.5,
    격투: 0.5,
    독: 0.5,
    비행: 0.5,
    고스트: 0.5,
    강철: 0.5,
    페어리: 0.5,
  },
  바위: {
    불꽃: 2,
    얼음: 2,
    비행: 2,
    벌레: 2,
    격투: 0.5,
    땅: 0.5,
    강철: 0.5,
  },
  고스트: {
    고스트: 2,
    에스퍼: 2,
    악: 0.5,
    노말: 0,
  },
  드래곤: {
    드래곤: 2,
    강철: 0.5,
    페어리: 0,
  },
  악: {
    에스퍼: 2,
    고스트: 2,
    격투: 0.5,
    악: 0.5,
    페어리: 0.5,
  },
  강철: {
    얼음: 2,
    바위: 2,
    페어리: 2,
    불꽃: 0.5,
    물: 0.5,
    전기: 0.5,
    강철: 0.5,
  },
  페어리: {
    격투: 2,
    드래곤: 2,
    악: 2,
    불꽃: 0.5,
    독: 0.5,
    강철: 0.5,
  },
  독: {
    풀: 2,
    페어리: 2,
    독: 0.5,
    땅: 0.5,
    바위: 0.5,
    고스트: 0.5,
    강철: 0,
  },
};

export function effectiveness(attacker: WildType, defender: WildType): number {
  return CHART[attacker]?.[defender] ?? 1;
}

export function effectivenessLabel(mult: number): {
  text: string;
  tone: "crit" | "good" | "normal" | "bad" | "immune";
} {
  if (mult === 0) return { text: "전혀 효과가 없었다…", tone: "immune" };
  if (mult >= 2) return { text: "효과가 굉장했다!", tone: "crit" };
  if (mult <= 0.5) return { text: "효과가 별로였다…", tone: "bad" };
  return { text: "", tone: "normal" };
}

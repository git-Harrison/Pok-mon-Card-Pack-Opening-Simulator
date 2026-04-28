/**
 * 카드 리스트 중복 그룹화 — 같은 카드(card_id) 의 같은 PCL 등급(grade)
 * 슬랩들을 하나의 표시 단위로 묶는다.
 *
 * 같은 카드라도 PCL 등급이 다르면 (예: PCL10 vs PCL9) 가치가 크게
 * 다르므로 별도 그룹으로 유지.
 *
 * 사용 예:
 *   groupGradings(items, (it) => ({ cardId: it.card.id, grade: it.grading.grade }))
 *   → 각 그룹은 { rep, count, all }
 */

export interface GradingGroup<T> {
  /** 그룹 내 첫 항목 — 클릭 시 기본 타겟. */
  rep: T;
  /** 그룹 내 총 항목 수 (중복 보유 수량). */
  count: number;
  /** 그룹 내 모든 원본 항목 — 개별 grading_id 가 필요한 액션용. */
  all: T[];
}

/**
 * 항목 배열을 (card_id, grade) 기준으로 그룹화. 입력 순서를 보존하며,
 * 그룹의 rep 은 그 그룹에서 처음 등장한 항목.
 *
 * @param items     원본 항목 배열 (이미 정렬된 상태)
 * @param keyFn     항목에서 (cardId, grade) 추출하는 함수
 * @returns         그룹 배열 (입력 순서 유지)
 */
export function groupGradings<T>(
  items: readonly T[],
  keyFn: (item: T) => { cardId: string; grade: number }
): GradingGroup<T>[] {
  const map = new Map<string, GradingGroup<T>>();
  const order: string[] = [];
  for (const it of items) {
    const k = keyFn(it);
    const key = `${k.cardId}@${k.grade}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.all.push(it);
    } else {
      const group: GradingGroup<T> = { rep: it, count: 1, all: [it] };
      map.set(key, group);
      order.push(key);
    }
  }
  return order.map((k) => map.get(k)!);
}

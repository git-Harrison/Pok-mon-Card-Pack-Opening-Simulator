/** 카드 보유 한도 — 단일 source of truth.
 *
 *  서버 cap (record_pack_pulls_batch / record_pack_pull_v4 /
 *   assert_pcl_cap / process_grading_job_chunk / bulk_submit_pcl_grading)
 *  와 sync 필수. 변경 시:
 *    1) 본 상수 갱신
 *    2) 마이그레이션 추가 (서버 함수의 hardcoded cap 값)
 *    3) 마이그레이션 파일명 주석에 표기
 *  마지막 갱신: 20260687_caps_200k_100k.sql.
 *
 *  의미:
 *    · CARD_CAP   : 일반 카드 (card_ownership.count 합) 보유 한도.
 *                   박스 오픈 / 카드 획득 시 cap 검사.
 *                   PCL 감별 입력 (감별 대상 카드 수) 도 동일 한도.
 *    · PCL_CAP    : PCL 슬랩 (psa_gradings row 수) 보유 한도.
 *                   감별 결과 저장 cap (감별 통과해 슬랩 mint 시 검사).
 *
 *  감별 입력 한도 vs 저장 한도 분리 — 입력은 CARD_CAP, 저장은 PCL_CAP.
 *  서버 process_grading_job_chunk 가 chunk 별 v_pcl_room 으로 PCL_CAP
 *  검사, 초과 시 cap_skipped_count 증가 + 카드는 소비됨 (정책 유지).
 */
export const CARD_CAP = 200_000;
export const PCL_CAP = 100_000;

/** UI 약식 라벨 — `<CountBadge cap="..." />` 등에 사용. */
export const CARD_CAP_LABEL = "20만";
export const PCL_CAP_LABEL = "10만";

/** 풀 텍스트 라벨 — 도움말 / 메시지 / 토스트 등 명확한 안내용. */
export const CARD_CAP_TEXT = "200,000장";
export const PCL_CAP_TEXT = "100,000장";

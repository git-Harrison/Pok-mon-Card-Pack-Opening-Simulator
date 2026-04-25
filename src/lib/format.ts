/**
 * Korean-style number formatting for points displays.
 *
 * Rules:
 *   < 10,000              → "9,999p"
 *   10,000 ≤ n < 1억      → "1,259만 433p"  (만 + sub-만 if non-zero)
 *   ≥ 1억                 → "1억 2,345만p"  (drops sub-만)
 *
 * The trailing "p" is included for points displays.
 */
export function formatKoreanPoints(n: number): string {
  const num = Math.floor(Math.max(0, n));
  if (num < 10000) return `${num.toLocaleString("ko-KR")}p`;

  const EOK = 100_000_000;
  const MAN = 10_000;

  if (num >= EOK) {
    const eok = Math.floor(num / EOK);
    const man = Math.floor((num % EOK) / MAN);
    if (man > 0) {
      return `${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만p`;
    }
    return `${eok.toLocaleString("ko-KR")}억p`;
  }

  // 1만 ≤ n < 1억
  const man = Math.floor(num / MAN);
  const rest = num % MAN;
  if (rest > 0) {
    return `${man.toLocaleString("ko-KR")}만 ${rest.toLocaleString("ko-KR")}p`;
  }
  return `${man.toLocaleString("ko-KR")}만p`;
}

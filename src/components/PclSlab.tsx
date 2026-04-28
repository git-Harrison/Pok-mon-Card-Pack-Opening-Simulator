"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import type { Card } from "@/lib/types";
import { GRADE_BRAND, PCL_LABEL, pclTone } from "@/lib/pcl";
import RarityBadge from "./RarityBadge";
import { resolveCardType } from "@/lib/wild/name-to-type";
import { TYPE_STYLE } from "@/lib/wild/types";

/**
 * PCL grading slab — 전역 공통 컴포넌트.
 *
 * 슬랩 내부에 표시:
 *   · PCL 브랜드 마크 (header 좌)
 *   · PCL 등급 (header 우, 큰 숫자)
 *   · GEM MINT 등 등급 라벨 (header 가운데)
 *   · 카드 이미지 (메인 영역, aspect 5/7)
 *   · 카드 희귀도 뱃지 (이미지 좌하단 overlay)
 *   · 카드 속성 뱃지 (이미지 우하단 overlay)
 *
 * 의도적으로 표시 안 하는 정보 (호출자가 슬랩 아래 별도 텍스트로 표시):
 *   · 카드 이름
 *   · 카드 번호
 *
 * 모든 값은 missing/invalid 시에도 깨지지 않도록 fallback. 모바일 반응형.
 */
export default function PclSlab({
  card,
  grade,
  size = "md",
  highlight = false,
  /** @deprecated — 이 컴포넌트는 더 이상 카드 이름/번호를 내부 표시하지
   *  않으므로 compact 분기는 사실상 의미 없음. 호환 위해 prop 만 유지. */
  compact: _compact = false,
}: {
  card: Card;
  grade: number;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
  compact?: boolean;
}) {
  void _compact;
  const tone = pclTone(grade);
  const label = PCL_LABEL[grade] ?? "PCL";
  const safeGrade =
    typeof grade === "number" && Number.isFinite(grade) ? grade : "?";

  // 카드 속성 — fallback: 매핑 없으면 뱃지 hide.
  const cardType = card?.name ? resolveCardType(card.name) : null;

  // 컨테이너 폭 — 사이즈 cap 으로 grid 셀 안에서 안전.
  const width =
    size === "sm"
      ? "w-full max-w-[150px]"
      : size === "lg"
      ? "w-full max-w-[320px]"
      : "w-full max-w-[220px]";

  return (
    <motion.div
      initial={false}
      animate={highlight ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 1.2, times: [0, 0.5, 1] }}
      className={clsx(
        "relative rounded-[22px] p-[3px] isolate select-none",
        tone.glow,
        width
      )}
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.35) 35%, rgba(255,255,255,0.15) 55%, rgba(255,255,255,0.55) 100%)",
        boxShadow:
          "0 20px 44px -20px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.55)",
      }}
    >
      <div
        className={clsx(
          "relative rounded-[19px] overflow-hidden ring-1",
          "bg-[linear-gradient(168deg,#1a1030_0%,#231847_45%,#0b0620_100%)]",
          tone.ring
        )}
      >
        {/* 홀로그래픽 sheen */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background:
              "linear-gradient(130deg, rgba(255,255,255,0) 0%, rgba(147,197,253,0.12) 25%, rgba(236,72,153,0.10) 50%, rgba(250,204,21,0.10) 75%, rgba(255,255,255,0) 100%)",
          }}
        />
        {/* 상단 가장자리 하이라이트 */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
          }}
        />

        {/* ── Header — 인증서 스탬프 스타일 ──
              ┌──────────────────────────┐
              │ PCL ★★★★★      ⦿ 10 ⦿  │
              │            GEM MINT       │
              └──────────────────────────┘ */}
        <div className="relative px-2.5 md:px-3 py-1.5 md:py-2 flex items-center gap-2">
          {/* 좌측: PCL 브랜드 + 별점 */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className={clsx(
                  "text-[10px] md:text-[11px] font-black tracking-[0.2em] leading-none",
                  tone.text
                )}
                style={{ fontFamily: "monospace" }}
              >
                {GRADE_BRAND}
              </span>
              <span className={clsx("text-[8px] tracking-widest leading-none", tone.text)}>
                {"★".repeat(Math.max(0, Math.min(5, safeGrade === "?" ? 0 : safeGrade - 5)))}
                {"☆".repeat(Math.max(0, 5 - Math.max(0, Math.min(5, safeGrade === "?" ? 0 : (safeGrade as number) - 5))))}
              </span>
            </div>
            <span
              className={clsx(
                "text-[8px] md:text-[9px] uppercase tracking-[0.22em] font-bold leading-none truncate",
                tone.text
              )}
            >
              {label}
            </span>
          </div>
          {/* 우측: 원형 grade seal */}
          <div
            className={clsx(
              "shrink-0 relative w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center",
              "ring-2 ring-white/30",
              tone.banner
            )}
            style={{
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.35), 0 4px 10px -2px rgba(0,0,0,0.5)",
            }}
          >
            {/* 외곽 점선 stamp */}
            <span
              aria-hidden
              className="absolute inset-0.5 rounded-full border border-dashed border-white/40 pointer-events-none"
            />
            <span className="relative text-base md:text-lg font-black tabular-nums leading-none">
              {safeGrade}
            </span>
          </div>
        </div>

        {/* 헤더-카드 사이 디바이더 */}
        <div className="h-px bg-white/5" />

        {/* ── 카드 이미지 영역 ── */}
        <div
          className="relative m-1.5 md:m-2 rounded-md overflow-hidden ring-1 ring-white/10 bg-zinc-950"
          style={{
            boxShadow:
              "inset 0 0 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div className="relative aspect-[5/7]">
            {card?.imageUrl ? (
              <img
                src={card.imageUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="w-full h-full object-contain bg-zinc-950 select-none pointer-events-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/70 text-xs p-2 text-center bg-gradient-to-br from-indigo-700 to-amber-600">
                {/* 이미지 로딩 실패 / 미보유 fallback — 이름 노출 안 함
                    (외부 텍스트 영역에 이미 있음). */}
                <span aria-hidden className="text-2xl">🃏</span>
              </div>
            )}
            {/* 유리 반사 sweep */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%)",
              }}
            />
            {/* 좌하단 — 희귀도 뱃지 */}
            {card?.rarity && (
              <div className="absolute left-1.5 bottom-1.5 pointer-events-none">
                <RarityBadge rarity={card.rarity} size="xs" />
              </div>
            )}
            {/* 우하단 — 속성 뱃지 (있을 때만) */}
            {cardType && TYPE_STYLE[cardType] && (
              <div className="absolute right-1.5 bottom-1.5 pointer-events-none">
                <span
                  className={clsx(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black ring-1 ring-white/20",
                    TYPE_STYLE[cardType].badge
                  )}
                >
                  {cardType}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 하단 micro padding — 카드 이미지 ring 과 슬랩 케이스 사이 여유. */}
        <div className="h-1 md:h-1.5" />
      </div>
    </motion.div>
  );
}

import type { WildType } from "@/lib/wild/types";

/** 18개 타입 별 색상 — 메달 본체 색. 외곽은 항상 금테. */
const TYPE_HEX: Record<WildType, { main: string; dark: string }> = {
  "노말":   { main: "#a8a29e", dark: "#57534e" },
  "불꽃":   { main: "#f97316", dark: "#7c2d12" },
  "물":     { main: "#3b82f6", dark: "#1e3a8a" },
  "풀":     { main: "#22c55e", dark: "#14532d" },
  "전기":   { main: "#facc15", dark: "#854d0e" },
  "얼음":   { main: "#67e8f9", dark: "#155e75" },
  "격투":   { main: "#dc2626", dark: "#7f1d1d" },
  "독":     { main: "#a855f7", dark: "#581c87" },
  "땅":     { main: "#b45309", dark: "#78350f" },
  "비행":   { main: "#a5b4fc", dark: "#3730a3" },
  "에스퍼": { main: "#ec4899", dark: "#831843" },
  "벌레":   { main: "#84cc16", dark: "#3f6212" },
  "바위":   { main: "#a8a29e", dark: "#44403c" },
  "고스트": { main: "#7c3aed", dark: "#3b0764" },
  "드래곤": { main: "#6366f1", dark: "#312e81" },
  "악":     { main: "#52525b", dark: "#0a0a0a" },
  "강철":   { main: "#94a3b8", dark: "#475569" },
  "페어리": { main: "#f472b6", dark: "#9d174d" },
};

/** 메달 아이콘 — 외곽 금테 + type 색 본체 + type 별 픽셀 심볼.
 *  포켓몬 게임 짐 배지(체육관 메달) 느낌. SVG 라 어디서 키워도 깨끗함. */
export default function GymMedalIcon({
  type,
  size = 40,
  className,
}: {
  type: WildType;
  size?: number;
  className?: string;
}) {
  const c = TYPE_HEX[type] ?? TYPE_HEX["노말"];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden
    >
      {/* 외곽 금테 그라데 */}
      <defs>
        <radialGradient id={`g-${type}-rim`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.5" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#a16207" />
        </radialGradient>
        <radialGradient id={`g-${type}-body`} cx="38%" cy="32%" r="78%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor={c.main} />
          <stop offset="1" stopColor={c.dark} />
        </radialGradient>
      </defs>
      {/* 리본 (배경) — 작은 V 자 두 줄 */}
      <path d="M5 18 L8 23 L11 19 Z" fill="#dc2626" />
      <path d="M19 18 L16 23 L13 19 Z" fill="#dc2626" />
      <path d="M7 19 L9 22 L11 19 Z" fill="#991b1b" />
      <path d="M17 19 L15 22 L13 19 Z" fill="#991b1b" />
      {/* 메달 본체 */}
      <circle cx="12" cy="11" r="9.5" fill={`url(#g-${type}-rim)`} />
      <circle cx="12" cy="11" r="7.5" fill={`url(#g-${type}-body)`} />
      {/* 심볼 */}
      <Symbol type={type} />
      {/* 윗쪽 하이라이트 */}
      <ellipse cx="9" cy="7.5" rx="3" ry="1.4" fill="#ffffff" opacity="0.35" />
    </svg>
  );
}

/** Type 별 심볼 — 흰 path 또는 단순 도형. */
function Symbol({ type }: { type: WildType }) {
  switch (type) {
    case "풀":
      return (
        <path
          d="M12 6 C 9 8, 8 11, 12 14 C 16 11, 15 8, 12 6 Z M12 14 L12 16"
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="0.6"
        />
      );
    case "물":
      return (
        <path
          d="M12 6 C 9 9, 8 12, 9.5 14 C 11 15.5, 13 15.5, 14.5 14 C 16 12, 15 9, 12 6 Z"
          fill="#ffffff"
          opacity="0.95"
        />
      );
    case "불꽃":
      return (
        <path
          d="M12 5 C 14 8, 15 10, 13 12 C 14 12, 15 13, 14.5 14.5 C 13 16, 11 16, 9.5 14.5 C 8 13, 9 10, 12 5 Z"
          fill="#ffffff"
        />
      );
    case "전기":
      return (
        <path
          d="M13 5 L8 11 L11 11 L9 16 L15 9 L12 9 L14 5 Z"
          fill="#ffffff"
        />
      );
    case "얼음":
      return (
        <g stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round">
          {/* 6각 눈송이 */}
          <line x1="12" y1="5"  x2="12" y2="17" />
          <line x1="6.8" y1="8"  x2="17.2" y2="14" />
          <line x1="6.8" y1="14" x2="17.2" y2="8" />
          {/* 가지 */}
          <path d="M12 6 L10.5 7.5 M12 6 L13.5 7.5 M12 16 L10.5 14.5 M12 16 L13.5 14.5" />
        </g>
      );
    case "땅":
      return (
        <g fill="#ffffff">
          {/* 산 + 평지 */}
          <path d="M5 15 L9 9 L12 13 L15 7 L19 15 Z" />
          <rect x="5" y="14" width="14" height="1.5" />
        </g>
      );
    case "바위":
      return (
        <g fill="#ffffff">
          {/* 육각 + 균열 */}
          <polygon points="12,5 18,8 18,14 12,17 6,14 6,8" />
          <path d="M12 5 L12 11 L18 14 M12 11 L6 14" stroke="#a8a29e" strokeWidth="0.7" fill="none"/>
        </g>
      );
    case "에스퍼":
      return (
        <g fill="#ffffff">
          <ellipse cx="12" cy="11" rx="6" ry="3.2" />
          <circle cx="12" cy="11" r="2" fill="#ec4899" />
          <circle cx="12.5" cy="10.5" r="0.7" fill="#ffffff" />
        </g>
      );
    case "노말":
      return (
        <g fill="#ffffff">
          <circle cx="12" cy="11" r="3.5" />
          <circle cx="12" cy="11" r="1.5" fill="#a8a29e" />
        </g>
      );
    case "비행":
      return (
        <path
          d="M5 11 C 8 9, 11 9, 12 11 C 13 9, 16 9, 19 11 C 16 12, 13 11, 12 13 C 11 11, 8 12, 5 11 Z"
          fill="#ffffff"
        />
      );
    case "격투":
      return (
        <g fill="#ffffff">
          {/* 주먹 */}
          <rect x="8.5" y="8" width="7" height="6" rx="1.2" />
          <rect x="9" y="6.5" width="1.5" height="2.5" rx="0.5" />
          <rect x="11" y="6" width="1.5" height="3" rx="0.5" />
          <rect x="13" y="6.5" width="1.5" height="2.5" rx="0.5" />
        </g>
      );
    case "독":
      return (
        <g fill="#ffffff">
          {/* 해골 */}
          <circle cx="12" cy="10" r="4" />
          <rect x="9.5" y="14" width="5" height="2" rx="0.5" />
          <circle cx="10.5" cy="10" r="1" fill="#a855f7" />
          <circle cx="13.5" cy="10" r="1" fill="#a855f7" />
        </g>
      );
    case "벌레":
      return (
        <g fill="#ffffff">
          {/* 벌레 몸 + 더듬이 */}
          <ellipse cx="12" cy="12" rx="3.5" ry="4.5" />
          <line x1="11" y1="7" x2="9.5" y2="5" stroke="#ffffff" strokeWidth="0.9"/>
          <line x1="13" y1="7" x2="14.5" y2="5" stroke="#ffffff" strokeWidth="0.9"/>
          <line x1="9" y1="11" x2="6" y2="11" stroke="#ffffff" strokeWidth="0.7"/>
          <line x1="15" y1="11" x2="18" y2="11" stroke="#ffffff" strokeWidth="0.7"/>
        </g>
      );
    case "고스트":
      return (
        <path
          d="M12 5 C 8 5, 7 8, 7 12 L7 17 L9 15 L11 17 L12 15 L13 17 L15 15 L17 17 L17 12 C 17 8, 16 5, 12 5 Z M10 9 C 10.5 9, 10.5 10, 10 10 M14 9 C 14.5 9, 14.5 10, 14 10"
          fill="#ffffff"
        />
      );
    case "드래곤":
      return (
        <g fill="#ffffff">
          {/* 비늘 3 */}
          <path d="M8 11 C 10 9, 14 9, 16 11 C 14 13, 10 13, 8 11 Z" />
          <path d="M9 14 C 10.5 12.5, 13.5 12.5, 15 14 C 13.5 15.5, 10.5 15.5, 9 14 Z" />
          <path d="M10 8 C 11 7, 13 7, 14 8 C 13 9, 11 9, 10 8 Z" />
        </g>
      );
    case "악":
      return (
        <g fill="#ffffff">
          {/* 발톱 흠집 */}
          <path d="M6 6 L9 14 L8 15 L5 7 Z" />
          <path d="M10 5 L13 14 L12 15 L9 6 Z" />
          <path d="M14 5 L17 14 L16 15 L13 6 Z" />
        </g>
      );
    case "강철":
      return (
        <g fill="#ffffff">
          {/* 기어 */}
          <circle cx="12" cy="11" r="3.5" />
          <circle cx="12" cy="11" r="1.5" fill="#475569" />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <rect
              key={deg}
              x="11"
              y="5.5"
              width="2"
              height="2"
              transform={`rotate(${deg} 12 11)`}
            />
          ))}
        </g>
      );
    case "페어리":
      return (
        <g fill="#ffffff">
          {/* 별 */}
          <polygon points="12,5 13.5,9.5 18,10 14.5,12.5 16,17 12,14.5 8,17 9.5,12.5 6,10 10.5,9.5" />
          {/* 작은 반짝 */}
          <circle cx="6" cy="7" r="0.6" />
          <circle cx="18" cy="7" r="0.6" />
          <circle cx="6" cy="15" r="0.5" />
          <circle cx="18" cy="15" r="0.5" />
        </g>
      );
  }
}

import type { WildType } from "@/lib/wild/types";

/** 작은 type 아이콘 — 흰색 단색 심볼. PclSlab/배지/리스트에서 라벨
 *  옆 prefix 로 사용. SVG 자체는 currentColor 사용해 부모 텍스트
 *  색상을 따라감. */
export default function TypeIcon({
  type,
  size = 14,
  className,
}: {
  type: WildType;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <Symbol type={type} />
    </svg>
  );
}

function Symbol({ type }: { type: WildType }) {
  switch (type) {
    case "풀":
      return (
        <path
          d="M12 4 C 8 6, 6 9, 12 13 C 18 9, 16 6, 12 4 Z M12 13 L12 20"
          strokeWidth="1.6"
          fill="none"
        />
      );
    case "물":
      return (
        <path
          d="M12 3 C 8 8, 6 12, 8 16 C 10 19, 14 19, 16 16 C 18 12, 16 8, 12 3 Z"
          strokeWidth="0"
        />
      );
    case "불꽃":
      return (
        <path
          d="M12 3 C 14 7, 16 9, 14 12 C 16 13, 17 14, 16 17 C 14 20, 10 20, 8 17 C 7 14, 8 12, 12 3 Z"
          strokeWidth="0"
        />
      );
    case "전기":
      return (
        <path d="M14 2 L7 13 L11 13 L9 22 L17 11 L13 11 L15 2 Z" strokeWidth="0" />
      );
    case "얼음":
      return (
        <g strokeWidth="1.6" strokeLinecap="round" fill="none">
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="4" y1="7.5" x2="20" y2="16.5" />
          <line x1="4" y1="16.5" x2="20" y2="7.5" />
        </g>
      );
    case "격투":
      return (
        <g strokeWidth="0">
          <rect x="7" y="9" width="10" height="9" rx="1.5" />
          <rect x="8" y="6" width="2" height="4" rx="0.6" />
          <rect x="11" y="5" width="2" height="5" rx="0.6" />
          <rect x="14" y="6" width="2" height="4" rx="0.6" />
        </g>
      );
    case "땅":
      return (
        <g strokeWidth="0">
          <path d="M3 18 L9 9 L13 14 L17 6 L21 18 Z" />
          <rect x="3" y="17" width="18" height="2" />
        </g>
      );
    case "비행":
      return (
        <path
          d="M3 12 C 7 9, 11 9, 12 12 C 13 9, 17 9, 21 12 C 17 14, 13 12, 12 15 C 11 12, 7 14, 3 12 Z"
          strokeWidth="0"
        />
      );
    case "에스퍼":
      return (
        <g strokeWidth="0">
          <ellipse cx="12" cy="12" rx="8" ry="4" />
          <circle cx="12" cy="12" r="2.4" fill="#000000" fillOpacity="0.5" />
        </g>
      );
    case "벌레":
      return (
        <g strokeWidth="1.6" strokeLinecap="round">
          <ellipse cx="12" cy="13" rx="3.5" ry="5.5" strokeWidth="0" />
          <line x1="11" y1="6" x2="9" y2="3" fill="none" />
          <line x1="13" y1="6" x2="15" y2="3" fill="none" />
          <line x1="8.5" y1="11" x2="5" y2="11" fill="none" />
          <line x1="15.5" y1="11" x2="19" y2="11" fill="none" />
        </g>
      );
    case "바위":
      return (
        <polygon points="12,4 19,8 19,16 12,20 5,16 5,8" strokeWidth="0" />
      );
    case "고스트":
      return (
        <path
          d="M12 4 C 7 4, 5 8, 5 12 L5 20 L8 17 L11 20 L12 17 L13 20 L16 17 L19 20 L19 12 C 19 8, 17 4, 12 4 Z"
          strokeWidth="0"
        />
      );
    case "드래곤":
      return (
        <g strokeWidth="0">
          <path d="M5 11 C 8 8, 16 8, 19 11 C 16 14, 8 14, 5 11 Z" />
          <path d="M7 16 C 9.5 14, 14.5 14, 17 16 C 14.5 18, 9.5 18, 7 16 Z" />
        </g>
      );
    case "악":
      return (
        <g strokeWidth="0">
          <path d="M5 4 L9 17 L8 19 L4 6 Z" />
          <path d="M10 3 L14 17 L13 19 L9 5 Z" />
          <path d="M15 4 L19 17 L18 19 L14 6 Z" />
        </g>
      );
    case "강철":
      return (
        <g strokeWidth="0">
          <circle cx="12" cy="12" r="3.5" />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <rect
              key={deg}
              x="11"
              y="4.5"
              width="2"
              height="3"
              transform={`rotate(${deg} 12 12)`}
            />
          ))}
        </g>
      );
    case "페어리":
      return (
        <polygon
          points="12,3 14,9.5 21,10 15.5,13 17.5,20 12,16 6.5,20 8.5,13 3,10 10,9.5"
          strokeWidth="0"
        />
      );
    case "독":
      return (
        <g strokeWidth="0">
          <circle cx="12" cy="10" r="4.5" />
          <rect x="9" y="14" width="6" height="2.4" rx="0.5" />
          <circle cx="10.3" cy="10" r="1" fill="#000000" fillOpacity="0.55" />
          <circle cx="13.7" cy="10" r="1" fill="#000000" fillOpacity="0.55" />
        </g>
      );
    case "노말":
    default:
      return <circle cx="12" cy="12" r="4.5" strokeWidth="0" />;
  }
}

import type { Metadata } from "next";
import { Fredoka } from "next/font/google";

// Fredoka — 둥글둥글 humanist sans-serif. 영유아 학습 친화 (단순한
// a/g 형태, 균일 stroke, 둥근 corner) + 트렌디. next/font 로 빌드 시
// self-host → 외부 도메인 의존성 / CSP 영향 없음.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--match-font-fredoka",
  display: "swap",
});

// /match 만의 metadata — 루트 layout 의 "포켓몬 카드깡 시뮬레이터"
// title/description 을 override. 카카오톡 / 슬랙 / 메시지 등 OG
// 미리보기에서 이 페이지만 다른 제목·부제로 노출됨.
export const metadata: Metadata = {
  title: "카드 짝 맞추기 🃏",
  description: "4~6세 영유아용 메모리 매칭 게임 — 탈것 · 곤충 · 알파벳 · 한글",
  openGraph: {
    title: "카드 짝 맞추기 🃏",
    description: "같은 그림 두 장을 찾아보세요 — 4~6세 영유아용 게임",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "카드 짝 맞추기 🃏",
    description: "같은 그림 두 장을 찾아보세요 — 4~6세 영유아용 게임",
  },
};

// Next.js 16 layout. typed-routes 의 글로벌 LayoutProps<"/match"> 는
// next typegen 산출물에 의존해 CI 의 단독 tsc 단계에서 미존재 (TS2304).
// /match 는 동적 segment 가 없어 children 만 필요 — inline 타입으로 정의.
export default function MatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fredoka CSS variable 를 /match 서브트리에만 노출. 페이지 자체가
  // fixed inset-0 풀스크린이라 시각적으론 메인 시뮬과 분리됨.
  return <div className={fredoka.variable}>{children}</div>;
}

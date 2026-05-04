import type { Metadata } from "next";

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

// Next.js 16 typed-routes 호환 — globally 제공되는 LayoutProps 사용
// (next typegen / next dev / next build 시 자동 생성, import 불요).
export default function MatchLayout(props: LayoutProps<"/match">) {
  // 단순 pass-through — root layout 의 AuthProvider/Navbar 는 그대로
  // 상속되지만 페이지 자체가 fixed inset-0 풀스크린이라 위에 덮음.
  return <>{props.children}</>;
}

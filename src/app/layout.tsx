import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "포켓몬 카드깡 시뮬레이터",
  description:
    "메가드림ex · 인페르노X · 초전브레이커 한글판 부스터 팩을 가상으로 개봉하고 카드를 수집/선물하세요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07070b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col overflow-x-hidden font-sans">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 w-full">{children}</main>
          <footer className="text-center text-[11px] text-zinc-500 py-5 px-4">
            © {new Date().getFullYear()} Pokémon TCG Sim · 카드 이미지 저작권은
            The Pokémon Company / 포켓몬 코리아에 있습니다.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}

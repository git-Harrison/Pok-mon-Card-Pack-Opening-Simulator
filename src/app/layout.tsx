import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import NotificationsOverlay from "@/components/NotificationsOverlay";
import ScrollTopButton from "@/components/ScrollTopButton";
import UpdateAvailableModal from "@/components/UpdateAvailableModal";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "포켓몬 카드깡 시뮬레이터",
  description:
    "메가드림ex · 인페르노X · 초전브레이커 한글판 부스터 팩을 가상으로 개봉하고 카드를 수집/선물하세요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
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
      <body className="overflow-x-hidden font-sans">
        <AuthProvider>
          <Navbar />
          <main className="relative w-full pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
          <NotificationsOverlay />
          <ScrollTopButton />
          <UpdateAvailableModal />
        </AuthProvider>
      </body>
    </html>
  );
}

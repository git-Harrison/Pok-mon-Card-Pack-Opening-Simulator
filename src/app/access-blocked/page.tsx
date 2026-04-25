import type { Metadata } from "next";

// Pure static SSR — no user data, no dynamic params. Force-static so
// the route is fully prerendered at build time and served from the edge
// cache without invoking the Node runtime.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "접속 제한 · Access Blocked",
  robots: { index: false, follow: false },
};

export default function AccessBlockedPage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-6 py-10 bg-zinc-950">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl md:text-3xl font-black text-white">
          한국에서만 접속할 수 있어요
        </h1>
        <p className="mt-3 text-sm text-zinc-300 leading-relaxed">
          이 사이트는 <b className="text-amber-200">대한민국 IP</b>로만 접속을
          허용하고 있어요. 해외 네트워크나 VPN 연결을 사용 중이라면 한국 IP로
          접속해 주세요.
        </p>
        <hr className="my-6 border-white/10" />
        <p className="text-xs text-zinc-400">
          This service is restricted to visitors connecting from{" "}
          <b className="text-amber-200">South Korea</b>. If you are using a VPN
          or proxy from another country, please disable it and try again.
        </p>
        <div className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/40 text-rose-200 text-[11px] font-bold">
          🛡️ Geo-restricted · KR only
        </div>
      </div>
    </div>
  );
}

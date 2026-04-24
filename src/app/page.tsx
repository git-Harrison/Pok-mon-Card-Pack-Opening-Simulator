import SetCard from "@/components/SetCard";
import AuthGate from "@/components/AuthGate";
import Link from "next/link";
import { SET_ORDER, SETS } from "@/lib/sets";

export default function Home() {
  return (
    <AuthGate>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-14 fade-in">
        <section className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" />
            포켓몬 TCG 시뮬레이터
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl md:text-6xl font-black tracking-tight text-white leading-[1.15]">
            <span className="text-amber-400">까고</span>,{" "}
            <span className="text-fuchsia-300">감별</span>하고,{" "}
            <br className="hidden md:block" />
            <span className="text-cyan-300">전시</span>하고,{" "}
            <span className="text-rose-400">싸우자</span>
          </h1>
          <p className="mt-5 text-sm md:text-base text-zinc-400 leading-relaxed">
            한국어판 6세트 · PCL 감별 · 내 포켓몬센터 전시 · 야생 배틀 ·
            랭킹 · 상인 거래까지 · 카드 한 장이 경제가 된다.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
            {[
              { href: "/wallet",   label: "🎴 지갑" },
              { href: "/center",   label: "🏛️ 센터" },
              { href: "/wild",     label: "🌿 야생" },
              { href: "/grading",  label: "🔎 감별" },
              { href: "/merchant", label: "🐾 상인" },
              { href: "/users",    label: "🏆 랭킹" },
            ].map((x) => (
              <Link
                key={x.href}
                href={x.href}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10 hover:text-white transition"
              >
                {x.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 md:mt-14">
          <h2 className="text-base md:text-xl font-bold text-white mb-4 md:mb-5">
            팩 선택
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {SET_ORDER.map((code) => (
              <SetCard key={code} set={SETS[code]} />
            ))}
          </div>
        </section>
      </div>
    </AuthGate>
  );
}

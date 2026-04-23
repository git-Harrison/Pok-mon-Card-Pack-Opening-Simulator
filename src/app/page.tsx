import SetCard from "@/components/SetCard";
import AuthGate from "@/components/AuthGate";
import Link from "next/link";
import { SET_ORDER, SETS } from "@/lib/sets";

export default function Home() {
  return (
    <AuthGate>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-16 fade-in">
        <section className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" />
            한글판 포켓몬 TCG 카드깡
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl md:text-6xl font-black tracking-tight text-white leading-[1.15]">
            박스를 <span className="text-amber-400">뜯고</span>,
            <br className="hidden md:block" />
            팩을 <span className="text-rose-400">찢고</span>,
            카드를 <span className="text-cyan-300">공개</span>하자
          </h1>
          <p className="mt-5 text-sm md:text-lg text-zinc-400 leading-relaxed">
            메가드림ex · 인페르노X · 초전브레이커. 등급별 확률대로 뽑고,
            뽑은 카드는 내 카드지갑에 모여요. <Link className="underline underline-offset-4 text-white" href="/wallet">내 카드지갑</Link>에서 친구에게 선물도 할 수 있어요.
          </p>
        </section>

        <section className="mt-10 md:mt-16">
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

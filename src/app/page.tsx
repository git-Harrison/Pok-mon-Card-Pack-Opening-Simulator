import SetCard from "@/components/SetCard";
import AuthGate from "@/components/AuthGate";
import HelpButton, { type HelpSection } from "@/components/HelpButton";
import Link from "next/link";
import { SET_ORDER, SETS } from "@/lib/sets";

const HELP_SECTIONS: HelpSection[] = [
  {
    heading: "이게 뭐예요?",
    icon: "🎴",
    body: (
      <>
        한국어판 포켓몬 카드 6세트의 팩을 까고, 모은 카드를 감별·전시·배틀할 수
        있는 시뮬레이터예요. 실제 포인트로 박스를 사면 랜덤 카드가 쏟아지고,
        좋은 카드는 PCL 등급을 받아 슬랩으로 만들어 내 센터에 전시하거나 야생
        배틀에 투입할 수 있어요.
      </>
    ),
  },
  {
    heading: "처음이라면 이 순서",
    icon: "🚀",
    body: (
      <ol className="list-decimal ml-5 space-y-0.5">
        <li>
          아래 <b>팩 선택</b>에서 마음에 드는 세트를 골라 박스를 구매
        </li>
        <li>
          박스를 열면 5팩이 나와요. 한 팩씩 까거나 &ldquo;모든 팩 한번에
          열기&rdquo;
        </li>
        <li>
          지갑에 카드가 쌓이면 어떤 등급이든 <b>감별(PCL)</b>로 등급 도전
        </li>
        <li>
          슬랩(감별 카드)은 <b>센터에 전시</b>해 시간당 수익을 받거나, <b>야생
          배틀</b>에 출전
        </li>
      </ol>
    ),
  },
  {
    heading: "메뉴 안내",
    icon: "🧭",
    body: (
      <ul>
        <li>
          <b>지갑</b> · 모은 카드와 PCL 슬랩 보관 (한도 10,000장 / PCL 500장)
        </li>
        <li>
          <b>센터</b> · 보관함 4종으로 슬랩 전시. 시간당 거래 포인트 수익
        </li>
        <li>
          <b>야생</b> · 슬랩으로 야생 포켓몬과 1:1. 승리 시 +20,000p · 랭킹
          +50점
        </li>
        <li>
          <b>감별</b> · 카드를 PCL 6~10등급 슬랩으로. 70%는 실패
        </li>
        <li>
          <b>도감</b> · PCL10 슬랩을 영구 박제. 등록 수에 따라 센터 전투력
          보너스 (+500 ~ +5,000)
        </li>
        <li>
          <b>랭킹</b> · PCL10·부수기로 점수 경쟁. 다른 유저에게 조롱 가능
        </li>
        <li>
          <b>선물함</b> · 카드를 다른 유저에게 보내거나 받기 (하루 5회)
        </li>
      </ul>
    ),
  },
  {
    heading: "포인트 모으는 법",
    icon: "🪙",
    body: (
      <>
        박스 구매 비용 → 카드 → <b>감별 보너스</b>(PCL10 +50,000p), <b>전시
        수익</b>(시간당), <b>야생 승리</b>(+20,000p), <b>부수기 전리품</b>
        (보관함가의 80%)으로 회수해요. 가입 시 1,000,000p가 지급돼요.
      </>
    ),
  },
];

export default function Home() {
  return (
    <AuthGate>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-14 fade-in">
        <section className="text-center max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" />
              포켓몬 TCG 시뮬레이터
            </span>
            <HelpButton title="홈" sections={HELP_SECTIONS} size="sm" />
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl md:text-6xl font-black tracking-tight text-white leading-[1.15]">
            <span className="text-amber-400">까고</span>,{" "}
            <span className="text-fuchsia-300">감별</span>하고,{" "}
            <br className="hidden md:block" />
            <span className="text-cyan-300">전시</span>하고,{" "}
            <span className="text-rose-400">싸우자</span>
          </h1>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
            {[
              { href: "/wallet",   label: "🎴 지갑" },
              { href: "/center",   label: "🏛️ 센터" },
              { href: "/wild",     label: "🌿 야생" },
              { href: "/grading",  label: "🔎 감별" },
              { href: "/pokedex",  label: "📔 도감" },
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

        <footer className="mt-10 text-center text-[11px] text-zinc-500 py-5 px-4">
          © {new Date().getFullYear()} Pokémon TCG Sim · 카드 이미지 저작권은
          The Pokémon Company / 포켓몬 코리아에 있습니다.
        </footer>
      </div>
    </AuthGate>
  );
}

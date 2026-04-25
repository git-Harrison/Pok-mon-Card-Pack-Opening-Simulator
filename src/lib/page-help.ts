import Link from "next/link";
import { createElement as h } from "react";
import type { HelpSection } from "@/components/HelpButton";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/profile";
import { RARITY_ORDER } from "@/lib/rarity";
import { RARITY_COMPLETION_BONUS, RARITY_TOTALS } from "@/lib/pokedex";

export interface PageHelp {
  title: string;
  sections: HelpSection[];
}

const HOME_SECTIONS: HelpSection[] = [
  {
    heading: "이게 뭐예요?",
    icon: "🎴",
    body: h(
      "div",
      null,
      "한국어판 포켓몬 카드 6세트의 팩을 까고, 모은 카드를 감별·전시·배틀할 수 있는 시뮬레이터예요. 실제 포인트로 박스를 사면 랜덤 카드가 쏟아지고, 좋은 카드는 PCL 등급을 받아 슬랩으로 만들어 내 센터에 전시하거나 야생 배틀에 투입할 수 있어요."
    ),
  },
  {
    heading: "처음이라면 이 순서",
    icon: "🚀",
    body: h(
      "ol",
      { className: "list-decimal ml-5 space-y-0.5" },
      h(
        "li",
        { key: 1 },
        "아래 ",
        h("b", null, "팩 선택"),
        "에서 마음에 드는 세트를 골라 박스를 구매"
      ),
      h(
        "li",
        { key: 2 },
        "박스를 열면 5팩이 나와요. 한 팩씩 까거나 “모든 팩 한번에 열기”"
      ),
      h(
        "li",
        { key: 3 },
        "지갑에 카드가 쌓이면 어떤 등급이든 ",
        h("b", null, "감별(PCL)"),
        "로 등급 도전"
      ),
      h(
        "li",
        { key: 4 },
        "슬랩(감별 카드)은 ",
        h("b", null, "센터에 전시"),
        "해 시간당 수익을 받거나, ",
        h("b", null, "야생 배틀"),
        "에 출전"
      )
    ),
  },
  {
    heading: "메뉴 안내",
    icon: "🧭",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", null, "지갑"),
        " · 모은 카드와 PCL 슬랩 보관 (한도 10,000장 / PCL 500장)"
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "센터"),
        " · 보관함 4종으로 슬랩 전시. 시간당 거래 포인트 수익"
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "야생"),
        " · 슬랩으로 야생 포켓몬과 1:1. 승리 시 +20,000p · 랭킹 +50점"
      ),
      h(
        "li",
        { key: 4 },
        h("b", null, "감별"),
        " · 카드를 PCL 6~10등급 슬랩으로. 70%는 실패"
      ),
      h(
        "li",
        { key: 5 },
        h("b", null, "도감"),
        " · PCL10 슬랩을 영구 박제. 등록 수에 따라 센터 전투력 보너스 (+500 ~ +5,000)"
      ),
      h(
        "li",
        { key: 6 },
        h("b", null, "랭킹"),
        " · PCL10·부수기로 점수 경쟁. 다른 유저에게 조롱 가능"
      ),
      h(
        "li",
        { key: 7 },
        h("b", null, "선물함"),
        " · 카드를 다른 유저에게 보내거나 받기 (하루 5회)"
      )
    ),
  },
  {
    heading: "포인트 모으는 법",
    icon: "🪙",
    body: h(
      "div",
      null,
      "박스 구매 비용 → 카드 → ",
      h("b", null, "감별 보너스"),
      "(PCL10 +50,000p), ",
      h("b", null, "전시 수익"),
      "(시간당), ",
      h("b", null, "야생 승리"),
      "(+20,000p), ",
      h("b", null, "부수기 전리품"),
      "(보관함가의 80%)으로 회수해요. 가입 시 1,000,000p가 지급돼요."
    ),
  },
];

const WALLET_SECTIONS: HelpSection[] = [
  {
    heading: "지갑이란",
    icon: "🎴",
    body: "박스에서 뽑은 카드와 PCL 감별 슬랩이 모이는 곳이에요. 카드를 누르면 상세 보기·선물·공유로 이동해요.",
  },
  {
    heading: "상단 KPI",
    icon: "📊",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, h("b", null, "종류"), " · 보유한 서로 다른 카드 종 수"),
      h("li", { key: 2 }, h("b", null, "장수"), " · 총 카드 장수 (한도 10,000장)"),
      h("li", { key: 3 }, h("b", null, "개봉"), " · 지금까지 깐 팩 수"),
      h("li", { key: 4 }, h("b", null, "PCL"), " · 감별 완료된 슬랩 수 (한도 500장)")
    ),
  },
  {
    heading: "탭",
    icon: "🗂️",
    body: h(
      "div",
      null,
      h(
        "ul",
        null,
        h("li", { key: 1 }, h("b", null, "카드"), " 탭 — 일반 보유 카드 격자"),
        h("li", { key: 2 }, h("b", null, "PCL"), " 탭 — 감별 슬랩 (등급별 정렬)")
      ),
      h(
        "p",
        { className: "mt-1.5" },
        "희귀도 필터로 한 등급만 골라볼 수 있어요."
      )
    ),
  },
  {
    heading: "정리하고 싶을 때",
    icon: "🧹",
    body: h(
      "div",
      null,
      "한도(10,000장)에 가까워지면 박스를 더 못 사요. ",
      h(
        Link,
        { href: "/wallet/bulk-sell", className: "underline text-amber-300" },
        "일괄 판매"
      ),
      " 페이지에서 등급별로 한 번에 팔 수 있어요. ",
      h("b", null, "SR 이상"),
      "은 ",
      h(
        Link,
        { href: "/grading", className: "underline text-amber-300" },
        "감별"
      ),
      "로 슬랩을 만드는 게 더 이득이에요."
    ),
  },
  {
    heading: "PCL 슬랩의 쓰임",
    icon: "💎",
    body: h(
      "div",
      null,
      "슬랩은 ",
      h("b", null, "센터에 전시"),
      "해 시간당 수익을 받거나, ",
      h("b", null, "야생 배틀"),
      "에 출전시키거나, ",
      h("b", null, "일괄 판매"),
      "로 정리할 수 있어요. 슬랩이 부서지거나 팔려도 PCL10 누적 랭킹 점수는 사라지지 않아요."
    ),
  },
  {
    heading: "🏛️ 전시 중 슬랩",
    icon: "🔒",
    body: h(
      "div",
      null,
      h("b", null, "전시 중"),
      " 배지가 붙은 슬랩은 지금 센터에 전시돼 있어요. 전시된 카드는 ",
      h("b", null, "일괄 판매 · 야생 배틀 · 재감별 · 선물"),
      "에 사용할 수 없고, 센터에서 꺼내거나 상대에게 부서지기 전까지 잠겨있어요."
    ),
  },
];

const BULK_SELL_SECTIONS: HelpSection[] = [
  {
    heading: "일괄 판매란",
    icon: "💰",
    body: "지갑에 쌓인 일반 카드를 등급별로 묶어 한 번에 처분하는 화면이에요. 단가가 낮은 대신 빠르게 정리할 수 있어요.",
  },
  {
    heading: "등급별 단가",
    icon: "🪙",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, h("b", null, "MUR"), " · 10,000p"),
      h("li", { key: 2 }, h("b", null, "UR"), " · 5,000p"),
      h("li", { key: 3 }, h("b", null, "SAR"), " · 3,000p"),
      h("li", { key: 4 }, h("b", null, "SR · MA"), " · 1,000p"),
      h("li", { key: 5 }, h("b", null, "AR"), " · 500p"),
      h("li", { key: 6 }, h("b", null, "RR"), " · 200p"),
      h("li", { key: 7 }, h("b", null, "R"), " · 100p"),
      h("li", { key: 8 }, h("b", null, "U"), " · 50p"),
      h("li", { key: 9 }, h("b", null, "C"), " · 25p")
    ),
  },
  {
    heading: "추천 흐름",
    icon: "✨",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", null, "SR 이상"),
        "은 우선 ",
        h(
          Link,
          { href: "/grading", className: "underline text-amber-300" },
          "PCL 감별"
        ),
        "에 도전 — 성공 시 슬랩 보너스가 일괄 판매보다 훨씬 커요."
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "RR 이하 잡카드"),
        "만 일괄 판매로 정리하는 게 효율적이에요."
      ),
      h(
        "li",
        { key: 3 },
        "박스 개봉 화면의 ",
        h("b", null, "“AR 미만 자동 판매”"),
        " 옵션을 켜두면 처음부터 지갑에 안 들어와요."
      )
    ),
  },
  {
    heading: "PCL 슬랩 일괄 판매",
    icon: "💎",
    body: h(
      "div",
      null,
      "슬랩은 이 화면이 아니라 ",
      h(
        Link,
        { href: "/wallet?tab=psa", className: "underline text-amber-300" },
        "지갑의 PCL 탭"
      ),
      "에서 별도로 처분해요."
    ),
  },
];

const CENTER_SECTIONS: HelpSection[] = [
  {
    heading: "보관함 5종",
    icon: "🏛️",
    body: h(
      "div",
      null,
      "슬랩을 전시하는 진열대예요. 등급이 높을수록 비싸지만 부수기 방어율이 높아 안전해요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "🪵 ", h("b", null, "기본"), " · 10,000p · 1장 · 방어 3%"),
        h("li", { key: 2 }, "🔷 ", h("b", null, "유리"), " · 100,000p · 1장 · 방어 5%"),
        h(
          "li",
          { key: 3 },
          "💠 ",
          h("b", null, "프리미엄"),
          " · 300,000p · 1장 · 방어 10%"
        ),
        h(
          "li",
          { key: 4 },
          "👑 ",
          h("b", null, "레전더리"),
          " · 1,000,000p · 1장 · 방어 15%"
        ),
        h(
          "li",
          { key: 5 },
          "📦 ",
          h("b", null, "통합 보관함"),
          " · 2,000,000p · PCL9·10 슬랩 50장 · 방어 20%"
        )
      ),
      h(
        "p",
        { className: "mt-1.5" },
        "기본 4종은 슬랩 1장씩, 통합 보관함은 PCL9·10 50장까지. 그리드 6×6에 자유 배치."
      )
    ),
  },
  {
    heading: "전시 수익",
    icon: "💰",
    body: h(
      "div",
      null,
      "전시 중인 슬랩은 ",
      h("b", null, "희귀도 × PCL 등급"),
      "에 따라 시간당 거래 포인트와 랭킹 점수가 동시에 자동 적립돼요. 센터에 접속할 때마다 자동 수령.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "MUR PCL10"),
          " · 100,000p · 랭킹 +500점/hr"
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-fuchsia-300" }, "UR PCL10"),
          " · 60,000p · 랭킹 +300점/hr"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-rose-300" }, "SAR PCL10"),
          " · 40,000p · 랭킹 +200점/hr"
        ),
        h(
          "li",
          { key: 4 },
          h("b", { className: "text-sky-300" }, "MA PCL10"),
          " · 30,000p · 랭킹 +150점/hr"
        ),
        h(
          "li",
          { key: 5 },
          h("b", { className: "text-emerald-300" }, "SR PCL10"),
          " · 20,000p · 랭킹 +100점/hr"
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "PCL 등급이 1단계 내려갈 때마다 보상은 절반(±) 수준으로 줄어들고, PCL6까지 보상이 들어와요. 랭킹 점수는 거래 포인트의 1/200."
      )
    ),
  },
  {
    heading: "부수기",
    icon: "💥",
    body: h(
      "div",
      null,
      "다른 유저의 보관함을 깨면 보관함과 슬랩이 영구 소멸하고 공격자가 보관함가의 80%를 전리품으로 가져가요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", null, "기본 성공률 30%"),
          " − 보관함 방어 = 실제 확률"
        ),
        h(
          "li",
          { key: 2 },
          h("b", null, "부수기 비용 = 보관함 가격의 10%"),
          " (1k / 10k / 30k / 100k / 200k)"
        ),
        h(
          "li",
          { key: 3 },
          "시도 결과와 무관하게 ",
          h("b", { className: "text-emerald-200" }, "주인은 비용의 50%"),
          " 즉시 적립"
        ),
        h("li", { key: 4 }, "실패해도 공격 비용은 돌아오지 않아요")
      )
    ),
  },
  {
    heading: "랭킹 점수",
    icon: "🏆",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", { className: "text-amber-300" }, "PCL 10 감별 성공"),
        " · +500점 (누적, 슬랩 잃어도 안 빠져요)"
      ),
      h(
        "li",
        { key: 2 },
        h("b", { className: "text-rose-300" }, "남의 보관함 부수기 성공"),
        " · +3,000점"
      ),
      h(
        "li",
        { key: 3 },
        h("b", { className: "text-emerald-300" }, "내 보관함 부수기 방어"),
        " · +50점"
      ),
      h("li", { key: 4 }, h("b", { className: "text-sky-300" }, "야생 승리"), " · +50점"),
      h(
        "li",
        { key: 5 },
        h("b", { className: "text-violet-300" }, "전시 수익 적립"),
        " · 슬랩 희귀도×PCL 시간당 (최대 +500점/hr · MUR PCL10)"
      )
    ),
  },
];

const VISIT_CENTER_SECTIONS: HelpSection[] = [
  {
    heading: "여긴 어디?",
    icon: "🏛️",
    body: "다른 유저의 포켓몬센터를 둘러보는 페이지예요. 전시된 슬랩을 감상하거나, 부수기를 시도하거나, 조롱 메시지를 보낼 수 있어요.",
  },
  {
    heading: "부수기",
    icon: "💥",
    body: h(
      "div",
      null,
      "보관함 위 슬랩을 눌러 시도. 성공 확률 = 30% − 보관함 방어(3/5/10/15/20%). 비용은 보관함 가격의 10%.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          "성공 → 보관함·슬랩 영구 삭제 + ",
          h("b", { className: "text-amber-200" }, "보관함가 80%"),
          " 전리품 + 랭킹 +3,000점"
        ),
        h(
          "li",
          { key: 2 },
          "실패 → 비용 환불 없음. 단, 시도 사실은 디스코드에 자동 공지"
        ),
        h(
          "li",
          { key: 3 },
          "주인은 시도 결과와 무관하게 ",
          h("b", { className: "text-emerald-200" }, "비용의 50%"),
          "를 자동 적립"
        )
      )
    ),
  },
  {
    heading: "조롱하기",
    icon: "🔥",
    body: "우측 상단 🔥 버튼으로 200자 이내 메시지를 보낼 수 있어요. 받은 사람의 화면에 강제 팝업으로 떠요.",
  },
];

const GRADING_SECTIONS: HelpSection[] = [
  {
    heading: "PCL 감별이란",
    icon: "🔎",
    body: h(
      "div",
      null,
      "모든 등급의 카드를 PCL 슬랩으로 감별할 수 있어요. 슬랩은 일반 카드보다 가치가 훨씬 높고, ",
      h("b", null, "센터 전시"),
      "·",
      h("b", null, "야생 배틀"),
      "·",
      h("b", null, "랭킹 점수"),
      "의 핵심 자원이에요."
    ),
  },
  {
    heading: "성공 확률",
    icon: "🎲",
    body: h(
      "div",
      null,
      h(
        "ul",
        null,
        h("li", { key: 1 }, "실패 (슬랩 안 만들어짐) · ", h("b", null, "70%")),
        h("li", { key: 2 }, "PCL 6 · 8%"),
        h("li", { key: 3 }, "PCL 7 · 10%"),
        h("li", { key: 4 }, "PCL 8 · 8%"),
        h("li", { key: 5 }, "PCL 9 · 3.5%"),
        h("li", { key: 6 }, "PCL 10 · 0.5%")
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "실패해도 카드는 사라져요. 신중하게."
      )
    ),
  },
  {
    heading: "지갑 보너스",
    icon: "🪙",
    body: h(
      "div",
      null,
      "감별 성공 시 등급별 즉시 입금:",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          "PCL 10 · ",
          h("b", { className: "text-amber-300" }, "+50,000p")
        ),
        h("li", { key: 2 }, "PCL 9 · +30,000p"),
        h("li", { key: 3 }, "PCL 8 · +10,000p"),
        h("li", { key: 4 }, "PCL 6·7 · +3,000p")
      )
    ),
  },
  {
    heading: "랭킹 점수",
    icon: "🏆",
    body: h(
      "div",
      null,
      h("b", { className: "text-amber-300" }, "PCL 10 성공만"),
      " 랭킹 점수 +500점 (누적). 슬랩이 부서지거나 팔려도 점수는 안 빠져요. PCL 6~9는 랭킹 점수에 들어가지 않지만 ",
      h("b", null, "전시 수익"),
      "과 ",
      h("b", null, "야생 배틀"),
      "에서는 활약해요."
    ),
  },
  {
    heading: "일괄 감별",
    icon: "📚",
    body: h(
      "div",
      null,
      "여러 장을 한 번에 감별하면 빠르고, ",
      h("b", null, "“PCL N 미만 자동 판매”"),
      " 옵션을 켜두면 낮은 등급은 슬랩으로 만들지 않고 즉시 환산돼요. 슬랩 한도 500장에 가까울 때 유용해요."
    ),
  },
  {
    heading: "한도와 주의",
    icon: "⚠️",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "PCL 슬랩 보유 한도 ", h("b", null, "500장")),
      h("li", { key: 2 }, "한 번 감별한 카드는 결과와 무관하게 지갑에서 사라져요"),
      h("li", { key: 3 }, "슬랩은 ", h("b", null, "야생에서 패배"), "하면 영구 삭제"),
      h("li", { key: 4 }, "슬랩은 ", h("b", null, "센터 부수기 성공"), "으로도 영구 삭제")
    ),
  },
];

const USERS_SECTIONS: HelpSection[] = [
  {
    heading: "세 가지 랭킹",
    icon: "🏆",
    body: h(
      "div",
      null,
      "상단 탭에서 세 가지 모드를 전환할 수 있어요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "🏆 랭킹 점수"),
          " · 누적 점수 경쟁. PCL10 감별, 부수기 성공/방어로 적립"
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-rose-300" }, "⚔️ 전투력"),
          " · 지금 센터에 전시된 슬랩들의 합산 화력"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-fuchsia-300" }, "🐾 펫 랭킹"),
          " · 프로필에 등록한 펫(최대 5장) 의 펫 점수 합산"
        )
      )
    ),
  },
  {
    heading: "랭킹 점수 산정",
    icon: "📈",
    body: h(
      "div",
      null,
      h(
        "ul",
        null,
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "PCL 10 감별 성공"),
          " · +500점 (누적, 슬랩 잃어도 그대로 유지)"
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-rose-300" }, "남의 보관함 부수기 성공"),
          " · +3,000점"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-emerald-300" }, "내 보관함 부수기 방어"),
          " · +50점 (상대가 실패할 때마다)"
        ),
        h(
          "li",
          { key: 4 },
          h("b", { className: "text-sky-300" }, "야생 승리"),
          " · +50점"
        ),
        h(
          "li",
          { key: 5 },
          h("b", { className: "text-violet-300" }, "전시 수익 누적"),
          " · 시간당 자동 적립 (거래 포인트의 1/200 · 최대 +500점/hr · MUR PCL10)"
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "PCL 6~9 감별 보너스, 카드 보유 자체는 랭킹 점수에 들어가지 않아요."
      )
    ),
  },
  {
    heading: "전투력 산정",
    icon: "⚔️",
    body: h(
      "div",
      null,
      "센터에 전시 중인 슬랩 한 장당:",
      h(
        "p",
        { className: "mt-1" },
        "희귀도 점수 (SR 5 · MA 6 · SAR 7 · UR 8 · MUR 10) × PCL 점수 (9 → 9 · 10 → 10)"
      ),
      h(
        "p",
        { className: "mt-1.5" },
        "여기에 ",
        h("b", null, "도감 보유 보너스"),
        "(5장 +500 ↗ 30장 +5,000)와 ",
        h("b", null, "도감 등급 완전 컬렉션 보너스"),
        "(MUR +10,000 등)가 합산돼요."
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "예: MUR PCL10 슬랩 1장 = 100. 슬랩이 부서지면 즉시 빠져요. 전투력은 누적이 아니라 “지금”의 지표."
      )
    ),
  },
  {
    heading: "펫 랭킹 산정",
    icon: "🐾",
    body: h(
      "div",
      null,
      "프로필에서 PCL10 슬랩을 최대 5장까지 펫으로 등록할 수 있어요. 펫 한 장당:",
      h(
        "p",
        { className: "mt-1" },
        "희귀도 점수 (SR 5 · MA 6 · SAR 7 · UR 8 · MUR 10) × 10"
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "예: MUR PCL10 펫 = 100점. 5장 모두 MUR PCL10 이면 ",
        h("b", { className: "text-fuchsia-300" }, "최대 500점"),
        ". 펫 슬랩이 부서지면 점수에서 빠져요."
      )
    ),
  },
  {
    heading: "조롱하기 🔥",
    icon: "🔥",
    body: "다른 유저 행의 🔥 버튼으로 200자 메시지를 던질 수 있어요. 받은 사람 화면에 강제 팝업으로 떠요. 자기 자신에게는 못 보내요.",
  },
  {
    heading: "지갑 보너스 (참고)",
    icon: "🪙",
    body: h(
      "div",
      null,
      "감별 성공 즉시 지급되는 지갑 보너스 (랭킹 점수와는 별개):",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "PCL 10 · +50,000p"),
        h("li", { key: 2 }, "PCL 9 · +30,000p"),
        h("li", { key: 3 }, "PCL 8 · +10,000p"),
        h("li", { key: 4 }, "PCL 6·7 · +3,000p")
      )
    ),
  },
];

const PROFILE_SECTIONS: HelpSection[] = [
  {
    heading: "캐릭터 선택",
    icon: "🎭",
    body: h(
      "div",
      null,
      "애니메이션 1세대 관동 지방의 캐릭터 6명 중 한 명을 선택해 자신의 트레이너로 쓸 수 있어요. 모든 캐릭터는 도트 모션으로 움직여요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, h("b", { className: "text-rose-300" }, "지우"), " · 만년 10살 주인공"),
        h("li", { key: 2 }, h("b", { className: "text-cyan-300" }, "이슬"), " · 푸른 도시 체육관 관장"),
        h("li", { key: 3 }, h("b", { className: "text-amber-300" }, "웅"), " · 회색 시티 체육관 관장"),
        h("li", { key: 4 }, h("b", { className: "text-zinc-200" }, "오박사"), " · 태초마을 박사"),
        h("li", { key: 5 }, h("b", { className: "text-emerald-300" }, "그린"), " · 라이벌"),
        h("li", { key: 6 }, h("b", { className: "text-rose-400" }, "목호"), " · 사천왕 챔피언")
      ),
      h(
        "p",
        { className: "mt-2 text-rose-300 font-bold" },
        "⚠️ 캐릭터는 한 번 선택하면 변경할 수 없어요. 신중하게 골라주세요."
      )
    ),
  },
  {
    heading: "닉네임 변경",
    icon: "✏️",
    body: h(
      "div",
      null,
      "프로필 배너의 ",
      h("b", { className: "text-amber-300" }, "닉네임 변경"),
      ` 버튼으로 언제든 새 닉네임으로 바꿀 수 있어요. 길이는 ${DISPLAY_NAME_MIN}~${DISPLAY_NAME_MAX}자, 다른 사용자와 중복은 불가.`,
      h(
        "p",
        { className: "mt-2 text-zinc-400" },
        "랭킹 · 선물 · 도촬 등 닉네임이 표시되는 모든 곳에 즉시 반영돼요. 로그인 아이디는 바뀌지 않아요."
      )
    ),
  },
  {
    heading: "펫 시스템",
    icon: "🐾",
    body: h(
      "div",
      null,
      "가장 자랑하고 싶은 슬랩 5장을 ",
      h("b", null, "메인 카드"),
      "(펫)로 등록할 수 있어요. 슬롯을 누르면 등록 가능한 슬랩 목록이 떠요. 등록한 슬랩은 프로필 점수와 펫 점수에 즉시 반영돼요."
    ),
  },
  {
    heading: "PCL10 한정",
    icon: "💎",
    body: h(
      "div",
      null,
      "펫으로 등록할 수 있는 슬랩은 ",
      h("b", { className: "text-amber-300" }, "PCL10 GEM MINT"),
      " 슬랩에 한정돼요. 9등급 이하 슬랩은 펫이 될 수 없으니 감별을 더 도전해보세요."
    ),
  },
  {
    heading: "점수 산정",
    icon: "📈",
    body: h(
      "div",
      null,
      "펫 점수 = (희귀도 점수 × 10) 의 합산.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "SR · ×10 = 50"),
        h("li", { key: 2 }, "MA · ×10 = 60"),
        h("li", { key: 3 }, "SAR · ×10 = 70"),
        h("li", { key: 4 }, "UR · ×10 = 80"),
        h("li", { key: 5 }, h("b", { className: "text-amber-300" }, "MUR · ×10 = 100"))
      ),
      h(
        "p",
        { className: "mt-2 text-zinc-400" },
        "최대치는 MUR PCL10 5장 등록 시 ",
        h("b", { className: "text-white" }, "500점"),
        ". 전당 입성을 노려보세요."
      )
    ),
  },
];

const GIFTS_SECTIONS: HelpSection[] = [
  {
    heading: "선물 시스템",
    icon: "🎁",
    body: h(
      "div",
      null,
      h("b", null, "PCL 슬랩"),
      "(감별 6 이상)만 선물할 수 있어요. 받는 사람이 수락하면 슬랩 소유권이 그대로 이전돼요."
    ),
  },
  {
    heading: "받는 쪽",
    icon: "📥",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", null, "수락"),
        " · 슬랩이 내 PCL 지갑으로 이전. 가격이 0p가 아니면 그 만큼 차감."
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "거절"),
        " · 슬랩은 보낸 사람에게 그대로 남아요."
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "방치"),
        " · 24시간 뒤 자동 만료, 슬랩은 보낸 사람 지갑에 그대로."
      )
    ),
  },
  {
    heading: "보내는 쪽",
    icon: "📤",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "하루 ", h("b", null, "5회"), " 한도 (24시간 슬라이딩)"),
      h("li", { key: 2 }, "전시 중인 슬랩, 다른 선물에 묶인 슬랩은 못 보내요"),
      h("li", { key: 3 }, "받는 사람을 사용자 목록에서 선택"),
      h("li", { key: 4 }, "가격을 ", h("b", null, "0p"), "로 두면 무료 선물"),
      h("li", { key: 5 }, "140자 메시지 첨부 가능 · 보내는 동안엔 회수 가능")
    ),
  },
  {
    heading: "주의",
    icon: "⚠️",
    body: "본인에게는 못 보내요. 만료·거절된 선물의 슬랩은 자동으로 보낸 사람에게 그대로 남아요.",
  },
];

const WILD_SECTIONS: HelpSection[] = [
  {
    heading: "야생 배틀이란",
    icon: "🌿",
    body: h(
      "div",
      null,
      "내 PCL 슬랩 한 장으로 야생 포켓몬과 1:1 턴제 배틀이에요. 이기면 보상이 들어오지만, ",
      h("b", { className: "text-rose-300" }, "지면 그 슬랩은 영구 삭제"),
      "돼요."
    ),
  },
  {
    heading: "스탯 계산",
    icon: "📊",
    body: h(
      "div",
      null,
      "슬랩의 (희귀도 + PCL 등급)에 따라 HP·공격력이 결정돼요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "희귀도 베이스 · C 30 ↗ MUR 95 (HP), C 8 ↗ MUR 24 (ATK)"),
        h("li", { key: 2 }, "등급 배수 · 6→1.0 / 7→1.1 / 8→1.3 / 9→1.6 / 10→2.0")
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "즉, MUR PCL10 슬랩이 단연 최강."
      )
    ),
  },
  {
    heading: "타입 상성",
    icon: "⚔️",
    body: h(
      "div",
      null,
      "슬랩 ↔ 야생의 타입 상성에 따라 공격 효과가 달라져요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-emerald-300" }, "2배"),
          " 효과는 ",
          h("b", null, "발군이다!")
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-zinc-400" }, "0.5배"),
          "는 ",
          h("b", null, "효과가 별로다…")
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-zinc-500" }, "0배"),
          "는 ",
          h("b", null, "효과가 없는 것 같다…")
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "게임 화면 아래 “타입 상성표”를 펼쳐 미리 확인하세요."
      )
    ),
  },
  {
    heading: "보상",
    icon: "🪙",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        "승리 · ",
        h("b", { className: "text-amber-300" }, "+20,000p"),
        " · 랭킹 ",
        h("b", { className: "text-amber-300" }, "+50점")
      ),
      h("li", { key: 2 }, "도망 · 비용·페널티 없음. 다음 카드 고를 때 유용"),
      h(
        "li",
        { key: 3 },
        "패배 · 슬랩 영구 삭제 + ",
        h("b", null, "30초 쿨다운")
      )
    ),
  },
  {
    heading: "배경",
    icon: "🏞️",
    body: "매 조우마다 풀숲·동굴·해변·화산·설산·밤의 숲·고대 유적·체육관·배틀 스타디움·도시 거리·항구·우주·꽃밭 등 다양한 배틀 무대가 무작위로 펼쳐져요.",
  },
  {
    heading: "포켓몬 종류",
    icon: "👾",
    body: "1세대를 중심으로 35종 이상의 야생 포켓몬이 등장해요. 망나뇽·갸라도스·프리져·썬더·파이어 같은 강적부터 메타몽·이브이·파오리 같은 친숙한 얼굴까지 매번 새로운 만남이 기다립니다.",
  },
  {
    heading: "팁",
    icon: "💡",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "야생의 타입을 보고 상성 좋은 슬랩을 골라야 한 방에 끝나요."),
      h(
        "li",
        { key: 2 },
        "PCL 6~7 슬랩은 어차피 랭킹 점수에 안 들어가니 야생 출전 후보로 좋아요."
      ),
      h(
        "li",
        { key: 3 },
        "PCL 10이나 MUR 슬랩은 가능하면 안전하게 센터 전시로 보존하세요 — 부수기로도 잃을 수 있으니 분산이 중요해요."
      )
    ),
  },
];

const POKEDEX_SECTIONS: HelpSection[] = [
  {
    heading: "도감이란",
    icon: "📔",
    body: "모든 카드가 표시되며, 도감에 등록되지 않은 카드는 어둡게 보여요. 한 번 등록하면 그 슬랩은 카드지갑에서 사라지고 도감에 박제돼요. 카드 한 종류는 한 번만 등록할 수 있어요.",
  },
  {
    heading: "등록 조건",
    icon: "✅",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "PCL 10등급으로 감별된 카드만 등록 가능 (센터에 전시 중이 아닌 슬랩)"),
      h("li", { key: 2 }, "같은 카드(card_id)는 한 번만 등록 가능"),
      h("li", { key: 3 }, "등록된 카드는 카드지갑에서 영구 삭제 — 다시 꺼낼 수 없어요")
    ),
  },
  {
    heading: "일괄 등록",
    icon: "📦",
    body: h(
      "div",
      null,
      h("b", null, "📔 도감 일괄 등록"),
      " 버튼을 누르면 보유 중인 모든 PCL10 슬랩 (전시 중이 아니고 도감에 없는 카드) 이 한 번에 도감에 등록되고, 해당 슬랩들은 카드지갑에서 영구 삭제돼요."
    ),
  },
  {
    heading: "전투력 보너스",
    icon: "⚡",
    body: h(
      "div",
      null,
      "도감 보유 수에 따라 ",
      h("b", null, "센터 전투력"),
      "에 보너스가 붙어 사용자 랭킹에 자동 반영돼요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "5장 → +500"),
        h("li", { key: 2 }, "10장 → +1,200"),
        h("li", { key: 3 }, "15장 → +2,000"),
        h("li", { key: 4 }, "20장 → +3,000"),
        h("li", { key: 5 }, "30장 → +5,000 (이후 1장당 +100)")
      )
    ),
  },
  {
    heading: "등급 완전 컬렉션",
    icon: "✨",
    body: h(
      "div",
      null,
      "한 등급의 모든 카드를 도감에 박제하면 추가 ",
      h("b", null, "전투력 보너스"),
      "가 영구 적용돼요.",
      h(
        "ul",
        { className: "mt-1.5" },
        ...RARITY_ORDER.map((r) =>
          h(
            "li",
            { key: r },
            `${r} (${RARITY_TOTALS[r]}장) → +${RARITY_COMPLETION_BONUS[r].toLocaleString("ko-KR")}`
          )
        )
      )
    ),
  },
  {
    heading: "책 넘기기",
    icon: "📖",
    body: "도감은 책처럼 한 페이지에 24장씩 펼쳐져요. 좌우 화살표로 페이지를 넘기면 3D 페이지 플립 애니메이션이 재생돼요.",
  },
];

const SET_SECTIONS: HelpSection[] = [
  {
    heading: "박스 vs 팩",
    icon: "📦",
    body: h(
      "div",
      null,
      "박스를 열면 그 안에서 ",
      h("b", null, "5팩"),
      "이 나와요. 각 팩에는 ",
      h("b", null, "5장"),
      "의 카드가 들어 있고, 슬롯별로 등급 가중치가 달라 마지막 슬롯은 보통 RR/AR/SR 이상 보장이에요."
    ),
  },
  {
    heading: "한 박스 가격",
    icon: "🪙",
    body: h(
      "div",
      null,
      "세트마다 박스 가격이 다르게 책정돼요. 우측 상단에 보이는 ",
      h("b", null, "박스당"),
      " 슬롯 표기와 같이, 자세한 단가는 박스 구매 버튼 위 가격 칩에서 확인하세요."
    ),
  },
  {
    heading: "AR 미만 자동 판매",
    icon: "💸",
    body: h(
      "div",
      null,
      "체크하면 C · U · R · RR 카드는 지갑에 저장하지 않고 일괄판매 단가로 즉시 포인트로 환산돼요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "지갑 한도(10,000장)에 잘 안 닿게 해줘요"),
        h("li", { key: 2 }, "박스 한 판 / 여러 박스 한번에 모두 적용"),
        h("li", { key: 3 }, "설정은 자동 저장 (다음 박스 열 때도 유지)")
      )
    ),
  },
  {
    heading: "여러 박스 한번에",
    icon: "🚀",
    body: "3 / 5 / 10박스를 한 번에 자동 개봉할 수 있어요. 결과 화면에 모든 카드와 자동판매 수익이 합산돼서 표시돼요. 한 박스라도 저장 실패 시 그 박스 비용만 환불, 그 전까지는 정상 저장.",
  },
  {
    heading: "지갑이 가득 찰 때",
    icon: "💼",
    body: h(
      "div",
      null,
      "일반 카드 ",
      h("b", null, "10,000장"),
      "을 넘기면 박스가 거부되고 비용이 자동 환불돼요. 이럴 땐 자동 판매 옵션을 켜거나, ",
      h("b", null, "일괄 판매"),
      "로 잡카드를 정리한 뒤 다시 시도하세요."
    ),
  },
  {
    heading: "팁",
    icon: "💡",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        "어떤 등급이든 ",
        h("b", null, "감별"),
        "해서 슬랩으로 만들 수 있어요 — 일괄 판매보다 보너스가 훨씬 커요."
      ),
      h("li", { key: 2 }, "감별 실패 시 카드가 사라지니 신중히 (실패 70%)."),
      h("li", { key: 3 }, "박스 도중 페이지를 떠나도 깐 카드는 24시간 동안 자동 복원돼요.")
    ),
  },
];

export const PAGE_HELP: Record<string, PageHelp> = {
  "/": { title: "홈", sections: HOME_SECTIONS },
  "/wallet": { title: "내 카드지갑", sections: WALLET_SECTIONS },
  "/wallet/bulk-sell": { title: "일괄 판매", sections: BULK_SELL_SECTIONS },
  "/center": { title: "포켓몬센터", sections: CENTER_SECTIONS },
  "/grading": { title: "PCL 감별", sections: GRADING_SECTIONS },
  "/users": { title: "사용자 랭킹", sections: USERS_SECTIONS },
  "/profile": { title: "내 프로필", sections: PROFILE_SECTIONS },
  "/gifts": { title: "선물함", sections: GIFTS_SECTIONS },
  "/wild": { title: "야생 배틀", sections: WILD_SECTIONS },
  "/pokedex": { title: "PCL 도감", sections: POKEDEX_SECTIONS },
};

export function resolvePageHelp(pathname: string): PageHelp | null {
  if (PAGE_HELP[pathname]) return PAGE_HELP[pathname];
  if (pathname.startsWith("/set/")) {
    return { title: "박스 개봉", sections: SET_SECTIONS };
  }
  if (pathname.startsWith("/center/")) {
    return { title: "다른 유저 센터", sections: VISIT_CENTER_SECTIONS };
  }
  return null;
}

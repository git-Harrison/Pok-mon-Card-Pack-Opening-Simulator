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
      "한국어판 포켓몬 카드 6세트의 박스를 까고, 모은 카드를 ",
      h("b", null, "감별·전시·도감·야생 배틀"),
      "로 키워가는 시뮬레이터예요. 가입 시 ",
      h("b", { className: "text-amber-300" }, "1,000,000p"),
      "가 지급되고, 박스를 사 카드를 뽑으면 그 자리에서 다양한 시스템에 투입할 수 있어요."
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
        "박스 = 5팩 × 5장. 한 팩씩 까거나 ",
        h("b", null, "“모든 팩 한번에 열기”")
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "감별(PCL)"),
        "로 슬랩을 만들고 ",
        h("b", null, "센터에 전시"),
        "하거나 ",
        h("b", null, "야생 배틀"),
        "에 출전"
      ),
      h(
        "li",
        { key: 4 },
        "PCL10 슬랩은 ",
        h("b", null, "도감 박제"),
        "와 ",
        h("b", null, "프로필 펫"),
        "으로 영구 점수화"
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
        " · 카드(최대 20,000장) + PCL 슬랩(최대 20,000장)"
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "센터"),
        " · 보관함 4종으로 슬랩 전시 + 시간당 자동 수익"
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "감별"),
        " · 모든 등급 카드를 PCL 6~10 슬랩으로 (실패 70%)"
      ),
      h(
        "li",
        { key: 4 },
        h("b", null, "야생"),
        " · 슬랩 1장 vs 야생 포켓몬. 승리 +20,000p · 패배 영구 삭제"
      ),
      h(
        "li",
        { key: 5 },
        h("b", null, "도감"),
        " · PCL10 슬랩을 영구 박제 + 전투력 보너스"
      ),
      h(
        "li",
        { key: 6 },
        h("b", null, "랭킹/사용자"),
        " · 다른 유저 비교, 센터 방문, 조롱·선물"
      ),
      h(
        "li",
        { key: 7 },
        h("b", null, "프로필"),
        " · 캐릭터 선택, 닉네임, 펫(메인 카드 10장)"
      )
    ),
  },
  {
    heading: "포인트 흐름",
    icon: "🪙",
    body: h(
      "div",
      null,
      "박스(30k~50k) → 카드 → ",
      h("b", null, "감별 보너스"),
      "(PCL10 +50,000p), ",
      h("b", null, "전시 수익"),
      "(MUR PCL10 시간당 100,000p), ",
      h("b", null, "야생 승리"),
      "(+20,000p), ",
      h("b", null, "부수기 전리품"),
      "(보관함가 80%)으로 회수해요."
    ),
  },
  {
    heading: "잃을 수 있는 자원",
    icon: "⚠️",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", null, "감별 실패"),
        " · 카드 사라짐 (70% 확률)"
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "야생 패배"),
        " · 출전 슬랩 영구 삭제"
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "보관함 부수기"),
        " · 다른 유저가 내 전시 슬랩을 깨면 영구 삭제"
      ),
      h(
        "li",
        { key: 4 },
        h("b", null, "도감 박제"),
        " · 본인이 박제한 PCL10 슬랩은 카드지갑에서 영구 삭제 (점수는 유지)"
      )
    ),
  },
];

const WALLET_SECTIONS: HelpSection[] = [
  {
    heading: "지갑이란",
    icon: "🎴",
    body: "박스에서 뽑은 일반 카드와 PCL 감별 슬랩이 모이는 곳이에요. 카드를 누르면 상세 보기·공유로 이동해요.",
  },
  {
    heading: "상단 KPI",
    icon: "📊",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, h("b", null, "종류"), " · 보유한 서로 다른 카드 종 수"),
      h("li", { key: 2 }, h("b", null, "장수"), " · 총 카드 장수 / 한도 20,000장"),
      h("li", { key: 3 }, h("b", null, "개봉"), " · 지금까지 깐 팩 수"),
      h("li", { key: 4 }, h("b", null, "PCL"), " · 감별 완료된 슬랩 수 / 한도 20,000장")
    ),
  },
  {
    heading: "두 가지 탭",
    icon: "🗂️",
    body: h(
      "div",
      null,
      h(
        "ul",
        null,
        h("li", { key: 1 }, h("b", null, "보유 카드"), " · 일반 카드 격자 + 희귀도 필터"),
        h(
          "li",
          { key: 2 },
          h("b", null, "PCL 감별"),
          " · 등급별로 정렬된 슬랩. 그레이드 6 이상이면 ",
          h("b", null, "🎁 선물 보내기"),
          " 버튼이 떠요"
        )
      )
    ),
  },
  {
    heading: "정리하고 싶을 때",
    icon: "🧹",
    body: h(
      "div",
      null,
      "한도(20,000장)가 차면 박스를 더 못 사요. ",
      h(
        Link,
        { href: "/wallet/bulk-sell", className: "underline text-amber-300" },
        "일괄 판매"
      ),
      " 페이지에서 등급별로 한 번에 처분할 수 있어요. ",
      h("b", null, "SR 이상"),
      "은 ",
      h(
        Link,
        { href: "/grading", className: "underline text-amber-300" },
        "감별"
      ),
      "로 슬랩을 만드는 게 보통 더 이득이에요."
    ),
  },
  {
    heading: "PCL 슬랩의 쓰임",
    icon: "💎",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, h("b", null, "센터 전시"), " · 시간당 거래 포인트 + 랭킹 점수"),
      h("li", { key: 2 }, h("b", null, "야생 배틀"), " · 1:1 전투 (패배 시 영구 삭제)"),
      h("li", { key: 3 }, h("b", null, "도감 박제"), " · PCL10 한정 영구 등록"),
      h("li", { key: 4 }, h("b", null, "프로필 펫"), " · PCL10 10장까지 메인 카드로 등록"),
      h("li", { key: 5 }, h("b", null, "선물"), " · 그레이드 6 이상만 가능 · 일일 5회"),
      h("li", { key: 6 }, h("b", null, "일괄 판매"), " · PCL10 20k / 9 10k / 8 2k / 6·7 1k")
    ),
  },
  {
    heading: "🏛️ 전시 중 슬랩",
    icon: "🔒",
    body: h(
      "div",
      null,
      h("b", null, "전시 중"),
      " 배지가 붙은 슬랩은 지금 센터 보관함에 들어가 있어요. 전시된 슬랩은 ",
      h("b", null, "일괄 판매 · 야생 배틀 · 선물 · 도감 박제"),
      "에 사용할 수 없고, 직접 꺼내거나 부서지기 전까지 잠겨 있어요."
    ),
  },
];

const BULK_SELL_SECTIONS: HelpSection[] = [
  {
    heading: "일괄 판매란",
    icon: "💰",
    body: "지갑의 일반 카드와 PCL 슬랩을 등급/그레이드별로 묶어 한 번에 처분하는 화면이에요. 단가가 낮은 대신 빠르고, 전시 중인 슬랩은 자동으로 제외돼요.",
  },
  {
    heading: "일반 카드 단가",
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
    heading: "PCL 슬랩 단가",
    icon: "💎",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, h("b", null, "PCL 10 (GEM MINT)"), " · 20,000p / 장"),
      h("li", { key: 2 }, h("b", null, "PCL 9 (MINT)"), " · 10,000p / 장"),
      h("li", { key: 3 }, h("b", null, "PCL 8 (NM-MT)"), " · 2,000p / 장"),
      h("li", { key: 4 }, h("b", null, "PCL 7·6"), " · 1,000p / 장")
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
        h("b", null, "SR 이상 일반 카드"),
        "는 우선 ",
        h(
          Link,
          { href: "/grading", className: "underline text-amber-300" },
          "PCL 감별"
        ),
        "에 도전 — 성공 시 보너스가 훨씬 커요."
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
        " 옵션을 켜두면 처음부터 지갑에 들어오지 않고 즉시 환산돼요."
      )
    ),
  },
  {
    heading: "주의",
    icon: "⚠️",
    body: h(
      "div",
      null,
      "각 행을 누르면 ",
      h("b", null, "확인 팝업"),
      " 후 즉시 판매돼요. 되돌릴 수 없으니 신중하게. PCL10 슬랩은 ",
      h("b", null, "도감 박제"),
      "·",
      h("b", null, "프로필 펫"),
      "에 쓰는 게 보통 더 큰 가치예요."
    ),
  },
];

const CENTER_SECTIONS: HelpSection[] = [
  {
    heading: "여긴 어디?",
    icon: "🏛️",
    body: h(
      "div",
      null,
      "내 PCL 슬랩을 전시하는 6×6 그리드의 포켓몬센터예요. ",
      h("b", null, "PCL 9 또는 10"),
      " 슬랩만 전시 가능하고, 빈 자리를 누르면 보관함을 구입해요. 우측 상단 ",
      h("b", null, "🔗 초대 링크 복사"),
      "로 친구를 부를 수 있어요."
    ),
  },
  {
    heading: "보관함 4종",
    icon: "🪵",
    body: h(
      "div",
      null,
      "한 보관함 = 슬랩 1장. 가격이 비쌀수록 부수기 방어율이 높아요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "🪵 ", h("b", null, "기본"), " · 10,000p · 방어 3%"),
        h("li", { key: 2 }, "🔷 ", h("b", null, "유리"), " · 100,000p · 방어 5%"),
        h(
          "li",
          { key: 3 },
          "💠 ",
          h("b", null, "프리미엄"),
          " · 300,000p · 방어 10%"
        ),
        h(
          "li",
          { key: 4 },
          "👑 ",
          h("b", null, "레전더리"),
          " · 1,000,000p · 방어 15%"
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "보관함 치우기는 환불 없음, 안에 든 슬랩만 지갑으로 돌아와요."
      )
    ),
  },
  {
    heading: "전시 수익 (시간당)",
    icon: "💰",
    body: h(
      "div",
      null,
      "전시 슬랩의 ",
      h("b", null, "희귀도 × PCL 등급"),
      "에 따라 시간당 거래 포인트와 랭킹 점수(거래 포인트의 1/200)가 자동 적립돼요. 센터 페이지에 들를 때마다 자동 정산.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "MUR PCL10"),
          " · 100,000p / 시간 · 랭킹 +500"
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-fuchsia-300" }, "UR PCL10"),
          " · 60,000p · 랭킹 +300"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-rose-300" }, "SAR PCL10"),
          " · 40,000p · 랭킹 +200"
        ),
        h(
          "li",
          { key: 4 },
          h("b", { className: "text-sky-300" }, "MA PCL10"),
          " · 30,000p"
        ),
        h(
          "li",
          { key: 5 },
          h("b", { className: "text-emerald-300" }, "SR PCL10"),
          " · 20,000p"
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "PCL 등급이 1단계 내려갈 때마다 보상은 절반 수준으로 줄어요 (PCL6까지 적립)."
      )
    ),
  },
  {
    heading: "부수기 (방어 측)",
    icon: "🛡️",
    body: h(
      "div",
      null,
      "다른 유저가 내 보관함을 부수러 올 수 있어요. 성공률 = ",
      h("b", null, "30% − 보관함 방어"),
      ".",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          "공격이 ",
          h("b", { className: "text-emerald-200" }, "실패"),
          "하면 매번 랭킹 ",
          h("b", null, "+50점"),
          " 적립"
        ),
        h(
          "li",
          { key: 2 },
          "결과와 무관하게 ",
          h("b", { className: "text-amber-200" }, "공격 비용의 50%"),
          "가 즉시 내 지갑으로 들어와요"
        ),
        h(
          "li",
          { key: 3 },
          "성공하면 보관함과 슬랩이 영구 삭제되고 공격자가 ",
          h("b", null, "보관함가 80%"),
          "를 가져가요"
        ),
        h(
          "li",
          { key: 4 },
          "📜 ",
          h("b", null, "방문 기록"),
          " 버튼으로 누가 시도했는지 확인할 수 있어요"
        )
      )
    ),
  },
  {
    heading: "전시 가능 등급",
    icon: "💎",
    body: h(
      "div",
      null,
      "현재 ",
      h("b", { className: "text-amber-300" }, "PCL 9·10"),
      " 슬랩만 전시할 수 있어요. PCL 6~8 슬랩도 시간당 수익 공식은 같지만 전시 슬롯에는 들어가지 않아요. 전시 중인 슬랩은 ",
      h(
        Link,
        { href: "/wallet?tab=psa", className: "underline text-amber-300" },
        "지갑"
      ),
      "에서 🏛️ 전시 중 배지로 표시돼요."
    ),
  },
];

const VISIT_CENTER_SECTIONS: HelpSection[] = [
  {
    heading: "여긴 어디?",
    icon: "🏛️",
    body: "다른 유저의 포켓몬센터를 둘러보는 페이지예요. 전시된 슬랩을 감상하거나, 비싼 보관함을 부수러 시도하거나, 펫·전투력·전시 수익 같은 정보를 확인할 수 있어요. 자기 자신의 센터는 부술 수 없어요.",
  },
  {
    heading: "부수기 흐름",
    icon: "💥",
    body: h(
      "div",
      null,
      "보관함을 누르면 안에 든 슬랩 카드가 떠요. 카드를 다시 누르면 부수기 확인창. 비용은 ",
      h("b", null, "보관함 가격의 10%"),
      "예요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "🪵 기본 · 1,000p · 방어 3% → 성공률 27%"),
        h("li", { key: 2 }, "🔷 유리 · 10,000p · 방어 5% → 성공률 25%"),
        h("li", { key: 3 }, "💠 프리미엄 · 30,000p · 방어 10% → 성공률 20%"),
        h("li", { key: 4 }, "👑 레전더리 · 100,000p · 방어 15% → 성공률 15%")
      )
    ),
  },
  {
    heading: "결과",
    icon: "🎲",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", { className: "text-rose-300" }, "성공"),
        " → 보관함과 슬랩 영구 삭제 + ",
        h("b", { className: "text-amber-200" }, "보관함가 80%"),
        " 전리품 + 랭킹 ",
        h("b", null, "+3,000점")
      ),
      h(
        "li",
        { key: 2 },
        h("b", { className: "text-emerald-300" }, "실패"),
        " → 비용 환불 없음. 상대(주인)는 랭킹 +50점"
      ),
      h(
        "li",
        { key: 3 },
        "주인은 결과와 무관하게 비용의 ",
        h("b", { className: "text-amber-200" }, "50%"),
        " 자동 적립"
      ),
      h("li", { key: 4 }, "모든 시도는 ", h("b", null, "디스코드"), "에 자동 공지")
    ),
  },
  {
    heading: "센터 정보 패널",
    icon: "📊",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, h("b", null, "펫 점수"), " · 등록한 PCL10 펫 10장 합산 (최대 1,000)"),
      h("li", { key: 2 }, h("b", null, "시간당 거래 수익"), " · 전시 슬랩 합산 시간당 p"),
      h("li", { key: 3 }, h("b", null, "시간당 랭킹 적립"), " · 전시 수익의 1/200"),
      h("li", { key: 4 }, h("b", null, "누적 전시 랭킹 점수"), " · 전시로 쌓아온 누적치")
    ),
  },
  {
    heading: "전략",
    icon: "💡",
    body: h(
      "div",
      null,
      "비싼 보관함일수록 슬랩 가치가 크지만 비용도 크고, 방어율이 높아 성공률이 낮아요. 한 번 깨지면 PCL10 슬랩까지 영구 소멸하니 신중하게. 부수기 외에 ",
      h("b", null, "🔥 조롱하기"),
      "는 ",
      h(
        Link,
        { href: "/users", className: "underline text-amber-300" },
        "사용자 랭킹"
      ),
      " 페이지에서 가능해요."
    ),
  },
];

const GRADING_SECTIONS: HelpSection[] = [
  {
    heading: "PCL 감별이란",
    icon: "🔎",
    body: h(
      "div",
      null,
      h("b", null, "모든 등급"),
      "(C ~ MUR)의 카드를 PCL 슬랩으로 감별할 수 있어요. 슬랩은 일반 카드보다 가치가 훨씬 높고, ",
      h("b", null, "센터 전시"),
      "·",
      h("b", null, "야생 배틀"),
      "·",
      h("b", null, "도감"),
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
        h("li", { key: 1 }, "실패 (카드 소실) · ", h("b", { className: "text-rose-300" }, "70%")),
        h("li", { key: 2 }, "PCL 6 (EX-MT) · 8%"),
        h("li", { key: 3 }, "PCL 7 (NEAR MINT) · 10%"),
        h("li", { key: 4 }, "PCL 8 (NM-MT) · 8%"),
        h("li", { key: 5 }, "PCL 9 (MINT) · 3.5%"),
        h(
          "li",
          { key: 6 },
          h("b", { className: "text-amber-300" }, "PCL 10 (GEM MINT) · 0.5%")
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "감별 확률은 카드 등급과 무관해요. C카드든 MUR이든 동일."
      )
    ),
  },
  {
    heading: "지갑 보너스 (성공 시)",
    icon: "🪙",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", { className: "text-amber-300" }, "PCL 10"),
        " · +50,000p"
      ),
      h("li", { key: 2 }, h("b", null, "PCL 9"), " · +30,000p"),
      h("li", { key: 3 }, h("b", null, "PCL 8"), " · +10,000p"),
      h("li", { key: 4 }, h("b", null, "PCL 6·7"), " · +3,000p")
    ),
  },
  {
    heading: "랭킹 점수",
    icon: "🏆",
    body: h(
      "div",
      null,
      h("b", { className: "text-amber-300" }, "PCL 10 성공만"),
      " 누적 랭킹 ",
      h("b", null, "+500점"),
      ". 슬랩이 부서지거나 팔려도 점수는 안 빠져요. PCL 6~9는 랭킹 점수에 들어가지 않지만 ",
      h("b", null, "전시 수익·야생 배틀"),
      "에서는 활약해요."
    ),
  },
  {
    heading: "📚 일괄 감별",
    icon: "📚",
    body: h(
      "div",
      null,
      "여러 장을 한 번에 감별. ",
      h("b", null, "“PCL N 미만 자동 판매”"),
      "(7·8·9·10 미만 선택) 옵션을 켜면 낮은 등급은 슬랩으로 만들지 않고 즉시 환산돼요. 슬랩 한도 20,000장에 가까울 때 유용."
    ),
  },
  {
    heading: "한도와 주의",
    icon: "⚠️",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "PCL 슬랩 보유 한도 ", h("b", null, "20,000장")),
      h("li", { key: 2 }, "감별한 카드는 결과와 무관하게 지갑에서 사라져요"),
      h("li", { key: 3 }, "슬랩은 ", h("b", null, "야생 패배 / 부수기 성공"), " 시 영구 삭제"),
      h("li", { key: 4 }, "감별 결과는 ", h("b", null, "디스코드"), "에 자동 공지")
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
      "상단 탭에서 세 가지 모드를 전환할 수 있어요. 각 행을 누르면 펼쳐져서 전투력·펫·도감·PCL10 통계가 보여요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "🏆 랭킹 점수"),
          " · 누적 점수. PCL10 감별·부수기·야생·전시로 쌓여요"
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-rose-300" }, "⚔️ 전투력"),
          " · 지금 전시된 슬랩의 합산 화력 + 도감 보너스"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-fuchsia-300" }, "🐾 펫 랭킹"),
          " · 프로필에 등록한 펫(최대 10장) 점수 합산"
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
          { key: 2 },
          h("b", { className: "text-rose-300" }, "남의 보관함 부수기 성공"),
          " · PCL10 파괴 +1,000점 / 그 외 +500점"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-emerald-300" }, "내 보관함 부수기 방어"),
          " · +150점 (상대가 실패할 때마다)"
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
          h("b", { className: "text-violet-300" }, "전시 수익 적립"),
          " · 슬랩 희귀도×PCL 시간당 · 최대 +500점/hr"
        )
      )
    ),
  },
  {
    heading: "전투력 산정",
    icon: "⚔️",
    body: h(
      "div",
      null,
      "센터에 ",
      h("b", null, "지금"),
      " 전시 중인 슬랩 한 장당 (PCL 10 / PCL 9):",
      h(
        "ul",
        { className: "mt-1.5 grid grid-cols-2 gap-x-3 text-[12px]" },
        h("li", { key: 1 }, h("b", null, "MUR"), " · 100 / 90"),
        h("li", { key: 2 }, h("b", null, "UR"), " · 80 / 72"),
        h("li", { key: 3 }, h("b", null, "SAR"), " · 70 / 63"),
        h("li", { key: 4 }, h("b", null, "SR"), " · 60 / 54"),
        h("li", { key: 5 }, h("b", null, "AR"), " · 50 / 45"),
        h("li", { key: 6 }, h("b", null, "MA"), " · 40 / 36"),
        h("li", { key: 7 }, h("b", null, "RR"), " · 30 / 27"),
        h("li", { key: 8 }, h("b", null, "R"), " · 20 / 18"),
        h("li", { key: 9 }, h("b", null, "U"), " · 10 / 9"),
        h("li", { key: 10 }, h("b", null, "C"), " · 6 / 5")
      ),
      h(
        "p",
        { className: "mt-1.5" },
        "+ 도감 보너스(보유 수 + 등급 완전 컬렉션)도 합산. 슬랩이 부서지면 즉시 빠져요."
      )
    ),
  },
  {
    heading: "펫 랭킹 산정",
    icon: "🐾",
    body: h(
      "div",
      null,
      h(
        Link,
        { href: "/profile", className: "underline text-amber-300" },
        "프로필"
      ),
      "에서 ",
      h("b", null, "PCL10 슬랩"),
      "을 최대 10장까지 펫으로 등록. 펫 한 장당:",
      h(
        "p",
        { className: "mt-1" },
        "희귀도 점수 × 10 (MA 40 · AR 50 · SR 60 · SAR 70 · UR 80 · MUR 100)"
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "MUR PCL10 10장 = ",
        h("b", { className: "text-fuchsia-300" }, "MAX 1,000점"),
        ". 펫 슬랩이 부서지면 점수에서 빠져요."
      )
    ),
  },
  {
    heading: "🟢 온라인 표시",
    icon: "🟢",
    body: "닉네임 옆 초록 점은 5분 이내 활동한 사용자예요. 실시간 presence 채널로 즉시 갱신돼요.",
  },
  {
    heading: "센터 방문 · 조롱",
    icon: "🔥",
    body: h(
      "div",
      null,
      h("b", null, "🏛️ 센터 방문"),
      " 버튼으로 상대 보관함을 부수러 갈 수 있고, ",
      h("b", null, "🔥 조롱하기"),
      " 버튼으로 200자 이내 메시지를 보낼 수 있어요. 조롱은 받는 사람 화면에 강제 팝업으로 떠요. 자기 자신에게는 못 보내요."
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
      "1세대 관동 지방 캐릭터 6명 중 한 명을 트레이너로 선택해요. 도트 모션으로 움직여요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, h("b", { className: "text-rose-300" }, "지우"), " · 만년 10살 주인공"),
        h("li", { key: 2 }, h("b", { className: "text-cyan-300" }, "이슬"), " · 푸른시티 체육관 관장"),
        h("li", { key: 3 }, h("b", { className: "text-amber-300" }, "웅"), " · 회색시티 체육관 관장"),
        h("li", { key: 4 }, h("b", { className: "text-zinc-200" }, "오박사"), " · 태초마을 박사"),
        h("li", { key: 5 }, h("b", { className: "text-emerald-300" }, "그린"), " · 라이벌"),
        h("li", { key: 6 }, h("b", { className: "text-rose-400" }, "목호"), " · 사천왕 챔피언")
      ),
      h(
        "p",
        { className: "mt-2 text-rose-300 font-bold" },
        "⚠️ 캐릭터는 한 번 선택하면 변경할 수 없어요. 신중하게."
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
      ` 버튼으로 언제든 새 닉네임으로 바꿀 수 있어요. 길이 ${DISPLAY_NAME_MIN}~${DISPLAY_NAME_MAX}자, 다른 사용자와 중복 불가.`,
      h(
        "p",
        { className: "mt-2 text-zinc-400" },
        "랭킹·선물·조롱 등 닉네임이 표시되는 모든 곳에 즉시 반영돼요. 로그인 아이디는 바뀌지 않아요."
      )
    ),
  },
  {
    heading: "펫 시스템 (메인 카드)",
    icon: "🐾",
    body: h(
      "div",
      null,
      "가장 자랑하고 싶은 슬랩을 ",
      h("b", null, "최대 10장"),
      "까지 메인 카드(펫)로 등록할 수 있어요. 슬롯을 누르면 등록 가능한 슬랩 목록이 떠요. 등록·해제 모두 즉시 반영."
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
      " 슬랩에 한정돼요. 9등급 이하 슬랩은 펫이 될 수 없어요. ",
      h(
        Link,
        { href: "/grading", className: "underline text-amber-300" },
        "감별"
      ),
      "을 더 도전해보세요."
    ),
  },
  {
    heading: "펫 점수 산정",
    icon: "📈",
    body: h(
      "div",
      null,
      "펫 한 장당 점수 = ",
      h("b", null, "희귀도 점수 × 10"),
      ".",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "SR · 50점"),
        h("li", { key: 2 }, "MA · 60점"),
        h("li", { key: 3 }, "SAR · 70점"),
        h("li", { key: 4 }, "UR · 80점"),
        h("li", { key: 5 }, h("b", { className: "text-amber-300" }, "MUR · 100점"))
      ),
      h(
        "p",
        { className: "mt-2 text-zinc-400" },
        "MUR PCL10 10장 등록 시 ",
        h("b", { className: "text-white" }, "MAX 1,000점"),
        ". 펫 점수는 사용자 랭킹 ",
        h("b", null, "🐾 펫 랭킹"),
        " 탭에 그대로 반영돼요."
      )
    ),
  },
];

const GIFTS_SECTIONS: HelpSection[] = [
  {
    heading: "선물이란",
    icon: "🎁",
    body: h(
      "div",
      null,
      h("b", null, "PCL 슬랩"),
      "(그레이드 ",
      h("b", null, "6 이상"),
      ")만 선물할 수 있어요. 받는 사람이 수락하면 슬랩 소유권이 그대로 이전돼요. 일반 카드는 선물 불가."
    ),
  },
  {
    heading: "받는 쪽 (받은 선물)",
    icon: "📥",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", { className: "text-emerald-300" }, "수락"),
        " · 슬랩이 내 PCL 지갑으로 이전. 가격이 0p가 아니면 그 만큼 차감"
      ),
      h(
        "li",
        { key: 2 },
        h("b", { className: "text-rose-300" }, "거절"),
        " · 슬랩은 보낸 사람에게 그대로 남아요"
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "방치"),
        " · 24시간 뒤 자동 만료, 슬랩은 보낸 사람 지갑에 그대로"
      )
    ),
  },
  {
    heading: "보내는 쪽 (보낸 선물)",
    icon: "📤",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "하루 ", h("b", null, "5회"), " 한도 (24시간 슬라이딩)"),
      h("li", { key: 2 }, h("b", null, "전시 중"), " 슬랩, 다른 선물에 묶인 슬랩은 못 보내요"),
      h("li", { key: 3 }, "받는 사람을 사용자 목록에서 검색해 선택"),
      h("li", { key: 4 }, "가격을 ", h("b", null, "0p"), "로 두면 무료 선물"),
      h("li", { key: 5 }, "140자 메시지 첨부 가능"),
      h("li", { key: 6 }, "수락 전이라면 ", h("b", null, "회수"), " 가능")
    ),
  },
  {
    heading: "어디서 보내요?",
    icon: "🚀",
    body: h(
      "div",
      null,
      h(
        Link,
        { href: "/wallet?tab=psa", className: "underline text-amber-300" },
        "지갑의 PCL 탭"
      ),
      "에서 슬랩 아래 ",
      h("b", null, "🎁 선물 보내기"),
      " 버튼을 누르거나, 이 페이지 우측 상단 ",
      h("b", null, "🎁 선물 보내기"),
      " 버튼을 눌러 시작해요."
    ),
  },
  {
    heading: "주의",
    icon: "⚠️",
    body: "본인에게는 못 보내요. 만료·거절된 선물의 슬랩은 자동으로 보낸 사람에게 그대로 남아요. 받는 쪽이 PCL 한도(20,000장)에 차 있으면 수락이 거부돼요.",
  },
];

const WILD_SECTIONS: HelpSection[] = [
  {
    heading: "야생 배틀이란",
    icon: "🌿",
    body: h(
      "div",
      null,
      "내 PCL 슬랩 한 장으로 야생 포켓몬과 1:1 턴제 배틀이에요. 이기면 ",
      h("b", { className: "text-amber-300" }, "+20,000p"),
      " · 랭킹 ",
      h("b", { className: "text-amber-300" }, "+50점"),
      ", ",
      h("b", { className: "text-rose-300" }, "지면 그 슬랩은 영구 삭제"),
      "돼요. 전시 중인 슬랩은 출전 못 해요."
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
        h("li", { key: 1 }, "희귀도 베이스 · C 30/8 ↗ MUR 95/24 (HP/ATK)"),
        h("li", { key: 2 }, "등급 배수 · 6→×1.0 / 7→×1.1 / 8→×1.3 / 9→×1.6 / 10→×2.0")
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "MUR PCL10 슬랩이 단연 최강 (HP 190 · ATK 48)."
      )
    ),
  },
  {
    heading: "타입 상성",
    icon: "⚔️",
    body: h(
      "div",
      null,
      "슬랩 ↔ 야생의 타입 상성에 따라 데미지 배율이 달라져요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-emerald-300" }, "2배"),
          " · ",
          h("b", null, "효과는 발군이다!")
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-zinc-400" }, "0.5배"),
          " · ",
          h("b", null, "효과가 별로다…")
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-zinc-500" }, "0배"),
          " · ",
          h("b", null, "효과가 없는 것 같다…")
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "배틀 화면 아래 “타입 상성표”를 펼쳐 미리 확인하세요."
      )
    ),
  },
  {
    heading: "보상과 페널티",
    icon: "🪙",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", { className: "text-emerald-300" }, "승리"),
        " · +20,000p · 랭킹 +50점"
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "도망"),
        " · 비용·페널티 없음. 다른 야생을 노릴 수 있어요"
      ),
      h(
        "li",
        { key: 3 },
        h("b", { className: "text-rose-300" }, "패배"),
        " · 출전 슬랩 영구 삭제 + 짧은 쿨다운"
      )
    ),
  },
  {
    heading: "야생 포켓몬",
    icon: "👾",
    body: "1세대 중심으로 36종이 등장. 미뇽·뮤츠·라프라스 같은 강적부터 피카츄·이상해씨·꼬렛 같은 친숙한 얼굴까지 매번 다른 만남이 기다려요. 모든 18가지 타입이 골고루 섞여 있어요.",
  },
  {
    heading: "배틀 무대",
    icon: "🏞️",
    body: "매 조우마다 풀숲·동굴·해변·화산·설산·밤의 숲·고대 유적·체육관·배틀 스타디움·도시 거리·항구·우주·꽃밭 등 다양한 biome이 무작위로 펼쳐져요.",
  },
  {
    heading: "전략 팁",
    icon: "💡",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "야생 타입을 먼저 보고 상성 좋은 슬랩을 골라요"),
      h(
        "li",
        { key: 2 },
        "PCL 6~7 슬랩은 어차피 랭킹 점수에 안 들어가니 야생 출전 후보로 좋아요"
      ),
      h(
        "li",
        { key: 3 },
        "PCL 10·MUR 슬랩은 안전하게 ",
        h("b", null, "센터 전시"),
        " 또는 ",
        h("b", null, "도감 박제"),
        "로 보존하는 게 보통 이득이에요"
      )
    ),
  },
];

const POKEDEX_SECTIONS: HelpSection[] = [
  {
    heading: "도감이란",
    icon: "📔",
    body: h(
      "div",
      null,
      `한국어판 6세트 ${(RARITY_TOTALS.MUR + RARITY_TOTALS.UR + RARITY_TOTALS.SAR + RARITY_TOTALS.MA + RARITY_TOTALS.SR + RARITY_TOTALS.AR + RARITY_TOTALS.RR + RARITY_TOTALS.R + RARITY_TOTALS.U + RARITY_TOTALS.C).toLocaleString("ko-KR")}장 카드를 한 자리에 모아 보는 도감이에요. 등록되지 않은 카드는 어둡게 보여요. 한 번 등록한 카드는 다시 등록할 수 없고, 그 슬랩은 카드지갑에서 영구 삭제돼요.`
    ),
  },
  {
    heading: "등록 조건",
    icon: "✅",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", null, "PCL 10"),
        " 슬랩만 등록 가능 (전시 중인 슬랩은 불가)"
      ),
      h("li", { key: 2 }, "같은 카드(card_id)는 한 번만 등록"),
      h(
        "li",
        { key: 3 },
        "등록된 슬랩은 카드지갑에서 ",
        h("b", null, "영구 삭제"),
        " — 다시 꺼낼 수 없어요"
      ),
      h(
        "li",
        { key: 4 },
        "랭킹 +500점은 그대로 유지돼요 (감별 시점에 이미 적립)"
      )
    ),
  },
  {
    heading: "📦 일괄 등록",
    icon: "📦",
    body: h(
      "div",
      null,
      h("b", null, "도감 일괄 등록"),
      " 버튼을 누르면 보유 중인 모든 PCL10 슬랩(전시 중이 아니고 도감에 없는 카드)이 한 번에 도감에 등록되고, 해당 슬랩들은 카드지갑에서 영구 삭제돼요."
    ),
  },
  {
    heading: "도감 수 보너스 (전투력)",
    icon: "⚡",
    body: h(
      "div",
      null,
      "도감에 등록한 카드 ",
      h("b", null, "한 장당 등급별 정액"),
      "이 ",
      h("b", null, "센터 전투력"),
      "에 합산돼요.",
      h(
        "ul",
        { className: "mt-1.5 grid grid-cols-2 gap-x-3" },
        h("li", { key: 1 }, h("b", null, "MUR"), " · +1,000"),
        h("li", { key: 2 }, h("b", null, "UR"), " · +400"),
        h("li", { key: 3 }, h("b", null, "SAR"), " · +250"),
        h("li", { key: 4 }, h("b", null, "SR"), " · +180"),
        h("li", { key: 5 }, h("b", null, "AR"), " · +130"),
        h("li", { key: 6 }, h("b", null, "MA"), " · +100"),
        h("li", { key: 7 }, h("b", null, "RR"), " · +50"),
        h("li", { key: 8 }, h("b", null, "R"), " · +30"),
        h("li", { key: 9 }, h("b", null, "U"), " · +15"),
        h("li", { key: 10 }, h("b", null, "C"), " · +8")
      )
    ),
  },
  {
    heading: "등급 완전 컬렉션 보너스",
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
            h("b", null, r),
            ` (${RARITY_TOTALS[r]}장) → +${RARITY_COMPLETION_BONUS[r].toLocaleString("ko-KR")}`
          )
        )
      )
    ),
  },
  {
    heading: "책 넘기기",
    icon: "📖",
    body: "한 페이지에 24장. 등급 탭을 누르면 그 등급만 보이고, 좌우 화살표로 페이지를 넘기면 3D 페이지 플립 애니메이션이 재생돼요.",
  },
];

const SET_SECTIONS: HelpSection[] = [
  {
    heading: "박스 vs 팩",
    icon: "📦",
    body: h(
      "div",
      null,
      "박스를 열면 ",
      h("b", null, "5팩"),
      "이 나오고, 각 팩에는 ",
      h("b", null, "5장"),
      "이 들어 있어요(박스당 25장). 슬롯별로 등급 가중치가 달라 마지막 슬롯은 보통 RR/AR/SR 이상 보장이에요."
    ),
  },
  {
    heading: "박스 가격",
    icon: "🪙",
    body: h(
      "ul",
      null,
      h("li", { key: 1 }, "m2a · 50,000p"),
      h("li", { key: 2 }, "sv8a · 40,000p"),
      h("li", { key: 3 }, "m2 · 40,000p"),
      h("li", { key: 4 }, "sv2a · 35,000p"),
      h("li", { key: 5 }, "sv8 · 30,000p"),
      h("li", { key: 6 }, "sv5a · 30,000p")
    ),
  },
  {
    heading: "AR 미만 자동 판매",
    icon: "💸",
    body: h(
      "div",
      null,
      "체크하면 ",
      h("b", null, "C · U · R · RR"),
      " 카드는 지갑에 저장하지 않고 일괄 판매 단가로 즉시 포인트 환산돼요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h("li", { key: 1 }, "지갑 한도(20,000장)에 잘 안 닿게 해줘요"),
        h("li", { key: 2 }, "한 박스 / 여러 박스 한번에 모두 적용"),
        h("li", { key: 3 }, "설정은 자동 저장 (다음 박스에도 유지)")
      )
    ),
  },
  {
    heading: "여러 박스 한번에",
    icon: "🚀",
    body: "3 / 5 / 10박스를 한 번에 자동 개봉할 수 있어요. 결과 화면에 모든 카드와 자동 판매 수익이 합산돼서 표시. 한 박스라도 저장에 실패하면 그 박스 비용만 환불, 그 전까지 깐 박스는 정상 저장돼요.",
  },
  {
    heading: "지갑이 가득 찰 때",
    icon: "💼",
    body: h(
      "div",
      null,
      "일반 카드 ",
      h("b", null, "20,000장"),
      "을 넘기면 박스가 거부되고 비용이 자동 환불돼요. 자동 판매 옵션을 켜거나 ",
      h(
        Link,
        { href: "/wallet/bulk-sell", className: "underline text-amber-300" },
        "일괄 판매"
      ),
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
        h("b", null, "모든 등급"),
        "(C ~ MUR)을 ",
        h(
          Link,
          { href: "/grading", className: "underline text-amber-300" },
          "감별"
        ),
        "할 수 있어요 — 잡카드도 PCL10이 터지면 +50,000p"
      ),
      h("li", { key: 2 }, "감별 실패 시 카드 소실(70%) — 신중히"),
      h(
        "li",
        { key: 3 },
        "박스 도중 페이지를 떠나도 깐 카드는 ",
        h("b", null, "24시간"),
        " 동안 자동 복원돼요"
      )
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

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
      "한국어판 포켓몬 카드 ",
      h("b", null, "10세트"),
      " 박스를 까고, 모은 카드를 ",
      h("b", null, "감별 · 전시 · 도감 · 야생 배틀"),
      "로 키우는 시뮬레이터예요. 가입 시 ",
      h("b", { className: "text-amber-300" }, "1,000,000p"),
      "가 지급되고, 박스를 사 카드를 뽑아 다양한 시스템에 투입할 수 있어요."
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
        "에서 마음에 드는 세트의 박스를 구매"
      ),
      h(
        "li",
        { key: 2 },
        "박스 = ",
        h("b", null, "5팩 × 5장 = 25장"),
        ". 한 팩씩 깎거나 ",
        h("b", null, "“모든 팩 한 번에”")
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "감별(PCL)"),
        "로 슬랩을 만들어 ",
        h("b", null, "센터 전시"),
        " · ",
        h("b", null, "야생 배틀"),
        "에 투입"
      ),
      h(
        "li",
        { key: 4 },
        h("b", null, "PCL 10 슬랩"),
        "은 ",
        h("b", null, "도감 박제"),
        " · ",
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
        " · 카드 최대 ",
        h("b", null, "100,000장"),
        " + PCL 슬랩 최대 ",
        h("b", null, "50,000장")
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "센터"),
        " · 6×6 그리드, 보관함 4종에 슬랩 전시 + 30분당 자동 수익"
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "감별"),
        " · 모든 등급 카드를 PCL 6~10 슬랩으로 (실패 ",
        h("b", { className: "text-rose-300" }, "70%"),
        ")"
      ),
      h(
        "li",
        { key: 4 },
        h("b", null, "야생"),
        " · 슬랩 1장 vs 야생 포켓몬. 승리 ",
        h("b", { className: "text-amber-300" }, "+20,000p"),
        " · 패배 시 슬랩 영구 삭제"
      ),
      h(
        "li",
        { key: 5 },
        h("b", null, "도감"),
        " · PCL 10 슬랩을 영구 박제 + 전투력 보너스"
      ),
      h(
        "li",
        { key: 6 },
        h("b", null, "랭킹"),
        " · 다른 유저 비교, 센터 방문, 조롱·선물"
      ),
      h(
        "li",
        { key: 7 },
        h("b", null, "프로필"),
        " · 캐릭터 선택, 닉네임, 펫 (PCL 10 최대 10장)"
      )
    ),
  },
  {
    heading: "포인트 흐름",
    icon: "🪙",
    body: h(
      "div",
      null,
      "박스 (",
      h("b", null, "30,000~50,000p"),
      ") → 카드 → ",
      h("b", null, "전시 수익"),
      "(MUR PCL 10 30분당 ",
      h("b", { className: "text-amber-300" }, "600,000p"),
      "), ",
      h("b", null, "야생 승리"),
      " (",
      h("b", { className: "text-amber-300" }, "+20,000p"),
      "), ",
      h("b", null, "부수기 전리품"),
      " (보관함가 ",
      h("b", null, "80%"),
      ") 으로 회수해요."
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
        " · 카드 사라짐 (",
        h("b", { className: "text-rose-300" }, "70%"),
        " 확률)"
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
        " · 본인이 박제한 PCL 10 슬랩은 카드지갑에서 영구 삭제 (도감 점수는 유지)"
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
      h(
        "li",
        { key: 2 },
        h("b", null, "장수"),
        " · 총 카드 장수 / 한도 ",
        h("b", null, "100,000장")
      ),
      h("li", { key: 3 }, h("b", null, "개봉"), " · 지금까지 깐 팩 수"),
      h(
        "li",
        { key: 4 },
        h("b", null, "PCL"),
        " · 감별 완료 슬랩 수 / 한도 ",
        h("b", null, "50,000장")
      )
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
        h("li", { key: 1 }, h("b", null, "보유 카드"), " · 일반 카드 격자 + 등급 필터"),
        h(
          "li",
          { key: 2 },
          h("b", null, "PCL 감별"),
          " · 등급별로 정렬된 슬랩. PCL 6 이상은 ",
          h("b", null, "🎁 선물 보내기"),
          " 가능"
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
      "카드 한도 ",
      h("b", null, "100,000장"),
      "이 차면 박스를 못 사요. ",
      h(
        Link,
        { href: "/grading", className: "underline text-amber-300" },
        "감별"
      ),
      "에서 자동 삭제 옵션으로 잡카드를 정리하거나, ",
      h("b", null, "SR 이상"),
      "은 슬랩으로 만드는 게 보통 더 이득이에요."
    ),
  },
  {
    heading: "PCL 슬랩의 쓰임",
    icon: "💎",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", null, "센터 전시"),
        " · 30분당 거래 포인트 + 랭킹 점수"
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "야생 배틀"),
        " · 1:1 전투. 패배 시 ",
        h("b", { className: "text-rose-300" }, "영구 삭제")
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "도감 박제"),
        " · ",
        h("b", null, "PCL 10"),
        " 한정 영구 등록"
      ),
      h(
        "li",
        { key: 4 },
        h("b", null, "프로필 펫"),
        " · ",
        h("b", null, "PCL 10"),
        " 최대 10장 등록 (같은 카드 중복 불가)"
      ),
      h(
        "li",
        { key: 5 },
        h("b", null, "선물"),
        " · PCL 6 이상만 · ",
        h("b", null, "하루 5회"),
        " 한도"
      )
    ),
  },
  {
    heading: "🏛️ 전시 중 슬랩",
    icon: "🔒",
    body: h(
      "div",
      null,
      h("b", null, "전시 중"),
      " 배지가 붙은 슬랩은 지금 센터 보관함에 들어가 있어요. 전시 슬랩은 ",
      h("b", null, "야생 · 선물 · 도감 박제 · 펫 등록"),
      "에 사용할 수 없고, 직접 꺼내거나 부서지기 전까지 잠겨 있어요."
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
      "내 PCL 슬랩을 전시하는 ",
      h("b", null, "6×6 그리드"),
      "의 포켓몬센터예요. ",
      h("b", { className: "text-amber-300" }, "PCL 9·10"),
      " 슬랩만 전시 가능. 빈 자리를 누르면 보관함 상점이 열리고, 우측 상단 ",
      h("b", null, "🔗 초대 링크 복사"),
      "로 친구를 부를 수 있어요."
    ),
  },
  {
    heading: "보관함 4종 (1슬롯 / 1슬랩)",
    icon: "🪵",
    body: h(
      "div",
      null,
      "가격이 비쌀수록 부수기 방어율이 올라가요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          "🪵 ",
          h("b", null, "기본"),
          " · ",
          h("b", null, "10,000p"),
          " · 방어 ",
          h("b", { className: "text-emerald-300" }, "3%")
        ),
        h(
          "li",
          { key: 2 },
          "🔷 ",
          h("b", null, "유리"),
          " · ",
          h("b", null, "100,000p"),
          " · 방어 ",
          h("b", { className: "text-emerald-300" }, "5%")
        ),
        h(
          "li",
          { key: 3 },
          "💠 ",
          h("b", null, "프리미엄"),
          " · ",
          h("b", null, "300,000p"),
          " · 방어 ",
          h("b", { className: "text-emerald-300" }, "10%")
        ),
        h(
          "li",
          { key: 4 },
          "👑 ",
          h("b", null, "레전더리"),
          " · ",
          h("b", { className: "text-amber-300" }, "1,000,000p"),
          " · 방어 ",
          h("b", { className: "text-emerald-300" }, "15%")
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "보관함 치우기는 환불 없음. 안에 든 슬랩만 지갑으로 돌아와요."
      )
    ),
  },
  {
    heading: "전시 수익 (30분당)",
    icon: "💰",
    body: h(
      "div",
      null,
      h("b", null, "PCL 9·10"),
      " 슬랩만 ",
      h("b", null, "30분"),
      "마다 거래 포인트와 랭킹 점수(거래 포인트의 ",
      h("b", null, "1/1200"),
      ")를 자동 적립. 센터 페이지에 들를 때마다 자동 정산.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "MUR PCL 10"),
          " · ",
          h("b", null, "600,000p"),
          " / 30분 · 랭킹 ",
          h("b", null, "+500")
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-fuchsia-300" }, "UR PCL 10"),
          " · ",
          h("b", null, "360,000p"),
          " · 랭킹 ",
          h("b", null, "+300")
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-rose-300" }, "SAR PCL 10"),
          " · ",
          h("b", null, "240,000p"),
          " · 랭킹 ",
          h("b", null, "+200")
        ),
        h(
          "li",
          { key: 4 },
          h("b", { className: "text-sky-300" }, "MA PCL 10"),
          " · ",
          h("b", null, "180,000p"),
          " · 랭킹 ",
          h("b", null, "+150")
        ),
        h(
          "li",
          { key: 5 },
          h("b", { className: "text-emerald-300" }, "SR PCL 10"),
          " · ",
          h("b", null, "120,000p"),
          " · 랭킹 ",
          h("b", null, "+100")
        ),
        h(
          "li",
          { key: 6 },
          h("b", { className: "text-fuchsia-200" }, "AR PCL 10"),
          " · ",
          h("b", null, "80,000p"),
          " · 랭킹 ",
          h("b", null, "+66")
        ),
        h(
          "li",
          { key: 7 },
          h("b", { className: "text-indigo-200" }, "RR PCL 10"),
          " · ",
          h("b", null, "50,000p"),
          " · 랭킹 ",
          h("b", null, "+41")
        ),
        h(
          "li",
          { key: 8 },
          h("b", { className: "text-sky-200" }, "R PCL 10"),
          " · ",
          h("b", null, "30,000p"),
          " · 랭킹 ",
          h("b", null, "+25")
        ),
        h(
          "li",
          { key: 9 },
          h("b", { className: "text-emerald-200" }, "U PCL 10"),
          " · ",
          h("b", null, "20,000p"),
          " · 랭킹 ",
          h("b", null, "+16")
        ),
        h(
          "li",
          { key: 10 },
          h("b", { className: "text-zinc-200" }, "C PCL 10"),
          " · ",
          h("b", null, "15,000p"),
          " · 랭킹 ",
          h("b", null, "+12")
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "PCL 9 = PCL 10의 약 50%. 전시는 PCL 9·10 만 가능."
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
          h("b", { className: "text-emerald-300" }, "실패"),
          "할 때마다 랭킹 ",
          h("b", null, "+150점")
        ),
        h(
          "li",
          { key: 2 },
          "결과와 무관하게 ",
          h("b", { className: "text-amber-300" }, "공격 비용의 50%"),
          "가 즉시 내 지갑으로 들어와요"
        ),
        h(
          "li",
          { key: 3 },
          "성공하면 보관함과 슬랩이 ",
          h("b", { className: "text-rose-300" }, "영구 삭제"),
          "되고 공격자가 ",
          h("b", null, "보관함가 80%"),
          "를 가져가요"
        ),
        h(
          "li",
          { key: 4 },
          "📜 ",
          h("b", null, "방문 기록"),
          " 버튼으로 누가 시도했는지 확인 가능"
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
      h("b", { className: "text-amber-300" }, "PCL 9·10"),
      " 슬랩만 전시 가능. PCL 6~8 슬랩은 보관만 되고 전시 슬롯에는 들어가지 않아요. 전시 중인 슬랩은 ",
      h(
        Link,
        { href: "/wallet?tab=pcl", className: "underline text-amber-300" },
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
    body: "다른 유저의 포켓몬센터를 둘러보는 페이지예요. 전시된 슬랩을 감상하거나, 비싼 보관함을 부수러 시도하거나, 펫·전투력·전시 수익 정보를 확인할 수 있어요. 자기 자신의 센터는 부술 수 없어요.",
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
        h(
          "li",
          { key: 1 },
          "🪵 기본 · ",
          h("b", null, "1,000p"),
          " · 방어 3% → 성공률 ",
          h("b", { className: "text-rose-300" }, "27%")
        ),
        h(
          "li",
          { key: 2 },
          "🔷 유리 · ",
          h("b", null, "10,000p"),
          " · 방어 5% → 성공률 ",
          h("b", { className: "text-rose-300" }, "25%")
        ),
        h(
          "li",
          { key: 3 },
          "💠 프리미엄 · ",
          h("b", null, "30,000p"),
          " · 방어 10% → 성공률 ",
          h("b", { className: "text-rose-300" }, "20%")
        ),
        h(
          "li",
          { key: 4 },
          "👑 레전더리 · ",
          h("b", null, "100,000p"),
          " · 방어 15% → 성공률 ",
          h("b", { className: "text-rose-300" }, "15%")
        )
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
        h("b", { className: "text-amber-300" }, "보관함가 80%"),
        " 전리품 + 랭킹 ",
        h("b", null, "+1,000점"),
        " (PCL 10 파괴) 또는 ",
        h("b", null, "+500점"),
        " (그 외)"
      ),
      h(
        "li",
        { key: 2 },
        h("b", { className: "text-emerald-300" }, "실패"),
        " → 비용 환불 없음. 주인은 랭킹 ",
        h("b", null, "+150점")
      ),
      h(
        "li",
        { key: 3 },
        "주인은 결과와 무관하게 비용의 ",
        h("b", { className: "text-amber-300" }, "50%"),
        " 자동 적립"
      ),
      h(
        "li",
        { key: 4 },
        "모든 시도는 ",
        h("b", null, "디스코드"),
        "에 자동 공지"
      )
    ),
  },
  {
    heading: "센터 정보 패널",
    icon: "📊",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", null, "펫 점수"),
        " · 펫 PCL 10 슬랩 합산 (최대 ",
        h("b", { className: "text-fuchsia-300" }, "1,000"),
        ")"
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "전투력"),
        " · 전시 슬랩 + 도감 + 펫 합산"
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "30분당 거래 / 랭킹"),
        " · 전시 수익과 30분당 적립 랭킹 점수"
      )
    ),
  },
  {
    heading: "전략",
    icon: "💡",
    body: h(
      "div",
      null,
      "비싼 보관함일수록 슬랩 가치가 크지만 비용도 크고 방어율이 높아 성공률이 낮아요. 한 번 깨지면 PCL 10 슬랩까지 영구 소멸하니 신중하게. 부수기 외에 ",
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
      " (C ~ MUR) 카드를 PCL 슬랩으로 감별할 수 있어요. 슬랩은 일반 카드보다 가치가 훨씬 높고, ",
      h("b", null, "센터 전시 · 야생 · 도감 · 펫"),
      "의 핵심 자원이에요."
    ),
  },
  {
    heading: "확률",
    icon: "🎲",
    body: h(
      "div",
      null,
      h(
        "ul",
        null,
        h(
          "li",
          { key: 1 },
          "실패 (카드 소실) · ",
          h("b", { className: "text-rose-300" }, "70%")
        ),
        h("li", { key: 2 }, "PCL 6 (EX-MT) · ", h("b", null, "8%")),
        h("li", { key: 3 }, "PCL 7 (NEAR MINT) · ", h("b", null, "10%")),
        h("li", { key: 4 }, "PCL 8 (NM-MT) · ", h("b", null, "8%")),
        h(
          "li",
          { key: 5 },
          h("b", { className: "text-slate-100" }, "PCL 9 (MINT)"),
          " · ",
          h("b", null, "3.7%"),
          " (MUR 카드: 3.9%)"
        ),
        h(
          "li",
          { key: 6 },
          h("b", { className: "text-amber-300" }, "PCL 10 (GEM MINT)"),
          " · ",
          h("b", null, "0.3%"),
          " · ",
          h("b", { className: "text-rose-300" }, "MUR 카드는 0.1%")
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "MUR 만 PCL 10 확률이 1/3 (희소성). 나머지 등급은 동일."
      )
    ),
  },
  {
    heading: "성공 시 보상",
    icon: "🪙",
    body: h(
      "div",
      null,
      "감별 자체에는 ",
      h("b", null, "보너스 포인트가 지급되지 않아요"),
      ". 슬랩의 가치는 ",
      h("b", null, "전시 수익"),
      " · ",
      h("b", null, "야생 보상"),
      " · ",
      h("b", null, "도감/펫 점수"),
      "에서 발생합니다.",
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "일괄 감별의 자동 삭제 옵션을 켜면 낮은 등급은 슬랩 발급 없이 즉시 폐기됩니다."
      )
    ),
  },
  {
    heading: "랭킹 점수",
    icon: "🏆",
    body: h(
      "div",
      null,
      h("b", null, "감별 자체에는 랭킹 점수가 없어요"),
      ". 랭킹은 ",
      h("b", null, "야생 승리"),
      " · ",
      h("b", null, "센터 전시 자동 적립"),
      " · ",
      h("b", null, "부수기 / 방어"),
      "에서만 누적돼요. PCL 10 슬랩이라도 ",
      h("b", null, "도감 박제"),
      "하거나 ",
      h("b", null, "펫 등록"),
      "해야 영구 점수화됩니다."
    ),
  },
  {
    heading: "📚 일괄 감별",
    icon: "📚",
    body: h(
      "div",
      null,
      "여러 장을 한 번에 감별. ",
      h("b", null, "한 번 최대 5,000장"),
      "까지 (그 이상은 나눠서 의뢰). ",
      h("b", null, "“PCL N 미만 자동 삭제”"),
      " (7·8·9·10 미만 선택) 옵션을 켜면 낮은 등급은 슬랩으로 만들지 않고 즉시 폐기돼요. 슬랩 한도 ",
      h("b", null, "50,000장"),
      "에 가까울 때 유용."
    ),
  },
  {
    heading: "한도와 주의",
    icon: "⚠️",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        "PCL 슬랩 보유 한도 ",
        h("b", null, "50,000장")
      ),
      h(
        "li",
        { key: 2 },
        "감별한 카드는 결과와 무관하게 지갑에서 사라져요"
      ),
      h(
        "li",
        { key: 3 },
        "슬랩은 ",
        h("b", null, "야생 패배 · 부수기 성공 · 도감 박제"),
        " 시 영구 삭제"
      ),
      h(
        "li",
        { key: 4 },
        "감별 결과는 ",
        h("b", null, "디스코드"),
        "에 자동 공지"
      )
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
      "상단 탭에서 세 가지 모드를 전환. 각 행을 누르면 펼쳐져 전투력·펫·도감·PCL 10 통계가 보여요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "🏆 랭킹 점수"),
          " · 야생/전시/부수기로 누적되는 시즌 점수"
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-rose-300" }, "⚔️ 전투력"),
          " · 지금 전시된 슬랩 + 도감 + 펫 합산"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-fuchsia-300" }, "🐾 펫 랭킹"),
          " · 프로필 펫 (최대 10장) 점수 합산"
        )
      )
    ),
  },
  {
    heading: "랭킹 점수 산정",
    icon: "📈",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        h("b", { className: "text-sky-300" }, "야생 승리"),
        " · ",
        h("b", null, "+100점")
      ),
      h(
        "li",
        { key: 2 },
        h("b", { className: "text-violet-300" }, "센터 전시 자동 적립"),
        " · 30분당 거래 포인트의 ",
        h("b", null, "1/1200"),
        " (MUR PCL 10 = 30분당 +500점)"
      ),
      h(
        "li",
        { key: 3 },
        h("b", { className: "text-rose-300" }, "남의 보관함 부수기 성공"),
        " · PCL 10 파괴 ",
        h("b", null, "+1,000점"),
        " / 그 외 ",
        h("b", null, "+500점")
      ),
      h(
        "li",
        { key: 4 },
        h("b", { className: "text-emerald-300" }, "내 보관함 부수기 방어"),
        " · 상대 실패마다 ",
        h("b", null, "+150점")
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
        "+ ",
        h("b", null, "도감 보너스"),
        " (희귀도별 정액 + 희귀도 완전 컬렉션) + ",
        h("b", null, "펫 점수"),
        " 도 합산. PCL 6~8 슬랩은 전투력 0."
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
      h("b", null, "PCL 10 슬랩"),
      "을 최대 ",
      h("b", null, "10장"),
      "까지 펫 등록 (같은 카드 중복 불가). 한 장당:",
      h(
        "p",
        { className: "mt-1" },
        "MUR ",
        h("b", { className: "text-amber-300" }, "100"),
        " · UR ",
        h("b", null, "80"),
        " · SAR ",
        h("b", null, "70"),
        " · SR ",
        h("b", null, "60"),
        " · AR ",
        h("b", null, "50"),
        " · MA ",
        h("b", null, "40"),
        " · RR ",
        h("b", null, "30"),
        " · R ",
        h("b", null, "20"),
        " · U ",
        h("b", null, "10"),
        " · C ",
        h("b", null, "10")
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "MUR PCL 10 10장 = ",
        h("b", { className: "text-fuchsia-300" }, "최대 1,000점"),
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
      " 버튼으로 상대 보관함을 부수러 가고, ",
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
      "1세대 관동 지방 캐릭터 6명 중 한 명을 트레이너로 선택. 도트 모션으로 움직여요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-rose-300" }, "지우"),
          " · 만년 10살 주인공"
        ),
        h(
          "li",
          { key: 2 },
          h("b", { className: "text-cyan-300" }, "이슬"),
          " · 푸른시티 체육관 관장"
        ),
        h(
          "li",
          { key: 3 },
          h("b", { className: "text-amber-300" }, "웅"),
          " · 회색시티 체육관 관장"
        ),
        h(
          "li",
          { key: 4 },
          h("b", { className: "text-zinc-200" }, "오박사"),
          " · 태초마을 박사"
        ),
        h(
          "li",
          { key: 5 },
          h("b", { className: "text-emerald-300" }, "그린"),
          " · 라이벌"
        ),
        h(
          "li",
          { key: 6 },
          h("b", { className: "text-rose-400" }, "목호"),
          " · 사천왕 챔피언"
        )
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
        "랭킹·선물·조롱 등 닉네임이 표시되는 모든 곳에 즉시 반영. 로그인 아이디는 바뀌지 않아요."
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
      "까지 메인 카드(펫)로 등록할 수 있어요. 슬롯을 누르면 등록 가능한 슬랩 목록이 떠요. 등록·해제 모두 즉시 반영.",
      h(
        "p",
        { className: "mt-2 text-zinc-400" },
        "전시 중인 슬랩과 ",
        h("b", null, "같은 카드(card_id) 중복"),
        "은 펫으로 등록 불가. 야생 출전도 차단돼서 펫 슬랩이 파괴되지 않아요."
      )
    ),
  },
  {
    heading: "PCL 10 한정",
    icon: "💎",
    body: h(
      "div",
      null,
      "펫 슬랩은 ",
      h("b", { className: "text-amber-300" }, "PCL 10 GEM MINT"),
      " 한정. PCL 9 이하는 펫이 될 수 없어요. ",
      h(
        Link,
        { href: "/grading", className: "underline text-amber-300" },
        "감별"
      ),
      "을 더 도전해 보세요."
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
        { className: "mt-1.5 grid grid-cols-2 gap-x-3" },
        h("li", { key: 1 }, h("b", { className: "text-amber-300" }, "MUR"), " · 100점"),
        h("li", { key: 2 }, h("b", null, "UR"), " · 80점"),
        h("li", { key: 3 }, h("b", null, "SAR"), " · 70점"),
        h("li", { key: 4 }, h("b", null, "SR"), " · 60점"),
        h("li", { key: 5 }, h("b", null, "AR"), " · 50점"),
        h("li", { key: 6 }, h("b", null, "MA"), " · 40점"),
        h("li", { key: 7 }, h("b", null, "RR"), " · 30점"),
        h("li", { key: 8 }, h("b", null, "R"), " · 20점"),
        h("li", { key: 9 }, h("b", null, "U / C"), " · 10점")
      ),
      h(
        "p",
        { className: "mt-2 text-zinc-400" },
        "MUR PCL 10 10장 등록 시 ",
        h("b", { className: "text-white" }, "최대 1,000점"),
        ". 펫 점수는 ",
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
      " (그레이드 ",
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
        " · 슬랩이 내 PCL 지갑으로 이전. 가격이 0p가 아니면 그만큼 차감"
      ),
      h(
        "li",
        { key: 2 },
        h("b", { className: "text-rose-300" }, "거절"),
        " · 슬랩은 보낸 사람에게 그대로"
      ),
      h(
        "li",
        { key: 3 },
        h("b", null, "방치"),
        " · ",
        h("b", null, "24시간"),
        " 뒤 자동 만료, 슬랩은 보낸 사람 지갑에 그대로"
      )
    ),
  },
  {
    heading: "보내는 쪽 (보낸 선물)",
    icon: "📤",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        "하루 ",
        h("b", { className: "text-amber-300" }, "5회"),
        " 한도 (24시간 슬라이딩)"
      ),
      h(
        "li",
        { key: 2 },
        h("b", null, "전시 중"),
        " 슬랩, 다른 선물에 묶인 슬랩은 못 보내요"
      ),
      h("li", { key: 3 }, "받는 사람을 닉네임으로 검색해 선택"),
      h(
        "li",
        { key: 4 },
        "가격을 ",
        h("b", null, "0p"),
        "로 두면 무료 선물"
      ),
      h("li", { key: 5 }, "140자 메시지 첨부 가능"),
      h(
        "li",
        { key: 6 },
        "수락 전이라면 ",
        h("b", null, "회수"),
        " 가능"
      )
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
        { href: "/wallet?tab=pcl", className: "underline text-amber-300" },
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
    body: "본인에게는 못 보내요. 만료·거절된 선물의 슬랩은 자동으로 보낸 사람에게 그대로 남아요. 받는 쪽이 PCL 한도(50,000장)에 차 있으면 수락이 거부돼요.",
  },
];

const WILD_SECTIONS: HelpSection[] = [
  {
    heading: "야생 배틀이란",
    icon: "🌿",
    body: h(
      "div",
      null,
      "내 PCL 슬랩 한 장으로 야생 포켓몬과 1:1 턴제 배틀. 이기면 ",
      h("b", { className: "text-amber-300" }, "+20,000p"),
      " · 랭킹 ",
      h("b", { className: "text-amber-300" }, "+100점"),
      ", ",
      h("b", { className: "text-rose-300" }, "지면 그 슬랩은 영구 삭제"),
      ". 전시 중 슬랩과 펫 등록 슬랩은 출전 불가."
    ),
  },
  {
    heading: "스탯 계산",
    icon: "📊",
    body: h(
      "div",
      null,
      "내 슬랩 HP/ATK = ",
      h("b", null, "희귀도 베이스 × PCL 등급 배수"),
      ".",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          "베이스 · C ",
          h("b", null, "30 / 8"),
          " ↗ MUR ",
          h("b", null, "95 / 24"),
          " (HP / ATK)"
        ),
        h(
          "li",
          { key: 2 },
          "PCL 배수 · 6 ×1.0 / 7 ×1.1 / 8 ×1.3 / 9 ×1.6 / 10 ",
          h("b", { className: "text-amber-300" }, "×2.0")
        ),
        h(
          "li",
          { key: 3 },
          "야생 포켓몬은 추가로 HP·ATK ",
          h("b", { className: "text-rose-300" }, "×1.8"),
          " 보정"
        )
      ),
      h(
        "p",
        { className: "mt-1.5 text-zinc-400" },
        "MUR PCL 10 슬랩 = HP 190 / ATK 48 (최강)."
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
        " · ",
        h("b", null, "+20,000p"),
        " · 랭킹 ",
        h("b", null, "+100점")
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
    body: "1세대 중심으로 36종이 등장. 미뇽·뮤츠·라프라스 같은 강적부터 피카츄·이상해씨·꼬렛 같은 친숙한 얼굴까지 매번 다른 만남. 모든 18가지 타입이 골고루 섞여 있어요.",
  },
  {
    heading: "배틀 무대",
    icon: "🏞️",
    body: "매 조우마다 풀숲·동굴·해변·화산·설산·밤의 숲·고대 유적·체육관·배틀 스타디움·도시 거리·항구·사원·화산 분화구·우주 정거장·폭포·꽃밭·사막·번개 평원 등 19곳의 무대가 무작위로 펼쳐져요.",
  },
  {
    heading: "전략 팁",
    icon: "💡",
    body: h(
      "ul",
      null,
      h(
        "li",
        { key: 1 },
        "야생 타입을 먼저 보고 상성 좋은 슬랩을 골라요"
      ),
      h(
        "li",
        { key: 2 },
        "PCL 6·7 슬랩은 전시 점수에 들어가지 않으니 야생 출전 후보로 좋아요"
      ),
      h(
        "li",
        { key: 3 },
        "PCL 10 · MUR 슬랩은 ",
        h("b", null, "센터 전시"),
        " · ",
        h("b", null, "도감 박제"),
        " · ",
        h("b", null, "펫"),
        "으로 보존하는 게 보통 이득"
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
      "한국어판 ",
      h("b", null, "10세트 "),
      `${(
        RARITY_TOTALS.MUR +
        RARITY_TOTALS.UR +
        RARITY_TOTALS.SAR +
        RARITY_TOTALS.MA +
        RARITY_TOTALS.SR +
        RARITY_TOTALS.AR +
        RARITY_TOTALS.RR +
        RARITY_TOTALS.R +
        RARITY_TOTALS.U +
        RARITY_TOTALS.C
      ).toLocaleString("ko-KR")}장`,
      "을 한 자리에 모아 보는 도감이에요. 미등록 카드는 어둡게 보여요. 한 번 등록한 카드는 다시 등록할 수 없고, 그 슬랩은 카드지갑에서 영구 삭제돼요."
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
        h("b", { className: "text-amber-300" }, "PCL 10"),
        " 슬랩만 등록 가능 (전시 중인 슬랩은 불가)"
      ),
      h("li", { key: 2 }, "같은 카드 (card_id) 는 한 번만 등록"),
      h(
        "li",
        { key: 3 },
        "등록된 슬랩은 카드지갑에서 ",
        h("b", { className: "text-rose-300" }, "영구 삭제"),
        " — 다시 꺼낼 수 없어요"
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
      " 버튼을 누르면 보유 중인 모든 PCL 10 슬랩 (전시 중이 아니고 도감에 없는 카드) 이 한 번에 등록되고, 해당 슬랩은 카드지갑에서 영구 삭제돼요."
    ),
  },
  {
    heading: "도감 등록 보너스 (전투력)",
    icon: "⚡",
    body: h(
      "div",
      null,
      "도감에 등록한 카드 ",
      h("b", null, "한 장당 희귀도별 정액"),
      "이 ",
      h("b", null, "센터 전투력"),
      "에 합산돼요.",
      h(
        "ul",
        { className: "mt-1.5 grid grid-cols-2 gap-x-3" },
        h(
          "li",
          { key: 1 },
          h("b", { className: "text-amber-300" }, "MUR"),
          " · +1,000"
        ),
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
    heading: "도감 세트효과 (희귀도 완전 컬렉션)",
    icon: "✨",
    body: h(
      "div",
      null,
      "한 희귀도의 모든 카드를 도감에 박제하면 추가 ",
      h("b", null, "전투력 보너스"),
      "가 영구 적용.",
      h(
        "ul",
        { className: "mt-1.5" },
        ...RARITY_ORDER.map((r) =>
          h(
            "li",
            { key: r },
            h("b", null, r),
            ` (${RARITY_TOTALS[r].toLocaleString("ko-KR")}장) → +${RARITY_COMPLETION_BONUS[
              r
            ].toLocaleString("ko-KR")}`
          )
        )
      )
    ),
  },
  {
    heading: "책 넘기기",
    icon: "📖",
    body: "한 페이지에 24장. 희귀도 탭을 누르면 그 희귀도만 보이고, 좌우 화살표로 페이지를 넘기면 3D 페이지 플립 애니메이션이 재생돼요.",
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
      "이 나오고, 각 팩에 ",
      h("b", null, "5장"),
      " (박스당 ",
      h("b", null, "25장"),
      "). 슬롯별로 등급 가중치가 달라 마지막 슬롯은 보통 RR/AR/SR 이상 보장이에요."
    ),
  },
  {
    heading: "박스 가격",
    icon: "🪙",
    body: h(
      "ul",
      { className: "grid grid-cols-2 gap-x-3" },
      h("li", { key: 1 }, h("b", null, "m4"), " · 50,000p"),
      h("li", { key: 2 }, h("b", null, "m3"), " · 50,000p"),
      h("li", { key: 3 }, h("b", null, "m2a"), " · 50,000p"),
      h("li", { key: 4 }, h("b", null, "m1l"), " · 45,000p"),
      h("li", { key: 5 }, h("b", null, "m1s"), " · 45,000p"),
      h("li", { key: 6 }, h("b", null, "m2"), " · 40,000p"),
      h("li", { key: 7 }, h("b", null, "sv8a"), " · 40,000p"),
      h("li", { key: 8 }, h("b", null, "sv2a"), " · 35,000p"),
      h("li", { key: 9 }, h("b", null, "sv10"), " · 35,000p"),
      h("li", { key: 10 }, h("b", null, "sv8"), " · 30,000p"),
      h("li", { key: 11 }, h("b", null, "sv5a"), " · 30,000p")
    ),
  },
  {
    heading: "자동 판매 등급",
    icon: "💸",
    body: h(
      "div",
      null,
      "MUR 외 ",
      h("b", null, "C · U · R · RR · MA · AR · SR · SAR · UR"),
      " 중 원하는 등급을 칩으로 골라 두면, 박스 개봉 시 그 등급은 지갑에 들어오지 않고 일괄 판매 단가로 즉시 환산돼요. ",
      h("b", null, "추천 (AR 이하)"),
      " 버튼은 C·U·R·RR·MA·AR을 한 번에 켜요.",
      h(
        "ul",
        { className: "mt-1.5" },
        h(
          "li",
          { key: 1 },
          "지갑 한도(",
          h("b", null, "100,000장"),
          ")에 잘 안 닿게 해줘요"
        ),
        h(
          "li",
          { key: 2 },
          "한 박스 / 여러 박스 ",
          h("b", null, "한 번에 모두 적용")
        ),
        h(
          "li",
          { key: 3 },
          h("b", null, "MUR"),
          "은 자동 판매 후보에서 항상 제외 (chase 카드 보호)"
        )
      )
    ),
  },
  {
    heading: "여러 박스 한 번에",
    icon: "🚀",
    body: "3 / 5 / 10 박스를 한 번에 자동 개봉할 수 있어요. 결과 화면에 모든 카드와 자동 판매 수익이 합산돼서 표시. 한 박스라도 저장에 실패하면 그 박스 비용만 환불, 그 전까지 깐 박스는 정상 저장돼요.",
  },
  {
    heading: "지갑이 가득 찰 때",
    icon: "💼",
    body: h(
      "div",
      null,
      "일반 카드 ",
      h("b", null, "100,000장"),
      "을 넘기면 박스가 거부되고 비용이 자동 환불돼요. 박스 자동 판매 옵션을 켜거나 ",
      h(
        Link,
        { href: "/grading", className: "underline text-amber-300" },
        "감별"
      ),
      "의 자동 삭제로 잡카드를 정리한 뒤 다시 시도하세요."
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
        " (C ~ MUR) 을 ",
        h(
          Link,
          { href: "/grading", className: "underline text-amber-300" },
          "감별"
        ),
        "할 수 있어요 — 잡카드도 PCL 10이 터지면 ",
        h("b", { className: "text-amber-300" }, "전시·도감·펫"),
        "에 쓸 수 있어요"
      ),
      h(
        "li",
        { key: 2 },
        "감별 실패 시 카드 소실 ",
        h("b", { className: "text-rose-300" }, "70%"),
        " — 신중히"
      ),
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

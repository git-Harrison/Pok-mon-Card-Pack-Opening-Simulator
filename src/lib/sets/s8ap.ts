import type { SetInfo } from "../types";

// S8a-P — 25주년 기념 컬렉션 박스 (Celebrations 한국 정발 박스 형태).
// 일본 25th Anniversary Collection 2021-10-22 발매. 한국 정발 2022-02 추정.
// 25주년 기념 카드 + 클래식 카드 리프린트 ~25장 + 스페셜 + 프로모.
// V/VMAX → RR, 골드/HR → UR 매핑.
// TODO(recon), TODO(images): s4a 와 동일.
// 주의: 컬렉션 박스 특성상 일반 부스터 팩과 슬롯 구조가 다를 수 있음 — recon 후 slots 재조정 필요할 수 있음.

export const s8ap: SetInfo = {
  code: "s8ap",
  name: "25주년 기념 컬렉션 박스",
  subtitle: "기념 박스 · 25TH ANNIVERSARY COLLECTION",
  releaseDate: "2022-02-25",
  cardsPerPack: 5,
  packsPerBox: 30,
  totalCards: 30,
  primaryColor: "#facc15", // 25주년 골드
  accentColor: "#fef08a",
  boxImage: "/images/sets/s8ap/box.webp",
  packImage: "/images/sets/s8ap/box.webp", // TODO(images)
  slots: [
    // TODO(recon): 25주년 박스는 고정 슬롯 구성일 수 있어 재조정 필요.
    { label: "C 1", weights: { C: 100 } },
    { label: "C 2", weights: { C: 100 } },
    { label: "C/U", weights: { C: 55, U: 45 } },
    { label: "U/R", weights: { U: 65, R: 35 } },
    { label: "Hit", weights: { R: 30, RR: 30, AR: 10, SR: 7, SAR: 5, UR: 0.5 } },
  ],
  cards: [
    { id: "s8ap-001", setCode: "s8ap", number: "001", name: "피카츄", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Pikachu.S8A.1.39585.png" },
    { id: "s8ap-002", setCode: "s8ap", number: "002", name: "뮤", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Mew.S8A.2.39422.png" },
    { id: "s8ap-003", setCode: "s8ap", number: "003", name: "박사의 연구", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Professorss-Research.S8A.3.39863.png" },
    { id: "s8ap-004", setCode: "s8ap", number: "004", name: "칠색조", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Ho-Oh.S8A.4.40609.png" },
    { id: "s8ap-005", setCode: "s8ap", number: "005", name: "루기아", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Lugia.S8A.5.40075.png" },
    { id: "s8ap-006", setCode: "s8ap", number: "006", name: "그란돈", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Groudon.S8A.6.40351.png" },
    { id: "s8ap-007", setCode: "s8ap", number: "007", name: "가이오가", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Kyogre.S8A.7.40610.png" },
    { id: "s8ap-008", setCode: "s8ap", number: "008", name: "디아루가", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Dialga.S8A.8.40364.png" },
    { id: "s8ap-009", setCode: "s8ap", number: "009", name: "펄기아", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Palkia.S8A.9.40611.png" },
    { id: "s8ap-010", setCode: "s8ap", number: "010", name: "레시라무", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Reshiram.S8A.10.40612.png" },
    { id: "s8ap-011", setCode: "s8ap", number: "011", name: "제크로무", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Zekrom.S8A.11.40613.png" },
    { id: "s8ap-012", setCode: "s8ap", number: "012", name: "제르네아스", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Xerneas.S8A.12.40514.png" },
    { id: "s8ap-013", setCode: "s8ap", number: "013", name: "이벨타르", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Yveltal.S8A.13.40614.png" },
    { id: "s8ap-014", setCode: "s8ap", number: "014", name: "코스모그", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Cosmog.S8A.14.40511.png" },
    { id: "s8ap-015", setCode: "s8ap", number: "015", name: "코스모움", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Cosmoem.S8A.15.40510.png" },
    { id: "s8ap-016", setCode: "s8ap", number: "016", name: "솔가레오", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Solgaleo.S8A.16.40615.png" },
    { id: "s8ap-017", setCode: "s8ap", number: "017", name: "루나아라", rarity: "R", imageUrl: "https://den-cards.pokellector.com/327/Lunala.S8A.17.40353.png" },
    { id: "s8ap-018", setCode: "s8ap", number: "018", name: "자시안V", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Zacian-V.S8A.18.40517.png" },
    { id: "s8ap-019", setCode: "s8ap", number: "019", name: "자마젠타V", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Zamazenta-V.S8A.19.40616.png" },
    { id: "s8ap-020", setCode: "s8ap", number: "020", name: "피카츄V", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Pikachu-V.S8A.20.39591.png" },
    { id: "s8ap-021", setCode: "s8ap", number: "021", name: "파도타기 피카츄V", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Pikachu.S8A.21.39586.png" },
    { id: "s8ap-022", setCode: "s8ap", number: "022", name: "파도타기 피카츄VMAX", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Surfing-Pikachu-VMAX.S8A.22.39588.png" },
    { id: "s8ap-023", setCode: "s8ap", number: "023", name: "공중날기 피카츄V", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Flying-Pikachu-V.S8A.23.39587.png" },
    { id: "s8ap-024", setCode: "s8ap", number: "024", name: "공중날기 피카츄VMAX", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Flying-Pikachu-VMAX.S8A.24.39589.png" },
    { id: "s8ap-025", setCode: "s8ap", number: "025", name: "피카츄V-UNION (좌상)", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Pikachu-V-UNION.S8A.25.40617.png" },
    { id: "s8ap-026", setCode: "s8ap", number: "026", name: "피카츄V-UNION (우상)", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Pikachu-V-UNION.S8A.26.40618.png" },
    { id: "s8ap-027", setCode: "s8ap", number: "027", name: "피카츄V-UNION (좌하)", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Pikachu-V-UNION.S8A.27.40619.png" },
    { id: "s8ap-028", setCode: "s8ap", number: "028", name: "피카츄V-UNION (우하)", rarity: "RR", imageUrl: "https://den-cards.pokellector.com/327/Pikachu-V-UNION.S8A.28.40620.png" },
    { id: "s8ap-029", setCode: "s8ap", number: "029", name: "박사의 연구", rarity: "SR", imageUrl: "https://den-cards.pokellector.com/327/Professors-Research.S8A.29.40666.png" },
    { id: "s8ap-030", setCode: "s8ap", number: "030", name: "뮤", rarity: "UR", imageUrl: "https://den-cards.pokellector.com/327/Mew.S8A.30.40665.png" },
  ],
};

# 신규 4세트 데이터 가용성 정찰 보고서

작성일: 2026-04-24
대상 프로젝트: `pokemon-tcg-sim`
정찰 대상: 사용자 지정 4개 신규 세트 (니힐제로 / 로켓단의 영광 / 메가브레이(브) / 메가심포니아)

---

## 요약 표

| # | 사용자 지정명 | 일본 코드 | 한국 발매 | 카드 수 | 가용성 |
| - | ------------- | --------- | --------- | ------- | ------ |
| 1 | 니힐제로 | M3 | 2026-03-13 (정발) | 117 (80+37) | 🟢 |
| 2 | 로켓단의 영광 | SV10 | 2025-06-20 (정발) | 132 (98+34) | 🟢 |
| 3 | 메가브레이 → **메가브레이브** | M1L | 2025-09-26 (정발) | 92 (63+29) | 🟢 |
| 4 | 메가심포니아 | M1S | 2025-09-26 (정발) | 92 (63+29) | 🟢 |

> ⚠️ **사용자 추정 정정 사항**
> - "메가브레이" → 실제 정식명은 **메가브레이브** (Mega Brave). 사용자 표기 오타로 판단.
> - "메가브레이 = M3 신작" / "메가심포니아 = M3a 신작" → 실제로는 **둘 다 M1 페어 (M1L / M1S, 2025년 8월 일본 발매)**. M3 는 니힐제로.
> - "니힐제로 = SV9 또는 신작" → 실제로는 **MEGA 시리즈 M3** (2026-01-23 일본 / 2026-03-13 한국).
> - "로켓단의 영광 = SV10 / Battle Partners" → SV10 은 맞지만, **Battle Partners 는 SV9 의 영문/한국명 (전투 파트너즈)** 으로 별개 세트. 로켓단의 영광 은 SV10 단독. 영문판은 SV9 + SV10 일부를 묶어 "Destined Rivals" 로 발매.

---

## 1. 니힐제로 (Nihil Zero / Munikis Zero / Nullifying Zero)

- **공식 코드**: `M3` (일본) / 한국 정발판도 동일 시리즈 코드
- **발매일**:
  - 일본: 2026-01-23
  - 한국: 2026-03-13 (정식 발매), 2026-03-07 포켓몬 카드샵 선행
- **카드 총 수**: 117장 (메인 80장 + 시크릿 37장)
- **Pokellector 폴더 ID**: `428` — slug `Munikis-Zero-Expansion`
  - 카드 이미지 URL 패턴: `https://den-cards.pokellector.com/428/<slug>.M3.<num>.<id>.png`
  - 세트 페이지: `https://jp.pokellector.com/Munikis-Zero-Expansion/`
  - (영문판 사이트는 "Munikis Zero" 표기 사용)
- **한국 정식 발매**: ✅ 예
  - 한국 공식 페이지: https://pokemoncard.co.kr/card/869
- **신뢰 가능한 영문 카드 리스트**:
  - PokeGuardian (메인): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2914213_m3-nihil-zero-main-set-list
  - PokeGuardian (시크릿/SR/AR/SAR/MUR): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2916284_m3-nihil-zero-all-sr-ar-sar-mur-cards
  - Serebii: https://www.serebii.net/card/nihilzero/
  - PokéCardex: https://www.pokecardex.com/en/series/jp/M3
  - TCG Collector (Nullifying Zero, 영문 일본 세트 인덱스): https://www.tcgcollector.com/sets/11684/nullifying-zero
  - KrystalKollectz (한국명 매칭): https://krystalkollectz.com/blogs/news/munikis-zero-pokemon-card-list-korean-perfect-order
- **자료 가용성**: 🟢 **즉시 가능** — 한국 정발 + Pokellector CDN 활성 + 영문/한국명 매핑 자료 풍부.
- **비고**:
  - M2/M2A 와 동일한 MEGA 시리즈 패턴 (5장/팩, 30팩/박스 추정).
  - 메가 지가르데 ex / 메가 별의가스 (스타미) ex 등 Legends Z-A 기반.
  - **주의**: 한국 발매 직후 (2026-03-13) 라 한국명이 아직 데이터베이스에 완전히 반영되지 않은 카드가 있을 가능성. 한국 공식 사이트 카드 리스트 (`pokemoncard.co.kr/card/869`) 를 1차 출처로 사용하고 Pokellector 는 이미지/번호 매핑용으로 사용 권장.
- **출처**:
  - https://pokemoncard.co.kr/card/869
  - https://bulbapedia.bulbagarden.net/wiki/Nihil_Zero_(TCG)
  - https://www.pokeguardian.com/sets/set-lists/japanese-sets/2914213_m3-nihil-zero-main-set-list
  - https://www.serebii.net/card/nihilzero/
  - https://jp.pokellector.com/Munikis-Zero-Expansion/
  - https://www.pokewallet.io/blog/nihil-zero-pokemon-tcg-japan-mega-zygarde-set-guide
  - https://krystalkollectz.com/blogs/news/munikis-zero-pokemon-card-list-korean-perfect-order

---

## 2. 로켓단의 영광 (Glory of Team Rocket / ロケット団の栄光)

- **공식 코드**: `SV10` (일본) / 한국 정발판도 SV10
- **발매일**:
  - 일본: 2025-04-18
  - 한국: 2025-06-20 (정식 발매), 2025-06-14 카드샵 선행
  - 한국 스페셜 키트: 2025-07-05
- **카드 총 수**: 132장 (메인 98장 + 시크릿 34장)
- **Pokellector 폴더 ID**: `413` — slug `Glory-of-Team-Rocket-Expansion`
  - 카드 이미지 URL 패턴: `https://den-cards.pokellector.com/413/<slug>.SV10.<num>.<id>.png`
  - 세트 페이지: `https://jp.pokellector.com/Glory-of-Team-Rocket-Expansion/` 및 `https://www.pokellector.com/Glory-of-Team-Rocket-Expansion/`
- **한국 정식 발매**: ✅ 예
  - 한국 공식 페이지: https://pokemoncard.co.kr/card/793
  - 토너먼트 페이지: https://www.pokemonkorea.co.kr/SV10_tournament
  - 포켓몬 스토어: https://pokemonstore.co.kr/pages/product/view.html?productNo=130848908
- **신뢰 가능한 영문 카드 리스트**:
  - PokeGuardian (메인): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2401852_sv10-glory-of-team-rocket-main-set-list
  - PokeGuardian (시크릿): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2401857_sv10-glory-of-team-rocket-all-sr-ar-sar-ur-cards
  - Serebii: https://www.serebii.net/card/gloryofteamrocket/
  - TCG Collector: https://www.tcgcollector.com/sets/11649/the-glory-of-team-rocket
  - LimitlessTCG: https://limitlesstcg.com/cards/jp/SV10
  - KrystalKollectz (한국명 매칭): https://krystalkollectz.com/blogs/news/glory-of-team-rocket-pokemon-card-list-korean
- **자료 가용성**: 🟢 **즉시 가능** — 한국 정발 1년 가까이 됨 + 모든 자료 풍부 + 한국명 매핑 안정적.
- **비고**:
  - 영문판은 SV9(전투 파트너즈/Battle Partners) + SV10 일부를 묶어 **"Destined Rivals"** 로 발매됨. 한국 정발은 일본 SV10 그대로 따름.
  - 로켓단 보스 / 보좌관 (사카키, 아폴로, 아테나, 란스, 라무다) 카드 수록.
  - 30팩/박스, 5장/팩.
- **출처**:
  - https://pokemoncard.co.kr/card/793
  - https://www.pokemonkorea.co.kr/SV10_tournament
  - https://pokemonstore.co.kr/pages/product/view.html?productNo=130848908
  - https://bulbapedia.bulbagarden.net/wiki/Glory_of_the_Rocket_Gang_(TCG)
  - https://www.pokeguardian.com/sets/set-lists/japanese-sets/2401852_sv10-glory-of-team-rocket-main-set-list
  - https://www.serebii.net/card/gloryofteamrocket/
  - https://jp.pokellector.com/Glory-of-Team-Rocket-Expansion/
  - https://limitlesstcg.com/cards/jp/SV10

---

## 3. 메가브레이브 (Mega Brave / メガブレイブ)

> 사용자 표기 "메가브레이" 는 오타로 추정. 정식명은 **메가브레이브**.

- **공식 코드**: `M1L` (Mega 1 Lucario 의 약자, 일본) / 한국 정발판도 동일
- **발매일**:
  - 일본: 2025-08-01
  - 한국: 2025-09-26 (정식 발매), 2025-09-20 카드샵 선행
  - 한국 카드샵 한정 세트: 2025-10-18
- **카드 총 수**: 92장 (메인 63장 + 시크릿 29장)
- **Pokellector 폴더 ID**: `416` — slug `Mega-Brave-Expansion`
  - 카드 이미지 URL 패턴: `https://den-cards.pokellector.com/416/<slug>.M1L.<num>.<id>.png`
  - 세트 페이지: `https://jp.pokellector.com/Mega-Brave-Expansion/`
- **한국 정식 발매**: ✅ 예
  - 한국 공식 페이지: https://pokemoncard.co.kr/card/816
  - 신 페이지: https://new.pokemonkorea.co.kr/card/816
  - 카드샵 세트 페이지: https://pokemoncard.co.kr/card/825
  - 토너먼트: https://www.pokemonkorea.co.kr/M1_tournament
  - 포켓몬 스토어: https://pokemonstore.co.kr/pages/product/view.html?productNo=131608736
- **신뢰 가능한 영문 카드 리스트**:
  - PokeGuardian (메인): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2592533_m1l-mega-brave-m1s-mega-symphonia-main-set-list
  - PokeGuardian (시크릿): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2596657_m1l-mega-brave-m1s-mega-symphonia-all-sr-ar-sar-mur-cards
  - Bulbapedia: https://bulbapedia.bulbagarden.net/wiki/Mega_Brave/Mega_Symphonia_(TCG)
  - Fuji Card Shop (메인 세트): https://www.fujicardshop.com/card-lists/mega-brave/
  - KrystalKollectz (영문/일본): https://krystalkollectz.com/blogs/news/mega-brave-pokemon-card-list-krystalkollectz
  - KrystalKollectz (한국명 매칭): https://krystalkollectz.com/blogs/news/mega-brave-korean-version-pokemon-card-list
- **자료 가용성**: 🟢 **즉시 가능** — 한국 정발 7개월 경과 + 한국명 매핑 안정 + Pokellector CDN 폴더 416 확인됨.
- **비고**:
  - MEGA 시리즈의 첫 페어 (M1L Mega Brave + M1S Mega Symphonia, 동시 발매).
  - 메인 카드: 메가루카리오 ex.
  - **메가울트라레어(MUR)** 등급이 이 시리즈부터 도입.
  - 영문판은 메가심포니아와 합쳐 "Mega Evolution" 으로 발매됨.
- **출처**:
  - https://pokemoncard.co.kr/card/816
  - https://new.pokemonkorea.co.kr/card/816
  - https://pokemoncard.co.kr/card/825
  - https://pokemonstore.co.kr/pages/product/view.html?productNo=131608736
  - https://www.pokeguardian.com/2573696_mega-expansion-pack-mega-brave-mega-symphonia-revealed
  - https://www.pokeguardian.com/sets/set-lists/japanese-sets/2592533_m1l-mega-brave-m1s-mega-symphonia-main-set-list
  - https://bulbapedia.bulbagarden.net/wiki/Mega_Brave/Mega_Symphonia_(TCG)
  - https://jp.pokellector.com/Mega-Brave-Expansion/

---

## 4. 메가심포니아 (Mega Symphonia / メガシンフォニア)

- **공식 코드**: `M1S` (Mega 1 Symphonia, 일본) / 한국 정발판도 동일
- **발매일**:
  - 일본: 2025-08-01 (메가브레이브와 동시)
  - 한국: 2025-09-26 (정식 발매), 2025-09-20 카드샵 선행
- **카드 총 수**: 92장 (메인 63장 + 시크릿 29장)
- **Pokellector 폴더 ID**: `417` — slug `Mega-Symphonia-Expansion`
  - 카드 이미지 URL 패턴: `https://den-cards.pokellector.com/417/<slug>.M1S.<num>.<id>.png`
  - 세트 페이지: `https://jp.pokellector.com/Mega-Symphonia-Expansion/`
- **한국 정식 발매**: ✅ 예
  - 한국 공식 페이지: https://pokemoncard.co.kr/card/815
  - 카드샵 세트 페이지: https://pokemoncard.co.kr/card/824
  - 토너먼트: https://www.pokemonkorea.co.kr/M1_tournament
  - 포켓몬 스토어: https://pokemonstore.co.kr/pages/product/view.html?productNo=131608745
- **신뢰 가능한 영문 카드 리스트**:
  - PokeGuardian (메인, M1L+M1S 통합): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2592533_m1l-mega-brave-m1s-mega-symphonia-main-set-list
  - PokeGuardian (시크릿): https://www.pokeguardian.com/sets/set-lists/japanese-sets/2596657_m1l-mega-brave-m1s-mega-symphonia-all-sr-ar-sar-mur-cards
  - Serebii: https://www.serebii.net/card/megasymphonia/
  - TCG Collector: https://www.tcgcollector.com/sets/11661/mega-symphonia
  - Fuji Card Shop: https://www.fujicardshop.com/card-lists/mega-symphonia/
  - PokéData: https://www.pokedata.io/set/Mega+Symphonia
  - KrystalKollectz (영문/일본): https://krystalkollectz.com/blogs/cardlists/mega-symphonia-pokemon-card-list-krystalkollectz
- **자료 가용성**: 🟢 **즉시 가능** — 메가브레이브와 완전 동일 조건. Pokellector 폴더 417 확인됨.
- **비고**:
  - 메인 카드: 메가가디안 ex.
  - 메가브레이브와 페어 발매라 SR/AR/SAR/MUR 자료가 두 세트 통합으로 묶여 있음 — 카드 데이터 추출 시 M1L 과 M1S 분리 주의 필요.
  - 영문판은 "Mega Evolution" 통합 세트의 절반으로 발매됨.
  - 30팩/박스, 5장/팩.
- **출처**:
  - https://pokemoncard.co.kr/card/815
  - https://pokemoncard.co.kr/card/824
  - https://pokemonstore.co.kr/pages/product/view.html?productNo=131608745
  - https://www.pokemonkorea.co.kr/M1_tournament
  - https://www.serebii.net/card/megasymphonia/
  - https://www.tcgcollector.com/sets/11661/mega-symphonia
  - https://jp.pokellector.com/Mega-Symphonia-Expansion/
  - https://www.fujicardshop.com/card-lists/mega-symphonia/

---

## 다음 단계 권장

1. **4세트 모두 즉시 추가 가능 (🟢)**. M2/M2A 추가 패턴(`src/lib/sets/m2.ts`, `src/lib/sets/m2a.ts`)을 그대로 차용.
2. **추가 우선순위 (한국 정발 시점 기준)**:
   1. 로켓단의 영광 (SV10) — 가장 오래됨, 한국명 매핑 안정.
   2. 메가브레이브 (M1L) + 메가심포니아 (M1S) — 페어 세트, 동시 추가 권장.
   3. 니힐제로 (M3) — 가장 최근 (2026-03 정발). 한국명 매핑 자료가 다른 세트 대비 적을 수 있어 `pokemoncard.co.kr/card/869` 1차 검증 필요.
3. **이미지 URL 전략**: 4세트 모두 Pokellector den-cards CDN (폴더 413/416/417/428) 사용 가능 — 기존 M2/M2A 와 동일 패턴.
4. **세트 코드 명명 규칙 결정 필요**: 기존 코드는 `m2`, `m2a` 소문자. 신규 세트도 `sv10`, `m1l`, `m1s`, `m3` (소문자) 권장. 단, 메가브레이브/심포니아의 경우 일본 공식 코드가 `M1L`/`M1S` 인 점 유의.
5. **데이터 추출 작업 절차**:
   - PokeGuardian 메인 + 시크릿 리스트 → 번호/영문명 추출.
   - 한국 공식 페이지 (`pokemoncard.co.kr/card/{793,815,816,869}`) → 한국명 매칭.
   - Pokellector 카드 페이지에서 `den-cards.pokellector.com/{folder}/<slug>.<CODE>.<num>.<id>.png` ID 추출.
6. **잠재적 문제**:
   - 니힐제로 (2026-03 발매) 의 일부 시크릿/SAR/MUR 카드가 한국명 미공개 상태일 수 있음 — 일본명 임시 사용 후 추후 업데이트 필요.
   - 메가브레이브/심포니아 페어 세트의 경우 PokeGuardian 시크릿 리스트가 통합되어 있어 추출 시 분리 작업 필요.

---

## 참고: 사용자 추정 vs 실제 (요약)

| 사용자 추정 | 실제 | 정정 |
| ----------- | ---- | ---- |
| 니힐제로 = SV9 또는 이후 신작 | M3 (MEGA 시리즈 3번째) | 메가 시리즈 코드 |
| 로켓단의 영광 = SV10 / Battle Partners | SV10 (Battle Partners = SV9 별개 세트) | Battle Partners 와 무관 |
| 메가브레이 = M3 신작 | 메가브레이브 = M1L (2025-08) | 이름 + 코드 둘 다 |
| 메가심포니아 = M3a 신작 | M1S (2025-08, M1L 페어) | 코드 정정 |

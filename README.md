# 포켓몬 카드깡 시뮬레이터 (Pokemon TCG Pack-Opening Sim)

한글판 포켓몬 TCG 부스터 팩을 가상으로 개봉하는 시뮬레이터.

## 지원 팩

| 코드 | 한글명 | 팩 구성 | 발매 |
|------|--------|---------|------|
| `m2a` | **MEGA 드림 ex** (하이클래스팩) | 10 cards × 10 packs / box | 2026-01-23 |
| `m2` | **인페르노X** (MEGA 확장팩) | 5 cards × 30 packs / box | 2025-11-28 |
| `sv8` | **초전브레이커** (확장팩) | 5 cards × 30 packs / box | 2024-11-27 |

## 기능

- **세트 선택 → 박스 → 팩 그리드 → 팩 개봉 → 카드 공개** 의 풀 플로우
- 박스 오픈 / 팩 찢기 / 카드 플립 **Framer Motion** 애니메이션
- **등급별 홀로 쉬머** + **SR / SAR / MUR / UR** 전용 번쩍임 + 스파클
- 한 장씩 뒤집거나 **한번에 보기** 지원
- 모든 개봉 기록은 `localStorage`에 저장 → **내 카드지갑**에서 등급별 / 세트별 필터링
- 확률대로 뽑히는 **가중치 기반 팩 드로우** (C/U/R/RR/AR/SR/SAR/MA/MUR/UR)

## 개발

```bash
cd pokemon-tcg-sim
npm install
npm run dev -- --port 3100   # (다른 앱이 3000을 점유하고 있을 수 있음)
```

`http://localhost:3100` 접속.

```bash
npm run build   # 프로덕션 빌드 (타입 체크 + 정적 생성)
npm run start
```

## 주요 파일 구조

```
src/
├── app/
│   ├── page.tsx                    # 홈: 3개 세트 선택
│   ├── set/[code]/page.tsx         # 박스 + 팩 그리드 + 팩 개봉 (SSG via generateStaticParams)
│   ├── wallet/page.tsx             # 내 카드지갑
│   ├── layout.tsx
│   └── globals.css                 # Pretendard + 홀로/번쩍임 애니메이션
├── components/
│   ├── Navbar.tsx
│   ├── SetCard.tsx                 # 홈의 세트 카드
│   ├── SetView.tsx                 # 박스→팩→카드 상태 머신
│   ├── PokeCard.tsx                # 3D 플립 + 홀로 쉬머
│   ├── WalletView.tsx              # 지갑 + 필터
│   └── RarityBadge.tsx
└── lib/
    ├── types.ts                    # 카드/세트/지갑 타입
    ├── rarity.ts                   # 등급 설정 + 색상/쉬머 매핑
    ├── pack-draw.ts                # 슬롯별 가중치 랜덤 드로우
    ├── storage.ts                  # localStorage + useSyncExternalStore 훅
    └── sets/
        ├── index.ts                # SETS 카탈로그
        ├── m2a.ts                  # 메가드림ex 카드 데이터
        ├── m2.ts                   # 인페르노X 카드 데이터
        └── sv8.ts                  # 초전브레이커 카드 데이터

prisma/schema.prisma                # 실서버 DB 스키마 (Postgres, 추후 전환 시)

public/images/
├── common/card-back.svg
└── sets/
    ├── m2a/box.png, pack.png       # 포켓몬 코리아 공식 CDN에서 받은 실제 이미지
    ├── m2/box.png, pack.png        # (팬 시뮬레이터 범위 내 비영리 사용)
    └── sv8/box.svg, pack.svg       # 공식 고해상도 미확보 → 임시 SVG
```

## DB 전환 계획

`prisma/schema.prisma` 에 **Set / Card / User / Box / PackOpen / Pull / CardOwnership** 테이블이 준비됨.

- `localStorage` 의 `wallet` 구조 ↔ `CardOwnership` 테이블 1:1 매핑
- 로그인 / 유저 시스템은 추후 NextAuth 또는 Supabase Auth 로 얹을 수 있음
- 이미지는 초기에는 외부 CDN (pokemonkorea.co.kr, pokellector, limitless) 을 참조하지만,
  실서버에서는 **S3 / Supabase Storage** 로 미러해야 안정적. CDN 403 / hotlink 문제가 종종 발생.

## 확률

각 팩의 `slots[]` 배열이 슬롯 개수와 각 슬롯의 rarity 가중치를 정의합니다.
`src/lib/sets/*.ts` 에서 튜닝 가능. 공식 TPC가 pull rate를 공개하지 않아 값은 커뮤니티 집계(≈1,000박스 샘플) 기반 추정치입니다.

## 저작권

카드 / 박스 / 팩 이미지는 © The Pokémon Company / 포켓몬 코리아 / Nintendo / Creatures Inc. / GAME FREAK.
이 프로젝트는 학습 / 팬 시뮬레이션용이며 상업적 재배포를 하지 않습니다.

## 차후 개선

- 팩 오픈 사운드 (rip + rarity jingle)
- 포인터 기울기 기반 3D 틸트 홀로 (mouse-track transform)
- 내 카드지갑 → 세트 완성도 프로그레스 링
- 카드 상세 모달 (zoom + 풀 히스토리)
- 박스 / 팩 3D CSS 변환 (현재는 이미지 + CSS 애니메이션)

# 디스코드 자랑하기 셋업

팩 개봉 / PSA 감별 결과를 디스코드 채널에 embed로 자동 공유하는 기능입니다. 완전히 동작하려면 아래 **3분짜리** 1회 셋업이 필요합니다.

## 1) 디스코드에서 웹훅 만들기

1. 자랑방으로 쓸 서버 + 채널을 고릅니다 (없으면 새로 만드세요).
2. 채널 이름 옆 **⚙ 톱니바퀴** → **연동** → **웹훅** → **새 웹훅**
3. 이름(예: `포켓몬 카드깡`), 아이콘을 정하고 **웹훅 URL 복사**
4. 이 URL은 **비밀**입니다 — 누구든 이걸 알면 채널에 메시지를 보낼 수 있어요.

## 2) Vercel 환경변수에 등록

Vercel 프로젝트 → **Settings → Environment Variables** → 아래 추가:

| Name | Value | Environments |
|------|-------|--------------|
| `DISCORD_WEBHOOK_URL` | (방금 복사한 Discord 웹훅 URL) | Production · Preview · Development 모두 체크 |

저장 후 **Deployments 탭 → 가장 최근 프로덕션 배포 오른쪽 `…` → Redeploy**. (env 반영은 재배포 필요)

## 3) 로컬 개발

`.env.local` 에 한 줄 추가:

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXXX/YYYY...
```

`npm run dev` 로 띄운 뒤 팩 개봉 / PSA 감별 → "디스코드에 자랑하기" 버튼 클릭.

## 4) 어디에 버튼이 붙었나

| 상황 | 위치 | 발송 조건 |
|------|------|-----------|
| 팩 개봉 후 카드 다 공개됨 | 팩 오프닝 오버레이 하단 | 팩 안에 **AR 이상** 카드가 있을 때만 노출 |
| PSA 감별 성공 | 감별 결과 화면 | 항상 노출 (PSA 10은 별도 🏆 라벨) |
| PSA 감별 실패 | 감별 실패 화면 | "슬픔 공유하기" (선택) |

## 5) 보안 메모

- `DISCORD_WEBHOOK_URL` 은 **서버 전용** (`NEXT_PUBLIC_` 접두사 없음). 브라우저 번들에 포함되지 않고 `/api/discord/share` route handler 내부에서만 사용됩니다.
- 클라이언트는 `fetch('/api/discord/share')` 만 호출 — 웹훅 URL을 직접 못 만집니다.
- 남용이 우려되면 Discord 대시보드에서 웹훅 삭제만 하면 모든 경로가 즉시 503으로 멈춥니다.

## 6) 환경변수가 없을 때 동작

`DISCORD_WEBHOOK_URL` 이 없으면 API가 503 + `"Discord 웹훅이 설정되지 않았어요."` 로 응답합니다. 버튼은 눌러도 에러 메시지만 표시되고 앱 전체는 정상 동작합니다.

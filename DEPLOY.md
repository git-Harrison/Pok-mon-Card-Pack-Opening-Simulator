# 배포 가이드

## 권장 경로: Vercel 네이티브 GitHub 통합

가장 간단하고 관리 부담이 적은 방법입니다. **GitHub Actions Secret 설정 없이** 바로 됩니다.

### 1회만 하면 되는 설정

1. [vercel.com/new](https://vercel.com/new) 접속 → GitHub으로 로그인 (git-Harrison 계정)
2. `git-Harrison/Pok-mon-Card-Pack-Opening-Simulator` **Import**
3. Framework Preset: `Next.js` (자동 감지됨)
4. **Environment Variables** 섹션에 두 개 추가:
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://vdprfnhwdbrwdbjmbjfy.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_wYsTQ7Og_BeMclYN8ZFSNg_3EwX1GPB` |
5. **Deploy** 클릭

### 이후 동작

- `main` 브랜치에 `git push` → Vercel이 자동 프로덕션 빌드 + 배포
- PR 생성 → Vercel이 자동 프리뷰 URL 생성
- `.github/workflows/ci.yml` 은 PR/push마다 타입체크 + 빌드 검증 (이중 안전망)

### 배포 리전

`vercel.json` 에 `"regions": ["icn1"]` (서울) 지정됨. Supabase DB도 서울(ap-northeast-2)이라 한국 사용자 응답성 최적.

## (옵션) GitHub Actions로 직접 배포하고 싶다면

이 방식은 불필요하게 복잡하므로 **권장하지 않습니다**. 해야 한다면:

1. [vercel.com/account/tokens](https://vercel.com/account/tokens) 에서 토큰 발급
2. 로컬에서 `vercel link` 실행 → `.vercel/project.json` 생성됨
3. GitHub repo Settings → Secrets → 아래 3개 추가:
   - `VERCEL_TOKEN` (방금 발급한 토큰)
   - `VERCEL_ORG_ID` (`.vercel/project.json` 의 `orgId`)
   - `VERCEL_PROJECT_ID` (`.vercel/project.json` 의 `projectId`)
4. `.github/workflows/deploy.yml` 워크플로우를 직접 작성 (이 리포엔 없음)

Vercel 네이티브 통합이 프리뷰 URL, 댓글 연동, 빌드 캐시를 모두 자동 처리하므로 Actions 배포는 커스텀 요구사항이 있을 때만 씁니다.

## 환경변수 참고

앱이 실제로 쓰는 건 두 개뿐:

```
NEXT_PUBLIC_SUPABASE_URL=https://vdprfnhwdbrwdbjmbjfy.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_wYsTQ7Og_BeMclYN8ZFSNg_3EwX1GPB
```

이 키들은 **공개 가능한** 값입니다 (RLS가 아닌 SECURITY DEFINER 함수로 보호). `NEXT_PUBLIC_` 접두사가 있는 Next.js env는 브라우저 번들에 포함됩니다.

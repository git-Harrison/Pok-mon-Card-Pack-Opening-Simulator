/**
 * Per-deploy build ID baked into the client bundle at build time.
 *
 * next.config.ts 가 build 시점에 NEXT_PUBLIC_BUILD_ID 를 unique 한
 * 값으로 채워서 inject (chain: VERCEL_DEPLOYMENT_ID →
 * VERCEL_GIT_COMMIT_SHA → Date.now()). 클라이언트 번들에는 그
 * 값이 literal 로 동결되고, /api/build-id 는 같은 env 를 runtime 에
 * 읽어 응답 — 두 값이 다르면 새 deploy.
 *
 * "dev" fallback 은 더 이상 사용 안 함 (Date.now() 가 ultimate).
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown";

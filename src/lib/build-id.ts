/**
 * Per-deploy build ID baked into the client bundle at build time.
 *
 * Vercel injects VERCEL_GIT_COMMIT_SHA on every deploy, so the
 * bundled value is the SHA *that built this code*. The /api/build-id
 * route reads the same env var at request time (Vercel rebuilds
 * runtime env per deployment too) and the client compares the two.
 *
 * In local dev there's no Vercel env, so both ends read "dev" and
 * never trigger the update modal.
 */
export const BUILD_ID =
  process.env.NEXT_PUBLIC_BUILD_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "dev";

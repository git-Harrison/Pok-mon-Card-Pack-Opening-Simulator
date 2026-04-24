<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase migrations

- Put every schema/RPC change in a new file at `supabase/migrations/YYYYMMDD_<slug>.sql`. Filenames are applied in alphabetical (= chronological) order by the CI job, so the date prefix matters.
- Write migrations so they're **idempotent**: `create or replace function …`, `create table if not exists …`, `alter table … add column if not exists …`. The CI re-runs a file whenever its checksum changes, so non-idempotent DDL will fail on the second run.
- Do NOT run migrations manually via `node scripts/apply-*.mjs` anymore. The `.github/workflows/supabase-migrations.yml` job runs on every push that touches `supabase/migrations/**.sql` (or the workflow file itself) and applies anything the `_migrations` checksum ledger hasn't seen yet. Secret: `SUPABASE_DB_URL` (session-pooler URI, port 5432).
- When you add a new migration: commit → push → CI applies → done. End the commit message with a line like `마이그레이션: <filename>` so the user can grep deploy history.
- Only fall back to manual `psql` / `node scripts/apply-…` if CI is genuinely broken. If you do, also push the migration file so CI catches up on the next run.
- `scripts/apply-*.mjs` files are historical; don't add new ones. Put the SQL in `supabase/migrations/` instead.

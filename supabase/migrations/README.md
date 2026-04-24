# Auto-applied Supabase migrations

Files in this directory are automatically applied to the production
Supabase database on every push to `main`, via
`.github/workflows/supabase-migrations.yml`.

## Naming

```
YYYYMMDD[_HHMM]_<short-description>.sql
```

Example: `20260424_bulk_psa_grading.sql`. Files run in alphabetical
(= chronological, given the date prefix) order.

## Rules

1. **Every migration must be idempotent.** Use `create or replace
   function`, `create table if not exists`, `insert ... on conflict do
   nothing`, etc. Never assume the migration runs exactly once.

2. **Never edit an already-applied migration.** The workflow tracks
   each file by SHA-256 checksum in the `_migrations` table; editing
   a file triggers a re-apply. If the new content is non-idempotent
   this will break production. Add a *new* migration instead.

3. **Never put `truncate`, `drop`, or destructive data changes here.**
   Ad-hoc destructive operations belong outside this folder and must
   be run manually through the Supabase Dashboard SQL editor.

4. **No interactive `\`-commands.** `psql` runs these files with
   `-v ON_ERROR_STOP=1 -f <file>`; backslash metacommands (`\i`,
   `\echo`, etc.) should be avoided. Plain SQL only.

5. **End with `notify pgrst, 'reload schema';`** if you added or
   changed a `function`, so PostgREST picks it up without a restart.

## Required GitHub secret

The workflow needs `SUPABASE_DB_URL` (Settings → Secrets → Actions).
Format:

```
postgres://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Get it from Supabase Dashboard → Project Settings → Database →
Connection string (use **Session mode**, port `5432`). The URL-
encoded password must be included.

## Manual run

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql
```

The workflow's checksum bookkeeping stays consistent as long as you
also update `_migrations` afterwards (or simply let the next push
re-apply; idempotent migrations are safe either way).

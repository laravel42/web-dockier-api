# SQL migrations

This folder is the **single source of truth** for Dockier’s Postgres schema.

## Files

- `000x_*.sql` — ordered migrations (apply in numeric order)
- `legacy-index.md` — mapping from historical Encore/service/prisma migrations to these files

## Apply

From repo root (reads `MIGRATE_URL`, pooler URLs, or `DATABASE_URL` from `.env`):

```bash
pnpm db:migrate
```

On IPv4-only networks, prefer Supavisor **session pooler** URL (`MIGRATE_URL`, port 5432) over direct `db.*.supabase.co` (IPv6 on free tier). See `.env.example`.

Optional Supabase CLI:

```bash
pnpm db:link
pnpm db:push    # same script as db:migrate
```

## Conventions

- Never edit a migration that has already been applied in shared environments — add a new numbered file.
- Prefer `IF NOT EXISTS` for `CREATE TABLE` and `CREATE INDEX CONCURRENTLY` where appropriate.
- Backend permission seeds must stay in sync with `backend/src/shared/permissions/constants.ts`.

Do not maintain a separate root `migrations/` folder; all schema changes belong here.

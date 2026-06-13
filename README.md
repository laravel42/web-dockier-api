# Dockier

Dockier is a full-stack developer platform with a Fastify + TypeScript backend in `backend/`, Supabase-backed persistence, and OpenAPI-first contracts.

## Backend Status

All active backend domains are implemented under `backend/src/services/*` and run via the Fastify runtime.

## Architecture Snapshot

```text
backend/ (Fastify + TypeScript runtime)
├── src/services/*           → service route modules
├── src/shared/supabase      → typed Supabase client/types
└── src/shared/openapi       → route schemas -> OpenAPI/Swagger

frontend/ (React 19 + Vite + Tailwind CSS)
├── src/services             → API client layer
└── wrangler.toml            → Cloudflare Pages config

docs/                        → Mintlify docs
migrations/                  → unified SQL migration source of truth
```

## Developer Workflow

### Prerequisites

- Node.js 18+
- `pnpm` 10+

### Install dependencies

```bash
pnpm install
cd frontend && pnpm install
```

### Run backend (Fastify)

From repo root:

```bash
pnpm backend:dev
```

Useful service-specific commands:

```bash
pnpm backend:start:gateway
pnpm --filter @dockier/backend-fastify start:auth
pnpm --filter @dockier/backend-fastify start:users
pnpm --filter @dockier/backend-fastify start:projects
pnpm backend:typecheck
```

### Run frontend (Vite)

```bash
cd frontend
pnpm dev
pnpm lint       # ESLint (Tailwind canonical-class checks)
pnpm lint:fix   # auto-fix canonical Tailwind classes
```

See `frontend/README.md` for list-page UX, tech badge caching, and linting details.

### API docs

When backend is running:

- Swagger UI: `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs/json`

### Mintlify docs

From repo root:

```bash
pnpm docs:dev
pnpm docs:build
```

### Publish to production (Railway + Cloudflare)

Copy `.env.example` → `.env`, configure secrets, then:

```bash
# One-time Railway setup
pnpm exec railway login
pnpm exec railway link

# Full production deploy (backend → Railway, frontend → Cloudflare Pages)
pnpm publish:prod

# Or deploy separately
pnpm publish:railway      # backend only
pnpm publish:cloudflare   # frontend only (set DOCKIER_API_URL first)
```

See `docs/operations/railway.mdx` and `docs/operations/cloudflare.mdx`.

### Legacy AWS publish

```bash
pnpm publish:aws   # ECR image + optional S3 frontend
```

### Cloudflare Pages workflow (frontend only)

```bash
cd frontend
pnpm build
pnpm cf:pages:dev
pnpm cf:pages:deploy
```

## Environment Variables

Secrets are managed through **Cloudflare Secrets Store** (production), **gitignored local files** (dev), with optional Supabase Edge Function sync:

1. **Local dev:** copy `.env.example` → `.env`, or use `.env.local` overrides.
2. **Production:** `pnpm secrets:push` uploads `.env` to Cloudflare Secrets Store. See `docs/operations/cloudflare.mdx`.
3. **Backend runtime:** Railway in production. Set `LOAD_SECRETS_FROM=cloudflare` with bridge vars on Railway, or `SYNC_RAILWAY_ENV=true pnpm publish:railway`. AWS Secrets Manager / SSM remain supported as fallback.
4. **Edge Functions (optional):** `pnpm secrets:push:supabase`.

The backend calls `initConfig()` before startup, which loads local files then fetches Cloudflare or AWS secrets (without overwriting keys already in `process.env`).

## Database and Migrations

- SQL migrations live in `supabase/migrations/`.
- Apply to your remote database: `pnpm db:migrate` (reads `DIRECT_URL` or `DATABASE_URL` from `.env`, or uses a linked Supabase project via `pnpm db:link`).
- Historical lineage is documented in `supabase/migrations/legacy-index.md`.

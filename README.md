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

### Publish to Cloudflare or AWS

Copy `scripts/publish.env.example` to `scripts/publish.env` and set `DOCKIER_API_URL` to your production API.

```bash
# Frontend → Cloudflare Pages (API must run elsewhere)
pnpm publish:cloudflare

# Backend Docker image → ECR; optional S3 + CloudFront for frontend
pnpm publish:aws
```

See `bash scripts/publish.sh --help` for flags and required env vars.

### Cloudflare Pages workflow (frontend only)

```bash
cd frontend
pnpm build
pnpm cf:pages:dev
pnpm cf:pages:deploy
```

## Environment Variables

For the Fastify backend, copy `backend/.env.example` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `SERVICE_NAME`
- `PORT`
- `CORS_ORIGIN`

Supabase Auth email OTP/magic-link must be enabled for passwordless sign-in flows.

## Database and Migrations

- Add and run SQL migrations from root `migrations/` only.
- Historical lineage is documented in `migrations/legacy-index.md`.

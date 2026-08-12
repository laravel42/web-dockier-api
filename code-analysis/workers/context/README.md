# Dockier

Dockier is a developer platform that connects Git repositories to security scanning, AI-powered project analysis, deployment automation, and team management — from a single dashboard.

**Audience:** Small-to-mid-size engineering teams (roughly 2–15 engineers) who need to ship secure code without juggling separate AppSec, CI, and deployment tools.

**License:** MPL-2.0

See [`PRODUCT.md`](PRODUCT.md) for the feature overview and [`DESCRIPTION.md`](DESCRIPTION.md) for goals, scope, non-goals, and success criteria. See [`AGENTS.md`](AGENTS.md) for AI coding agent conventions.

---

## What Dockier does

| Area | Summary |
| ---- | ------- |
| **Git** | Connect GitHub, GitLab (cloud + self-hosted), and Bitbucket via PATs. Browse repos, branches, files, and stats. |
| **Projects** | Link a repo + branch; track tech stack badges, commits, scans, and deploys. |
| **AI analysis** | Eight-section project overview (OpenAI gpt-5.4-mini), cached per commit SHA. |
| **Sensitive data** | Pattern-based scanner for migrations, ORM schemas, and model files — no AI credits. |
| **Dependencies** | Parses npm, Composer, pip, and Bundler manifests; checks OSV.dev. |
| **Security scans** | Semgrep, optional SonarQube, and database-backed custom regex rules. |
| **Remediation** | AI fix suggestions, merge-request drafts, and PM issue creation from findings. |
| **Deploy** | Auto-generated Dockerfiles, AWS (ECS via CodeBuild/CloudFormation) and GCP (Cloud Run, GCE, static CDN via Pulumi). |
| **Notifications** | Email, Slack, webhooks, and in-app alerts with structured metadata for deploys and scans. |
| **Access control** | Multi-tenant organizations, custom roles, 30+ granular permissions, optional TOTP 2FA. |

---

## Architecture

```text
backend/                    Fastify + TypeScript (single gateway binary)
├── src/services/           Domain route modules (auth, deploy, git, scans, …)
├── src/shared/             Auth, config, OpenAPI, Supabase client, pg-boss queue
└── package.json            @dockier/backend-fastify

frontend/                   React 19 + Vite + Tailwind CSS v4 (dark mode default)
├── src/pages/              Dashboard, Projects, Security, Deploy, Settings, …
├── src/services/           Typed API clients
└── wrangler.toml           Cloudflare Pages deployment

supabase/migrations/        Canonical SQL schema (apply with pnpm db:migrate)
code-analysis/rules/        Semgrep / OpenGrep rule assets
docs/                       Mintlify documentation
infra/                      DB setup scripts, Pulumi/AWS helpers
```

**Runtime:** Backend on [Railway](docs/operations/railway.mdx); frontend on Cloudflare Pages. Secrets via Cloudflare Secrets Store in production (`pnpm secrets:push`).

**Database:** Supabase Postgres (Postgres + Supabase Auth). Background jobs use **pg-boss** on the same database when `DATABASE_URL` is configured.

**API:** OpenAPI-first routes (Zod schemas). Swagger UI at `/docs` when the backend is running.

---

## Prerequisites

- Node.js 18+
- pnpm 10+ (repo pins pnpm 11 via `packageManager`)

---

## Quick start

```bash
# Install
pnpm install
cd frontend && pnpm install

# Configure (copy and fill in Supabase + JWT keys)
cp .env.example .env

# Apply schema
pnpm db:migrate

# Terminal 1 — API gateway (all services)
pnpm backend:dev

# Terminal 2 — SPA
pnpm frontend:dev
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:4000  
- Swagger: http://localhost:4000/docs  

Seed an admin user (optional):

```bash
pnpm backend:seed:admin
```

---

## Common commands

```bash
# Quality
pnpm test                  # Root Vitest suite
pnpm typecheck             # Backend + frontend
pnpm lint                  # Backend + frontend ESLint

# Backend
pnpm backend:typecheck
pnpm backend:start:gateway

# Frontend
pnpm frontend:build
pnpm frontend:lint:fix     # Includes Tailwind canonical-class fixes

# Docs
pnpm docs:dev
pnpm docs:build

# Production deploy
pnpm publish:prod          # Railway backend + Cloudflare Pages frontend
pnpm publish:railway
pnpm publish:cloudflare
```

---

## Environment

Copy [`.env.example`](.env.example) → `.env` (gitignored). Required keys include `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `JWT_SECRET`. Optional: `OPENAI_API_KEY`, `DATABASE_URL` (pg-boss), cloud provider credentials for deploy flows.

Production secrets: `pnpm secrets:push` → Cloudflare Secrets Store; Railway loads them when `LOAD_SECRETS_FROM=cloudflare`. See `docs/operations/cloudflare.mdx` and `docs/operations/railway.mdx`.

---

## Database migrations

All schema changes belong in **`supabase/migrations/`** with monotonic numeric prefixes (`0046_*.sql`, …). Do not edit migrations that have already been applied — add new files instead.

```bash
pnpm db:migrate    # Uses MIGRATE_URL or pooler URLs from .env
pnpm db:link       # Link Supabase CLI project (optional)
```

Historical migration lineage: [`supabase/migrations/legacy-index.md`](supabase/migrations/legacy-index.md).

---

## Repository map

| Path | Purpose |
| ---- | ------- |
| [`backend/README.md`](backend/README.md) | Backend services, auth model, run modes |
| [`frontend/README.md`](frontend/README.md) | UI structure, design tokens, linting |
| [`AGENTS.md`](AGENTS.md) | Conventions for AI agents |
| [`.kiro/specs/`](.kiro/specs/) | Historical feature design docs (not product source of truth) |

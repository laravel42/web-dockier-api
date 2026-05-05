# AGENTS.md — Dockier

Instructions for AI coding agents working on this codebase.

## Project overview

Dockier is a developer platform that connects source code repositories to security scanning, AI-powered project analysis, deployment automation, and project management — all from a single dashboard. See `PRODUCT.md` for the full feature set and `DESCRIPTION.md` for goals, scope, non-goals, and success criteria.

## Tech stack

- **Backend:** Encore.ts (TypeScript) — microservices architecture
- **Frontend:** React 19 + Vite + Tailwind CSS v4 (in `frontend/`)
- **Database:** PostgreSQL (Neon Serverless Postgres), one database per service
- **Package manager:** pnpm (v10) — do NOT use npm or yarn
- **Language:** TypeScript (strict mode, ES2022 target, bundler module resolution)
- **Testing:** Vitest — tests live in `__tests__/` directories, files named `*.test.ts`
- **AI:** OpenAI API (gpt-5.4-mini) — server-side only, key stored as Encore secret
- **Infrastructure:** Pulumi (GCP), CloudFormation (AWS)
- **Scanning:** Semgrep + custom regex rules engine

## Repository structure

```
├── auth/              → Authentication service (JWT, 2FA, social login)
├── users/             → User management service
├── roles/             → Roles and permissions service
├── projects/          → Project management service
├── git-integration/   → Git provider connections (GitHub, GitLab, Bitbucket)
├── code-analysis/     → Security scanning (Semgrep, custom rules)
├── deploy/            → Deployment automation (AWS, GCP)
│   ├── endpoints/     → API route handlers
│   ├── processor/     → Async deploy pipeline (pub/sub subscriber)
│   ├── pulumi-templates/ → Infrastructure-as-code templates per provider
│   ├── repo-analyzer/ → Framework detection + Dockerfile generation
│   └── templates/     → Project template configs
├── notifications/     → Multi-channel notifications (email, Slack, webhook, in-app)
├── integrations/      → Third-party PM tool integrations (Jira, Linear, etc.)
├── image-builder/     → Docker image build service
├── lib/               → Shared utilities (database wrapper)
├── infra/             → Infrastructure configuration
├── frontend/          → React SPA (separate package.json)
└── prisma/            → Prisma schema (reference only)
```

## Service conventions

Each backend service follows this structure:

```
service-name/
├── encore.service.ts          → Service registration: new Service("name")
├── service-name.ts            → Main API endpoints (or split into endpoints/)
├── shared.ts                  → DB connection, types, pub/sub topics, constants
├── migrations/                → SQL migration files (numbered, .up.sql)
└── __tests__/                 → Vitest test files
```

### Key patterns

- **Database access:** Services use `lib/db.ts`, a tagged-template SQL wrapper (`db.exec`, `db.queryRow`, `db.query`). Initialize with `initDb(DatabaseUrl())` in `shared.ts`. Use parameterized queries — never interpolate user input into SQL strings.
- **Secrets:** Use `secret()` from `encore.dev/config`. Never hardcode secrets or commit them.
- **Pub/sub:** Use `Topic` and `Subscription` from `encore.dev/pubsub` for async processing (deploys, notifications). Delivery is at-least-once — handlers must be idempotent.
- **Auth:** JWT-based. Endpoints that require auth use Encore's auth middleware. The `auth/` service issues and validates tokens.
- **Service-to-service calls:** Use Encore's generated clients: `import { service_name } from "~encore/clients"`.
- **Row mapping:** Database rows use snake_case. API responses use camelCase. Each service has a `rowToX()` mapper function.

## Database

- Each service has its own PostgreSQL database (see `infra/infra.config.json` for the list).
- Migrations are plain SQL files in `service/migrations/`, numbered sequentially: `1_description.up.sql`, `2_description.up.sql`, etc.
- The database is Neon Serverless Postgres. Connection strings include SSL configuration automatically.
- When writing migrations, always use `IF NOT EXISTS` for CREATE TABLE and `CREATE INDEX CONCURRENTLY` where possible.

## Deploy service — adding a new provider

The deploy service is designed to be extensible. To add a new cloud provider:

1. Add its key to the `DeployProvider` type in `deploy/shared.ts`
2. Add it to the `SUPPORTED_PROVIDERS` array in `deploy/shared.ts`
3. Create a Pulumi template in `deploy/pulumi-templates/<provider>.ts`
4. Register it in `deploy/pulumi-templates/index.ts` (providerBuilders map)
5. Add default region in `deploy/endpoints/tofu.ts` (DEFAULT_REGIONS)
6. Add resource estimation in `deploy/endpoints/tofu.ts` (RESOURCE_ESTIMATORS)
7. Add URL pattern in `deploy/processor/helpers.ts` (URL_GENERATORS)
8. Add frontend provider style in `frontend/src/data/providers.ts`

## Frontend conventions

- Located in `frontend/` with its own `package.json` — run `pnpm install` there separately.
- React 19 with functional components and hooks only. No class components.
- Tailwind CSS v4 for styling. Dark mode is the default.
- Routing via `react-router-dom`.
- API calls go through `frontend/src/services/` — one file per backend service.
- Auth state managed via React Context (`frontend/src/context/`).
- Shared components in `frontend/src/components/`, page components in `frontend/src/pages/`.
- Use TypeScript types from `frontend/src/types/`.

## Commands

```bash
# Backend
encore run                    # Start the backend (localhost:4000, dashboard at localhost:9400)
pnpm test                     # Run all backend tests (vitest --run)

# Frontend
cd frontend && pnpm install   # Install frontend dependencies
cd frontend && pnpm dev       # Start frontend dev server (localhost:5173)
cd frontend && pnpm build     # Production build
```

## Code style rules

- Use `const` by default, `let` only when reassignment is needed. Never use `var`.
- Prefer `async/await` over raw Promises.
- Use tagged-template SQL queries (`db.exec\`...\``) — never string concatenation for SQL.
- Error messages should be user-facing and descriptive (e.g., "Email already registered", not "duplicate key").
- Keep endpoint handlers thin — extract business logic into helper functions.
- Use early returns to reduce nesting.
- Type everything explicitly — avoid `any` unless interfacing with untyped external libraries.
- Imports: use `node:` prefix for Node.js built-ins (e.g., `import { join } from "node:path"`).

## Things to avoid

- Do NOT use Encore's built-in `SQLDatabase` — the project uses a custom `lib/db.ts` wrapper with `pg` for Neon compatibility.
- Do NOT add new dependencies without checking if an existing one covers the use case.
- Do NOT modify migration files that have already been applied — create new migration files instead.
- Do NOT put secrets, API keys, or credentials in code or config files — use Encore secrets.
- Do NOT use `npm` or `yarn` — this project uses `pnpm`.
- Do NOT import from `frontend/` in backend code or vice versa — they are separate packages.

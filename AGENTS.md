# AGENTS.md — Dockier

Instructions for AI coding agents working on this codebase.

## Project overview

Dockier is a developer platform that connects source code repositories to security scanning, AI-powered project analysis, deployment automation, and project management — all from a single dashboard. See `PRODUCT.md` for the full feature set and `DESCRIPTION.md` for goals, scope, non-goals, and success criteria.

**Design system:** In-app UX follows the token system implemented in `frontend/src/index.css` — a graphite neutral base with a sand/ochre primary accent, `dusk` / `cream` / `seed` scales, and **Space Grotesk** across every type role (sans, display, heading, mono). Theming is token-driven via `data-theme` light and dark variants over shadcn/ui primitives. The berry scale (`dockier-50`…`dockier-900`) is **legacy**, reserved for severity states and marketing accents only — it is not the product's primary identity. `PRODUCT.md` → *Brand Commitments* is the binding record.

> **Superseded:** an earlier UX parity program aligned the app to the sibling `web-berry` design system (Bely/Soleil via Adobe Typekit, berry as the primary world). That is no longer the target, and the sibling repository is not part of this checkout — do not restore it as the authority.

Delivery is tracked in Linear project *Dockier App — UX Parity & Hardening*; see `docs/delivery/multi-agent-playbook.md` for agent routing and quota guidelines.

## Tech stack

- **Backend:** Fastify + TypeScript (modular service routes in `backend/src/services`)
- **Frontend:** React 19 + Vite + Tailwind CSS v4 (in `frontend/`)
- **Database:** Supabase Postgres (canonical schema via `supabase/migrations/`)
- **Package manager:** pnpm (v11, pinned via root `packageManager`) — do NOT use npm or yarn
- **Language:** TypeScript (strict mode, ES2022 target, bundler module resolution)
- **Testing:** Vitest — tests live in `__tests__/` directories, files named `*.test.ts`
- **AI:** OpenAI API (gpt-5.4-mini) — server-side only
- **Infrastructure:** Pulumi (GCP), CloudFormation (AWS)
- **Scanning:** Semgrep + custom regex rules engine

## Repository structure

```text
├── backend/           → Fastify runtime and service route modules
│   ├── src/services/  → Domain routes (auth, users, deploy, git, etc.)
│   └── src/shared/    → Auth, config, OpenAPI, Supabase client/types
├── code-analysis/     → Security rule assets (`rules/opengrep`)
├── infra/             → Infrastructure configuration
├── frontend/          → React SPA (separate package.json)
└── supabase/migrations/ → Canonical SQL migrations
```

## Service conventions

Fastify service route modules live under `backend/src/services/<domain>/routes.ts`.

### Key patterns

- **Database access:** Use Supabase via `backend/src/shared/supabase/client.ts` with typed payloads and explicit row-to-response mapping.
- **Secrets:** Local fallback in gitignored root `.env`. Production: Cloudflare Secrets Store (`pnpm secrets:push`, `LOAD_SECRETS_FROM=cloudflare`). Backend hosted on Railway — see `docs/operations/railway.mdx`.
- **Auth:** Supabase passwordless (OTP) → tenant-scoped JWT for API calls. Protected endpoints use the Fastify auth pre-handler from `backend/src/shared/auth.ts`. Optional TOTP 2FA.
- **Row mapping:** Database rows use snake_case. API responses use camelCase. Each service has a `rowToX()` mapper function.

### Dockerfile generation + AI review (legacy pipeline)

The **legacy** (`DEPLOY_PROVIDER=native`) deploy pipeline generates a Dockerfile during the analyze stage via `analyzeAndGenerate()` in `backend/src/lib/build-pipeline.ts`.

- **Mechanical generation is authoritative.** `analyzeRepoConfig()` detects the stack and `generateDockerfile()` (in `backend/src/lib/repo-analyzer/`) produces the Dockerfile from rule-based templates. This always runs.
- **Optional AI review layer** (`backend/src/lib/repo-analyzer/ai-review.ts`): after mechanical generation, `aiReviewDockerfile()` may ask OpenAI to improve the Dockerfile. It is **strictly best-effort and non-fatal** — any failure, timeout, invalid response, or rejected revision falls back to the mechanical Dockerfile. It NEVER throws and can never break a deploy.
- **Gating:** runs only when `OPENAI_API_KEY` is set AND `AI_DOCKERFILE_REVIEW !== "off"` AND the Dockerfile was mechanically generated (not when a user's own repo Dockerfile is used via `skipExistingDockerfile`).
- **Validation:** a proposed revision is accepted only if it starts with `FROM`, contains `EXPOSE`, is ≥50% of the original length, contains no secret patterns, and differs from the original (identical revisions are treated as approvals). See `validateRevision()`.
- **Prompt calibration:** the review prompt biases toward approval and revises only for concrete problems (unpinned base image, dependencies installed after copying all source, running as root, wrong build/start command, missing native packages, wrong `EXPOSE`, baked-in secrets). It must NOT make stylistic/cosmetic changes. The model is sensitive to prompt framing — **after changing the prompt or `OPENAI_MODEL`, re-run the live smoke test** (`pnpm --filter @dockier/backend-fastify smoke:ai-review`) to confirm it approves good Dockerfiles and only revises genuinely flawed ones.
- **Secrets:** only `.env.example` (variable names) and non-secret manifests are sent as context; `.env` is never read.
- **Visibility:** outcomes are logged via the deploy `ContextualLogger` (approved / revised-with-summary / skipped-with-reason) and surface in the deploy log stream. There is intentionally no frontend surface for this yet — a UI preview is tracked as Phase 2 in `.kiro/specs/ai-dockerfile-review/`.

### Dokploy deploy pipeline (active)

The primary deploy path (`DEPLOY_PROVIDER=dokploy`) delegates build and deployment to a self-hosted Dokploy instance. See `backend/src/services/deploy/domain/dokploy/`.

**Architecture:**
1. `POST /deploy/deployments` creates a deployment record and enqueues a pg-boss job.
2. The worker calls `executeDokployPipeline()` which coordinates five stages:
   - **Ensure Project** — Maps the Dockier tenant to a Dokploy Project (idempotent via upsert).
   - **Sync Git Credentials** — Prepares git provider config (GitHub/GitLab/custom SSH) for Dokploy.
   - **Provision Server** — Ensures a remote server is registered and healthy in Dokploy.
   - **Configure Application** — Creates/configures the Dokploy Application (build type, env vars, git source).
   - **Deploy with Retry** — Triggers the deploy, polls until done/error. On failure, invokes Dokploy's built-in AI to diagnose and fix issues, then retries (up to 3 attempts).

**Build type detection:** Automatically selects `dockerfile`, `static`, `railpack`, or `nixpacks` based on repo analysis — no user configuration needed.

**AI recovery:** Uses Dokploy's built-in AI (NOT OpenAI directly). Non-fatal — failures never block the pipeline.

**Feature flag:** `DEPLOY_PROVIDER` env var gates the pipeline. `"dokploy"` activates the new flow; `"native"` (default) keeps the legacy CloudFormation/Pulumi pipeline.

**Frontend wizard:** 4 steps — Provider → Analysis → Plan → Deploy. The Build step was removed (Dokploy handles build internally). The Deploy step shows a real-time vertical timeline of pipeline stages parsed from `[stage:xxx]` log markers.

**Key files:**
- `backend/src/services/deploy/domain/dokploy/pipeline.ts` — Orchestrator entry point
- `backend/src/services/deploy/domain/dokploy/client.ts` — Typed HTTP client (tRPC-over-HTTP, retries, error classification)
- `backend/src/services/deploy/domain/dokploy/mappings.ts` — DB operations (concurrency-safe upserts)
- `backend/src/services/deploy/domain/dokploy/stages/` — Individual pipeline stages
- `supabase/migrations/0068_dokploy_integration.sql` — Schema for `dokploy_tenant_projects`, `dokploy_servers`, `dokploy_applications`

## Database

- The active runtime uses `supabase/migrations/` as the canonical schema source.
- Migrations are plain SQL files with monotonic numeric prefixes (`0001_*.sql`, `0046_*.sql`, etc.).
- Postgres is hosted on Supabase; use Supavisor pooler URLs from the dashboard when IPv6 direct connections fail locally (`MIGRATE_URL` for DDL, `DATABASE_URL` for runtime/pg-boss).
- When writing migrations, always use `IF NOT EXISTS` for CREATE TABLE and `CREATE INDEX CONCURRENTLY` where possible.

## Frontend conventions

- Located in `frontend/` with its own `package.json` — run `pnpm install` there separately.
- React 19 with functional components and hooks only. No class components.
- Tailwind CSS v4 for styling. Dark mode is the default.
- Routing via `react-router-dom`.
- API calls go through `frontend/src/services/` — one file per backend service.
- Auth state managed via React Context (`frontend/src/context/`).
- Shared components in `frontend/src/components/`, page components in `frontend/src/pages/`.
- Shell layout uses `TopNavbar` (not a sidebar); main nav items in `frontend/src/config/nav.ts`.
- Settings pages use `settingsBadgeCls` from `frontend/src/utils/styles.ts` for status/category pills.
- Use TypeScript types from `frontend/src/types/`.

### List pages (Projects, Deployments, Security Scans)

- **Card/table toggle** in the page header (`GridIcon` / `Bars3Icon`), same UX on all three list pages.
- View preference persisted in `localStorage`:
  - `projects-view`
  - `deployments-view`
  - `security-scans-view`
- Table components live under each page’s `sections/` folder (`ProjectTable`, `DeployTable`, `ScanProjectTable`).
- Page hooks expose `viewMode` and `changeViewMode` (see `useProjects`, `useDeploy`, `useSecurityScans`).

### Tech badges on list pages

- Shared hook: `frontend/src/hooks/useProjectBadges.ts`
- Cache utilities: `frontend/src/utils/projectBadgeCache.ts`
  - `localStorage` cache per project (invalidated when repo, branch, or connection changes)
  - `selectProjectBadges()` returns top **4** items sorted by `confidence` (no whitelist filter)
- Data source: `GET /git/repo-badges` (see git-integration docs for resolution order)
- Cards and tables show up to 4 badges; tables may show 3 in the Tech column for layout
- `PlatformBadge` fallback when no tech badges are available

### Linting and Tailwind

- ESLint flat config: `frontend/eslint.config.js`
- Tailwind canonical classes: `eslint-plugin-better-tailwindcss` rule `better-tailwindcss/enforce-canonical-classes` (auto-fixable; entry point `src/index.css`)
- Commands: `cd frontend && pnpm lint` / `pnpm lint:fix`
- VS Code (`.vscode/settings.json`): ESLint fix-all on save; Tailwind IntelliSense canonical hints disabled to avoid duplicate warnings
- Prefer canonical theme tokens in class names (e.g. `rounded-card`, `shadow-(--shadow-card)`) over arbitrary `var(...)` forms

## Commands

```bash
# Backend
pnpm backend:dev              # Start backend
pnpm backend:typecheck        # Type-check backend
pnpm --filter @dockier/backend-fastify build
pnpm test                     # Run root Vitest tests
pnpm --filter @dockier/backend-fastify smoke:ai-review   # Live OpenAI smoke test for the Dockerfile AI review (needs OPENAI_API_KEY)

# Frontend
cd frontend && pnpm install   # Install frontend dependencies
cd frontend && pnpm dev       # Start frontend dev server (localhost:5173)
cd frontend && pnpm build     # Production build
cd frontend && pnpm lint      # ESLint (includes Tailwind canonical-class checks)
cd frontend && pnpm lint:fix  # ESLint with auto-fix (canonical Tailwind classes, etc.)
```

## Code style rules

- Use `const` by default, `let` only when reassignment is needed. Never use `var`.
- Prefer `async/await` over raw Promises.
- Keep DB payloads parameterized and validated; never interpolate untrusted user input.
- Error messages should be user-facing and descriptive (e.g., "Email already registered", not "duplicate key").
- Keep endpoint handlers thin — extract business logic into helper functions.
- Use early returns to reduce nesting.
- Type everything explicitly — avoid `any` unless interfacing with untyped external libraries.
- Imports: use `node:` prefix for Node.js built-ins (e.g., `import { join } from "node:path"`).

## Things to avoid

- Do NOT reintroduce Encore runtime files/config (`encore.service.ts`, `encore.app`, `encore.dev` imports).
- Do NOT add new dependencies without checking if an existing one covers the use case.
- Do NOT modify migration files that have already been applied — create new migration files instead.
- Do NOT put secrets, API keys, or credentials in code or config files — use environment variables.
- Do NOT use `npm` or `yarn` — this project uses `pnpm`.
- Do NOT import from `frontend/` in backend code or vice versa — they are separate packages.

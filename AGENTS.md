# AGENTS.md — Dockier

Instructions for AI coding agents working on this codebase.

## Project overview

Dockier is a developer platform that connects source code repositories to security scanning, AI-powered project analysis, deployment automation, and project management — all from a single dashboard. See `PRODUCT.md` for the full feature set and `DESCRIPTION.md` for goals, scope, non-goals, and success criteria.

**UX parity program:** In-app UX is aligned with the web design system in [`../web-berry/docs/design-guidelines.html`](../web-berry/docs/design-guidelines.html) (Dockier tokens: `dockier-*`, `dusk`, `cream`, `seed`; Bely/Soleil via Adobe Typekit). Delivery is tracked in Linear project *Dockier App — UX Parity & Hardening*; see `docs/delivery/multi-agent-playbook.md` for agent routing and quota guidelines.

## Tech stack

- **Backend:** Fastify + TypeScript (modular service routes in `backend/src/services`)
- **Frontend:** React 19 + Vite + Tailwind CSS v4 (in `frontend/`)
- **Database:** Supabase Postgres (canonical schema via `supabase/migrations/`)
- **Package manager:** pnpm (v10) — do NOT use npm or yarn
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

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
  - Core: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`, `DATABASE_URL`, `MIGRATE_URL`
  - Git integrations: `GITHUB_APP_*`, `GITLAB_APP_*`
  - AI: `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_DOCKERFILE_REVIEW`
  - Deploy (Dokploy): `DOKPLOY_API_URL`, `DOKPLOY_API_TOKEN`, `DOKPLOY_SSH_KEY_ID`, `DEPLOY_PROVIDER` (`"dokploy"` | `"native"`)
  - Deploy (legacy/AWS): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
  - Secrets bridge: `LOAD_SECRETS_FROM` (`"cloudflare"` to pull from Cloudflare Secrets Store at boot)
  - **Two tiers, deliberately.** Variables the Fastify process itself reads are declared in the zod schema in `backend/src/shared/config.ts` and reached through the validated `env` object — that is where defaults and format rules live, and the schema is the authoritative list for the running backend. Build- and ops-only variables are consumed *outside* the validated config (`MIGRATE_URL` by `infra/setup-external-db.sh`, `GITHUB_APP_*` / `GITLAB_APP_*` and `AWS_*` by git-integration and infra tooling, `LOAD_SECRETS_FROM` by the secrets bootstrap in `backend/src/shared/env/` which runs *before* validation and therefore cannot depend on it). They are intentionally **not** in the schema; do not force them in, since the backend would then validate variables it never reads through `env`. When adding a variable, put it in the schema only if the Fastify process reads it, and list it in `.env.example` either way.
- **Auth:** Supabase passwordless (OTP) → tenant-scoped JWT for API calls. Protected endpoints use the Fastify auth pre-handler from `backend/src/shared/auth.ts`. Optional TOTP 2FA.
- **Row mapping:** Database rows use snake_case. API responses use camelCase. Each service has a `rowToX()` mapper function.

### Platform hardening

Cross-cutting behaviour configured on the Fastify factory in `backend/src/app.ts` and in `backend/src/shared/http/`. Treat these as load-bearing — each one exists for a specific failure that already happened or was one refactor away.

- **`trustProxy: 1`** — numeric on purpose. It trusts only the LAST hop of `X-Forwarded-For`, so a client cannot spoof its address by prepending entries (which `true` would allow). `1` is Railway's single proxy hop; raise it only if another proxy layer is added. Without it `request.ip` is the proxy's address for every caller and the IP-keyed `rateLimit()` in `shared/http/rate-limit.ts` collapses into one global bucket. Covered by tests that inject `x-forwarded-for`.
- **Log redaction** — `shared/http/log-redaction.ts` provides `LOG_REDACT_PATHS` and `redactedReqSerializer`, wired into BOTH the Fastify request logger (`app.ts`) and the standalone worker logger (`shared/logger.ts`). Credential headers are censored and the `?token=` query param is masked, because the scan WebSocket route takes its JWT in the query string (browsers cannot set headers on a `WebSocket`) and Fastify logs full request URLs. Any new logger must reuse both exports.
- **Security response headers** — an `onSend` hook in `shared/http/openapi.ts` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and HSTS. Deliberately a hook rather than `@fastify/helmet`: four static headers do not justify the dependency. The `/docs` subtree is excluded so swagger-ui's own `staticCSP` applies, and an existing header is never clobbered. No CSP — this is a JSON API and a wrong policy would break the docs UI.
- **Request ids** — `requestIdHeader: "x-request-id"` with a `randomUUID()` fallback, so a trace started by the frontend or a load balancer survives the backend boundary. Fastify's default per-process counter restarted on every deploy and collided across split service instances. `request.id` flows into pg-boss as `correlationId` (see `shared/database/queue.ts`), so worker logs join up with the originating request.
- **Health vs readiness** — `GET /healthz` is liveness and is a static literal; existing platform probes depend on its exact payload, so do not change it. `GET /readyz` is readiness and reports `isQueueReady()` (200 `ready` / 503 `degraded`), because `run-server.ts` tolerates a failed queue start by design and serves traffic anyway — a state `/healthz` cannot express. `/readyz` is intentionally NOT wired to a platform probe: failing closed would pull traffic from an instance that is still serving HTTP correctly.
- **Job retries** — `createWorker` in `shared/database/queue.ts` sets `retryBackoff` with a 30s base delay. pg-boss defaults `retryDelay` to 0, which fired every attempt within seconds of the first and was useless against the failures that dominate here (rate-limited provider APIs, briefly-down dependencies). There is still no dead-letter queue: an exhausted job is logged and dropped.

### Deploy hook authentication

`POST /projects/:projectId/deploy/hook` (`backend/src/services/deploy/routes/git-push-webhook.ts`) accepts **two** token forms, and both must keep working:

1. A cryptographically random per-project token stored in the existing `projects.settings` jsonb column (no dedicated column, no migration).
2. The legacy `projectId.slice(0, 8)` prefix, kept as a fallback because hook URLs are already deployed in the wild.

Form 2 is not real authentication — it is derived from the `projectId` in the request path, so anyone who can build the URL can compute it. It survives only for backward compatibility; never present it as a security control, and do not extend the pattern to new routes. The route is rate-limited (5/min) because it is an unauthenticated path into the most expensive operation in the product. Tokens are compared with `timingSafeEqual`, mirroring `verifyWebhookSignature` in `shared/http/security.ts`.

The response shape is deliberately `200 { success: false }` on a bad token rather than a `401`. That is worse REST but a client may depend on it; changing it is a contract break.

The sibling route `POST /deploy/webhook/git-push` is different — it is protected by `requireWebhookSignature` and is the pattern to copy for new webhooks.

### Custom domains for static deployments

Two unrelated things in this repo are called "static". Do not conflate them — it wastes a lot of time:

- **The `static` *deploy strategy*** (`deployStrategy: "vps" | "managed" | "static"`). Publishes a built site to object storage behind a CDN, bypassing Dokploy entirely (`deploy/domain/worker.ts` routes it to `executePipeline` regardless of `DEPLOY_PROVIDER`). Adapters: `adapters/aws-s3.ts` (S3 + CloudFront) and `adapters/gcp-storage.ts` (GCS + Cloud CDN). **This** is what custom-domain support below refers to.
- **Dokploy's `static` *build type*** (`stages/configure-app.ts`). A flag inside the Dokploy pipeline, currently unreachable because `pipeline.ts` hardcodes `isStaticSite: false`. Real static sites on Dokploy build with railpack and `kind: "static"`.

The domains service has **three** branches, selected in `domains/domain/applier.ts` in this order: Dokploy → static → legacy VPS nginx/certbot. The static branch lives in `domains/domain/static/` (`target.ts` resolves the CDN handle, `aws.ts` and `gcp.ts` are the per-cloud reconcilers, `apex.ts` and `certs.ts` are shared).

- **AWS (S3 + CloudFront).** ONE multi-SAN ACM certificate per project, because a distribution has exactly one `ViewerCertificate`. ACM certificates are immutable in their name list, so a changed domain set means a new certificate and a swap. Always requested in **us-east-1** — CloudFront accepts no other region, whatever region the stack lives in. The certificate is driven through the ACM **API**, not CloudFormation: `AWS::CertificateManager::Certificate` blocks stack creation until validation completes and never exposes the validation CNAME, so an interactive "publish this record" flow is impossible with it. The user publishes a validation CNAME plus a routing CNAME to the distribution domain. **Apex domains are refused unless the user has acknowledged** that their DNS provider supports ALIAS/ANAME/CNAME flattening, in which case the attachment proceeds and `verifyDomainDns` verifies it through the flattening fallback. The refusal fires at the moment the domain is added (`domains/routes.ts`, carrying `code: "apex_requires_ack"`), with the reconcile in `static/aws.ts` as a backstop for rows created by any other path; the acknowledgement lives in `projects.settings.apexAliasAck` and is pruned on domain delete so a re-add explains itself again. A blanket refusal would be wrong: Route 53 A-ALIAS and Cloudflare flattening both reach a CloudFront alias, and GCP serves an apex natively — see `.kiro/specs/custom-domain-ux/` decision D1.
- **GCP (GCS + Cloud CDN).** ONE Google-managed certificate per domain set, named from a hash of that set (same immutability constraint). The HTTPS front end — managed certificate, target HTTPS proxy, `:443` forwarding rule — is created over **Compute REST**, reusing the existing url map and global anycast IP. Not Pulumi: the program is frozen at plan time so a later domain change has no workspace to re-run, and the Pulumi CLI is not in `backend/Dockerfile`. Ordering is the **opposite** of AWS — the front end must exist first, because Google validates by reaching the load balancer over HTTP at the domain, so the A record must be live before the certificate can go ACTIVE (15-60 min). **Apex works normally** thanks to the dedicated anycast IP. Because these resources are not in the Pulumi state, `GcpStorageAdapter.destroy()` removes them explicitly via `teardownGcpStaticHttps` or the `:443` rule survives teardown and keeps billing.
- **`verifyDomainDns` is per-cloud.** CNAME against the distribution domain for AWS (an A-record check returns rotating CloudFront edge IPs that can never match, and would tell the user to fix the wrong record type), A record against the persisted `cdnIp` for GCP. There is an ALIAS-flattening fallback for AWS so a correctly configured apex is not reported as broken.
- **Redeploy must preserve domains.** `AwsS3Adapter` reads the project's domains and passes `DomainAliases`/`CertificateArn` through; empty values would make CloudFormation strip the aliases off the distribution and take a working domain offline on an unrelated push. Aliases are only sent together with an issued certificate — CloudFront rejects a distribution with aliases but the default certificate.
- **Certificate state** lives on `ssl_certificates` (migration `0075`): `provider_ref`, `validation_record`, `verification_state`, `verification_message`, `attach_started_at`, and the `type` CHECK widened to include `acm` and `gcp_managed`. The CDN handle (`distributionId`, `distributionDomain`, `cdnIp`, `staticBucket`) lives on `InfraMetadata` in the existing `deployments.infra` jsonb — no migration.
- **Never block a job on a CDN update.** A CloudFront distribution update takes 5-20 minutes and `config-apply` jobs expire well before that; the update is started and observed later.
- A site deployed before this feature needs **one redeploy** before a domain can attach, because its stack predates the `DomainAliases`/`CertificateArn` parameters. The error message says so explicitly.

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

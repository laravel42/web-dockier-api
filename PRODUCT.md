# Dockier — Product Overview

Dockier is a developer platform that connects source code repositories to automated security scanning, AI-powered project analysis, deployment automation, and team management — all from a single dashboard.

Built for small-to-mid-size teams that need to ship secure code without a dedicated AppSec function or a patchwork of disconnected tools.

---

## Core capabilities

### Project & repository management

- Connect **GitHub**, **GitLab** (cloud + self-hosted), and **Bitbucket** via personal access tokens.
- Create **projects** linked to a repo and branch; view tech stack badges (top 4 by confidence), recent commits, scans, and deploys.
- **Projects**, **Deployments** (`/deploy`), and **Security Scans** list pages support **card/table toggle**; view preference is stored in `localStorage`.

### AI-powered project analysis

- Generates an eight-section overview using **OpenAI gpt-5.4-mini**: Overview, How It Works, Tech Stack, Architecture, Data & Storage, Code Quality, Security, Deployment.
- Tabbed editor on the project detail page; results cached in Postgres keyed by repo + branch + commit SHA.
- Refresh on demand when the branch advances.

### Sensitive data detection

- **Code-based scanner** (no AI): SQL migrations, Prisma schemas, Eloquent models, TypeScript interfaces, Python classes.
- Classifies fields as personal, sensitive, or secret; interactive sidebar on the project detail page.

### Dependency vulnerability scanning

- Parses `package.json`, `composer.json`, `requirements.txt`, and `Gemfile`.
- Checks versions against the [OSV.dev](https://osv.dev) batch API (free, no API key).
- Filterable by production / dev / vulnerable; severity-grouped findings.

### Security scanning (SAST)

- **Semgrep** community rules (30+ languages).
- Optional **SonarQube** integration.
- Built-in **custom regex rules engine** (30+ rules): SQLi, XSS, command injection, weak crypto, path traversal, and more.
- Scan detail view with findings list, severity badges, Fix-with-AI flow, and issue/MR creation.

### AI-assisted remediation

- Generate fix suggestions from findings via OpenAI.
- Preview diffs and open **merge requests** (GitHub PR / GitLab MR / Bitbucket PR) with reviewer assignment.
- Create **issues** in connected PM tools from findings with AI-generated titles and severity-mapped priority.

### Issue tracking integrations

Supported PM adapters include **Jira**, **Linear**, **Asana**, **GitHub Issues**, **GitLab Issues**, **ClickUp**, **Monday.com**, **Notion**, **Todoist**, and **Basecamp**.

Configure integrations in **Settings → Integrations** (catalog grouped by category: Database, Storage, Mail, CRM, DevOps, etc.).

### Deployment automation

- **Repo analyzer** detects runtime, framework, and package manager; generates optimized multi-stage **Dockerfiles** (Node, PHP, Python, Go — with framework-specific handling).
- Failed builds can be auto-patched and retried (up to 3 attempts).
- **AWS:** ECS (managed) via CodeBuild → ECR → CloudFormation.
- **GCP:** Cloud Run (managed), Compute Engine (VPS), Cloud Storage + CDN (static) via Pulumi + Artifact Registry.
- Deploy wizard: provider selection, env vars, post-deploy commands, strategy selection.
- Status tracking: pending → building → deploying → success / failed / destroyed.
- One-click infrastructure teardown (Pulumi state for GCP; CloudFormation stack deletion for AWS).

### Notifications

- Channels: **email**, **Slack**, **webhook**, **in-app** (default channel seeded).
- In-app dropdown with rich metadata (branch, commit, deploy/scan context); mark-as-read with slide-away animation.
- Full notifications page at `/notifications`.

### Authentication & access control

- **Supabase Auth** passwordless sign-up and sign-in (email OTP / magic link).
- Backend issues a **tenant-scoped JWT** after verification; API protected via Fastify auth pre-handler.
- Optional **TOTP 2FA** (`/auth/2fa/setup`, `/auth/2fa/enable`).
- **Multi-tenant organizations** with membership management, tenant switch, and ownership transfer.
- **Custom roles** per organization (default Admin/Member seeded) with **30+ granular permissions** (`project:view`, `deploy:create`, `scan:run`, `credential:manage`, …).
- Organization **owner** has elevated capabilities (billing, org delete, ownership transfer) enforced separately from role permissions.
- Dev-only helpers: password login and demo login (disabled in production).

### Dashboard & navigation

- **Top navbar** layout (Dashboard, Projects, Security, Settings) with theme toggle and notification bell.
- KPI cards and recent deploys / recent scans panels.
- **Settings** tabs: Profile, Users, Roles, Providers, SSH Keys, Source Control, Notification Channels, Integrations, Security Tools — visibility gated by permissions.

---

## Project detail page

- Repository header with branch, commit, tech badges, and branch switcher.
- **Overview** tabs: AI sections, Sensitive Data, Dependencies, Deployments.
- KPI strip: stars, forks, issues, watchers, commits, contributors, languages.
- Recent commits, recent deploys, recent scans, contributors grid, last deploy card with destroy action.

---

## Technical architecture

| Layer | Stack |
| ----- | ----- |
| Backend | Fastify + TypeScript, modular services under `backend/src/services/*` |
| Frontend | Vite, React 19, Tailwind CSS v4, react-router-dom, shadcn/ui primitives |
| Database | Supabase Postgres; typed access via `@supabase/supabase-js` |
| Auth | Supabase Auth (passwordless) + app JWT + RLS on tenant tables |
| AI | OpenAI API (gpt-5.4-mini), server-side only, JSON response format |
| Scanning | Semgrep + optional SonarQube + custom regex engine |
| Vulnerabilities | OSV.dev batch API |
| Builds | Auto-generated Dockerfiles; Railpack/Nixpacks available as alternatives |
| Infrastructure | Pulumi (GCP), CodeBuild + CloudFormation (AWS) |
| Jobs | pg-boss (Postgres-backed queue) for deploy/scan/notification workers |
| Hosting | Railway (API), Cloudflare Pages (SPA), Cloudflare Secrets Store |

**Backend services (gateway):** `auth`, `users`, `projects`, `roles`, `deploy`, `notifications`, `integrations`, `code-analysis`, `git-integration`, `image-builder`.

**API contracts:** Runtime OpenAPI at `/docs` and `/docs/json`; Mintlify docs in `docs/`.

**Migrations:** Single source of truth in `supabase/migrations/` (see `legacy-index.md` for historical mapping).

---

## License

MPL-2.0

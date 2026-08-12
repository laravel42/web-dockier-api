# Product

<!-- impeccable:product-schema 1 -->

Dockier is a developer platform that connects source code repositories to automated security scanning, AI-powered project analysis, deployment automation, and team management — all from a single dashboard.

---

## Platform

web

Desktop browser is the primary scene, but **full responsiveness is a confirmed goal**, including phone widths. The earlier "desktop-first SPA, no responsive mobile layout" non-goal in `DESCRIPTION.md` is superseded and should not be treated as binding.

---

## Users

**Primary — the developer on a small team.** Works on a team of roughly 2–15 engineers with no dedicated AppSec function. Sits in a browser between a Git host, a scanner, a cloud console, and an issue tracker, and loses time to the seams between them. Their job: connect a repo, understand what is in it, find out what is unsafe, fix it, and get it deployed — without authoring a config file, installing a CLI, or writing a Dockerfile.

**Secondary — the engineering lead.** Needs cross-project visibility into security posture, deployment status, and team activity without standing up a separate reporting tool. Their job is triage and oversight, not authoring.

Personas and jobs are documented externally in Linear (see *Evidence on Hand*).

---

## Product Purpose

Give a small engineering team one dashboard that replaces the patchwork of disconnected AppSec, CI, and deployment tools they otherwise juggle.

Success means:

- A new user reaches their first security scan in **under 5 minutes**, with zero configuration files.
- A vulnerability finding becomes a merge request with an AI-generated fix in **three clicks or fewer**.
- A developer deploys to AWS or GCP **without writing or maintaining a Dockerfile**.
- A lead sees security, deploy, and activity posture across all projects without a separate reporting tool.

---

## Positioning

The differentiating mechanism is the **unbroken path from repository to shipped fix, with nothing for the user to configure.**

Two parts of that are hard for a neighboring product to truthfully copy:

1. **Deployment with no build authoring at all.** A repo analyzer detects runtime, framework, and package manager, then generates an optimized multi-stage Dockerfile tailored to the detected stack. When a build fails, Dockier patches the Dockerfile and retries automatically, up to three attempts. The user never sees, writes, or maintains a Dockerfile — and because generation is provider-agnostic, adding a cloud provider requires no change to project configuration.
2. **Findings that terminate in a shipped change, not a report.** A finding carries through AI fix generation, diff preview, and a real merge request on the connected Git host — or an issue in the team's own PM tool with severity-mapped priority.

Scanners that only report, and deploy tools that only build, each solve one half. The position is the join.

---

## Operating Context

- **Where the work happens:** a browser dashboard. Code stays on GitHub, GitLab (cloud + self-hosted), or Bitbucket; Dockier connects via personal access tokens and never hosts repos.
- **Scanning is manual and on-demand.** There is no cron, no webhook trigger, and no scan-on-deploy gate. The user decides when a scan runs, which makes the scan-launch and scan-result surfaces high-traffic rather than incidental.
- **Results are consumed asynchronously.** Scan and deploy outcomes arrive over email, Slack, webhook, and in-app notification, so users frequently enter a surface from a notification rather than from navigation.
- **Deploys are long-running and stateful.** Status moves pending → building → deploying → success / failed / destroyed. Users watch, leave, and return, so progress and terminal states must be legible on re-entry.
- **Work spans providers the user already pays for:** AWS (ECS via CodeBuild → ECR → CloudFormation) and GCP (Cloud Run, Compute Engine, Cloud Storage + CDN via Pulumi + Artifact Registry), plus their existing PM tool among Jira, Linear, Asana, GitHub/GitLab Issues, ClickUp, Monday.com, Notion, Todoist, and Basecamp.

---

## Capabilities and Constraints

### Confirmed constraints

- **Tenancy is flat.** A single `tenantId` scope (app_id model) carries membership and roles; there is no org hierarchy, no cross-org sharing, and no SSO/SAML. Design should not imply nesting, org switching between parents, or federated identity. Membership and 30+ granular `resource:action` permissions operate *within* one flat scope.
- **Responsiveness is required** down to phone widths (see *Platform*).
- **AI is server-side and fixed.** OpenAI `gpt-5.4-mini`, JSON response format, no user-facing model selection, no fine-tuning, no local LLMs.
- **Static analysis only.** SAST and dependency (SCA) scanning. No DAST, IAST, or container image scanning.
- **Not a CI/CD engine.** No pipeline definitions, conditional steps, or matrix builds. It is a deploy button.
- **Degradation is a requirement, not a nicety.** Scans must still return custom-regex results when Semgrep or SonarQube are unavailable, and AI features must return fallback states rather than crashing when the OpenAI key is missing or the API fails after retries.
- **Explicitly out of scope:** Git hosting, scheduled/event-driven scanning, runtime security monitoring, compliance/audit mapping, billing and payment processing, OAuth social login, cloud providers beyond AWS and GCP, self-hosted distribution, and monorepo-aware per-package scanning.

### Capability catalog

**Project & repository management.** Connect GitHub, GitLab (cloud + self-hosted), and Bitbucket via PATs. Projects link a repo and branch; tech stack badges show the top 4 by confidence, alongside recent commits, scans, and deploys. Projects, Deployments (`/deploy`), and Security Scans list pages support a card/table toggle, persisted in `localStorage`.

**AI-powered project analysis.** Eight-section overview (Overview, How It Works, Tech Stack, Architecture, Data & Storage, Code Quality, Security, Deployment) generated by OpenAI, presented in a tabbed editor on the project detail page, cached in Postgres keyed by repo + branch + commit SHA, refreshed on demand when the branch advances.

**Sensitive data detection.** Code-based scanner with no AI cost, parsing SQL migrations, Prisma schemas, Eloquent models, TypeScript interfaces, and Python classes. Classifies fields as personal, sensitive, or secret; surfaced in an interactive sidebar.

**Dependency vulnerability scanning.** Parses `package.json`, `composer.json`, `requirements.txt`, and `Gemfile`; checks against the OSV.dev batch API (free, no key). Filterable by production / dev / vulnerable, with severity-grouped findings.

**Security scanning (SAST).** Semgrep community rules across 30+ languages, optional SonarQube, and a built-in custom regex engine of 30+ rules covering SQLi, XSS, command injection, weak crypto, and path traversal. Scan detail view carries findings, severity badges, the Fix-with-AI flow, and issue/MR creation.

**AI-assisted remediation.** Fix suggestions from findings, diff preview, and merge requests (GitHub PR / GitLab MR / Bitbucket PR) with reviewer assignment. Issues created in connected PM tools with AI-generated titles, severity-mapped priority, and effort estimates.

**Deployment automation.** Repo analyzer detects runtime, framework, and package manager and generates multi-stage Dockerfiles (Node, PHP, Python, Go, with framework-specific handling for Next.js, Nuxt, Laravel, Django, SvelteKit, Angular, Astro and more). Failed builds auto-patch and retry up to 3 times. Deploy wizard covers provider selection, env vars, post-deploy commands, and strategy. One-click teardown uses Pulumi state for GCP and CloudFormation stack deletion for AWS.

**Notifications.** Email, Slack, webhook, and in-app channels (in-app seeded by default). In-app dropdown carries rich metadata (branch, commit, deploy/scan context) with mark-as-read; full page at `/notifications`. Async delivery via pg-boss when `DATABASE_URL` is configured.

**Authentication & access control.** Supabase passwordless sign-up/sign-in via email OTP, then a tenant-scoped JWT for API calls. Optional TOTP 2FA. Custom roles per tenant (Admin/Member seeded) with 30+ granular permissions gating both API routes and Settings UI tabs. Owner holds elevated capabilities enforced separately from role permissions. Dev-only password and demo login, disabled in production.

**Dashboard & navigation.** Top navbar shell (Dashboard, Projects, Security, Settings) with theme toggle and notification bell. KPI cards plus recent deploys and recent scans panels. Settings tabs: Profile, Users, Roles, Providers, SSH Keys, Source Control, Notification Channels, Integrations, Security Tools — visibility gated by permission.

**Project detail page.** Repository header with branch, commit, tech badges, and branch switcher. Overview tabs for AI sections, Sensitive Data, Dependencies, and Deployments. KPI strip for stars, forks, issues, watchers, commits, contributors, and languages, plus recent commits, deploys, scans, a contributors grid, and a last-deploy card with destroy action.

---

## Brand Commitments

- **Name:** Dockier. **License:** MPL-2.0.
- **Shipped visual truth (binding).** The implemented system in `frontend/src/index.css` is the authority: a **graphite** neutral base with a **sand/ochre** primary accent, carrying `dusk`, `cream`, and `seed` token scales. Type is **Space Grotesk** across sans, display, heading, and mono roles. Theming is token-driven with `data-theme` light and dark variants.
- **Berry is legacy.** The `dockier-50…900` red scale is retained for **severity states and marketing accents only**, not as the product's primary identity.
- **Superseded:** the note in `AGENTS.md` describing UX parity with the sibling `web-berry` design system — Bely/Soleil via Adobe Typekit, berry as the primary world — no longer reflects the product. That sibling repository is not accessible from this checkout, and the shipped implementation deliberately moved to the graphite + sand/ochre admin world. Confirmed with the product owner; `AGENTS.md` needs a corresponding correction.
- Built on shadcn/ui primitives with Tailwind CSS v4.

---

## Evidence on Hand

**Real, in-repo:**

- `DESCRIPTION.md` — goals, scope, non-goals, success criteria (note the two superseded non-goals recorded above).
- `README.md` — capability table and architecture map. `AGENTS.md` — agent conventions (design-system note is stale).
- `code-analysis/rules/` — the actual Semgrep/OpenGrep rule assets.
- `supabase/migrations/` — canonical SQL schema, monotonic numeric prefixes.
- Runtime OpenAPI at `/docs` and `/docs/json`; Mintlify documentation in `docs/`.
- `frontend/src/index.css` — the implemented token system (723 lines).

**External source documents (Linear, `laravel42` workspace):** [Product Overview](https://linear.app/laravel42/document/product-overview-5c898dd49c17) · [PRD](https://linear.app/laravel42/document/prd-710dbbdf3b1d) · [Scope](https://linear.app/laravel42/document/scope-2fb25a140042) · [Personas and Jobs](https://linear.app/laravel42/document/personas-and-jobs-397467d08d0d) · [Dockier project](https://linear.app/laravel42/project/dockier-601560e613cd/overview).

**Absences future work must not fabricate:** there are no testimonials, no named customers or logos, no case studies, no press, no benchmark numbers, no pricing or plan tiers, and no usage metrics on hand. Billing contact details may be stored for invoicing context, but there is no subscription flow, plan-based gating, or metering — so no pricing surface may imply one. No confirmed logo asset was located in this checkout.

---

## Product Principles

1. **Zero configuration is the product, not a feature of it.** Any capability that requires the user to write YAML, install a CLI, or author a Dockerfile has failed the brief. This is the promise the whole platform is sold on.
2. **A finding is worthless until it ends in a shipped change.** Design every finding surface toward its terminal action — a merge request or a tracked issue — never toward a report the user must act on elsewhere.
3. **One pane, no context-switching.** The reason to use Dockier is that the seams between five tools disappear. Any flow that sends the user to a provider console or Git host to finish a job erodes the core value.
4. **Degrade, never crash.** Scanners run without Semgrep or SonarQube; AI surfaces return fallback states without an API key. Partial results beat an error page, and every surface needs a designed degraded state.
5. **Permission is explicit and flat.** One tenancy scope, 30+ granular permissions, enforced on API routes and reflected by hiding unauthorized UI. Never imply hierarchy or capability the permission model does not grant.

---

## Accessibility & Inclusion

**No formal conformance target has been confirmed** — this is an open decision, not an established requirement, and should be settled before it becomes expensive to retrofit.

What the implementation already establishes as de facto baseline:

- `prefers-reduced-motion` is honored in `frontend/src/index.css`.
- ARIA attributes and explicit roles are in active use across the React surfaces.
- Light and dark themes are both first-class via `data-theme`, so contrast must hold in both.
- Full responsiveness to phone widths is a confirmed requirement (see *Platform*), which makes touch target sizing and reflow real constraints rather than aspirations.

---

## Technical Architecture

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

**Migrations:** Single source of truth in `supabase/migrations/` (see `legacy-index.md` for historical mapping).

---

## License

MPL-2.0

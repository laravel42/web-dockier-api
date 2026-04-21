# Dockier

Dockier is a developer platform that connects source code repositories to automated security scanning, AI-powered project analysis, deployment pipelines, and project management — all from a single dashboard.

## What It Does

- **Project Management** — Connect GitHub, GitLab, or Bitbucket repositories and organize them as projects with branch tracking, tech stack detection, recent commits, and deployment status.

- **AI-Powered Project Analysis** — Generates comprehensive project documentation using OpenAI (gpt-5.4-mini): architecture, tech stack, deployment guides, security considerations, and code quality insights. Organized in a tabbed interface with 7 sections (Overview, How It Works, Architecture, Data & Storage, Code Quality, Security, Deployment) plus Dependencies and Sensitive Data tabs. Cached per commit, refreshable on demand.

- **Sensitive Data Scanner** — Upload a SQL schema file for AI-powered analysis that detects credentials, PII, financial data, auth tokens, health records, and location data. Results cached in DB per project. Falls back to static regex parsing when AI is unavailable.

- **Dependency Vulnerability Scanner** — Parses package.json, composer.json, requirements.txt, and Gemfile. Checks each dependency against the OSV.dev vulnerability database. Lists versions, status, and vulnerabilities by severity. Filterable by production/dev/vulnerable.

- **Security Scanning** — Automated code analysis powered by Semgrep (1935 built-in rules stored in DB) and a custom regex rules engine. Detects SQL injection, XSS, command injection, weak cryptography, path traversal, and more across PHP, JavaScript, TypeScript, Python, Go, Java, Ruby, and 20+ languages. Rules are editable via YAML editor in the UI.

- **AI-Assisted Remediation** — Generate fix merge requests from scan findings using OpenAI. Assign reviewers and track fixes without leaving the platform.

- **Issue Tracking** — Create issues in GitHub, GitLab, or Bitbucket directly from security findings with AI-generated titles and effort estimates. Supports assignees.

- **Deployment Automation** — Configure server providers (AWS) and trigger deployments tied to branches and commits. Track deployment history with status, provider, strategy, app URL, and docker image.

- **Notifications** — Multi-channel alerting via email, Slack, webhooks, and in-app notifications.

- **Authentication & Access Control** — JWT-based auth, two-factor authentication (TOTP), role-based permissions (Admin/Viewer + custom roles), and per-feature permission gating in the UI.

## Architecture

**Backend:** 10 microservices built with Encore.ts, sharing a single PostgreSQL database via `lib/db.ts`:

| Service | Endpoints | Purpose |
|---|---|---|
| auth | 6 | Login, register, 2FA, JWT auth handler |
| users | 5 | User CRUD with password hashing |
| roles | 5 | Role CRUD with permission arrays |
| projects | 5 | Project CRUD with branch/connection tracking |
| git-integration | 19 | Git provider connections, repo analysis, AI analysis, sensitive data, commits, branches, issues |
| code-analysis | 14 | Security scans, findings, custom rules, semgrep rules (DB-backed), rule overrides |
| deploy | 10 | Server providers, deployments, SSH keys, tofu generation |
| image-builder | 6 | Docker builds via AWS CodeBuild |
| notifications | 7 | Channels, notifications, mark read |
| integrations | 4 | PM tool integration (Jira, Linear) |

**Frontend:** React 19 + Vite + Tailwind CSS v4. Dark mode default. Extracted components (Sidebar, Toolbar, Spinner, Modal, ComboBox). Centralized types in `frontend/src/types/`. Session-cached analysis. Permission-gated navigation and actions.

**Database:** 21 tables managed via `prisma/migrations/` (one SQL file per table). Seeders in `prisma/seeders/` including 1935 Semgrep rules loaded from CSV. Scripts: `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`.

**AI:** OpenAI gpt-5.4-mini with `response_format: { type: "json_object" }`, `temperature: 0`, `max_completion_tokens`. Used for project analysis (7 parallel section calls), sensitive data analysis, fix generation, and finding summarization.

**Security Scanning:** Semgrep CLI (installed via pip postinstall, gracefully skipped if unavailable). 1935 built-in YAML rules stored in `semgrep_rules` DB table. Custom regex rules in `custom_rules` table. During scans, enabled rules are written to a temp directory for the Semgrep CLI.

## Testing

- 48 unit tests (tech stack detection, dependency scanning, sensitive data, badge whitelist, markdown)
- 47 API smoke tests covering all 93 endpoints against a running Encore instance
- Run: `pnpm test` (requires `encore run` for smoke tests)

## License

MPL-2.0

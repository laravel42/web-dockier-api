# Dockier

Dockier is a developer platform that connects your source code repositories to automated security scanning, AI-powered project analysis, deployment pipelines, and project management — all from a single dashboard.

## What It Does

Dockier brings together the tools developers need to ship secure code faster:

- **Project Management** — Connect GitHub, GitLab, or Bitbucket repositories and organize them as projects with branch tracking, tech stack detection, recent commits, recent deploys, and deployment status at a glance.

- **AI-Powered Project Analysis** — Automatically generates a comprehensive project overview using OpenAI (gpt-5.4-mini), including architecture documentation, tech stack breakdown, deployment guides, security considerations, and code quality insights — organized in a tabbed Notion-style interface with 8 sections (Overview, How It Works, Tech Stack, Architecture, Data & Storage, Code Quality, Security, Deployment). Analysis is cached per commit and refreshable on demand.

- **Sensitive Data Scanner** — Code-based scanner (no AI) that parses SQL migrations, Prisma schemas, PHP Eloquent models, TypeScript interfaces, and Python classes to detect personal, sensitive, and secret data fields. Classifies fields by sensitivity level (personal, sensitive, secret) and groups them by entity in an interactive sidebar view.

- **Dependency Vulnerability Scanner** — Parses `package.json`, `composer.json`, `requirements.txt`, and `Gemfile` to extract all dependencies. Checks each against the [OSV.dev](https://osv.dev) vulnerability database (free, no API key). Lists dependencies with version, status, ecosystem, repository link, and vulnerabilities grouped by severity (critical, high, medium, low). Filterable by production/dev/vulnerable.

- **Security Scanning** — Run automated code analysis powered by Semgrep, SonarQube, and a built-in custom rules engine. Scans detect SQL injection, XSS, command injection, weak cryptography, path traversal, and dozens of other vulnerability classes across PHP, JavaScript, TypeScript, Python, Go, Java, Ruby, and more.

- **AI-Assisted Remediation** — Generate fix merge requests directly from scan findings using OpenAI-powered code suggestions. Assign reviewers and track fixes without leaving the platform.

- **Issue Tracking Integration** — Create issues in Jira, Linear, or other project management tools directly from security findings, with AI-generated titles, severity-based priority mapping, and effort estimates.

- **Deployment Automation** — Configure server providers (AWS, GCP) and trigger deployments tied to specific branches and commits. Track deployment history per project with recent deploys list showing status, provider, strategy, app URL, and docker image.

- **Notifications** — Multi-channel alerting via email, Slack, webhooks, and in-app notifications for scan results, deployments, and other events.

- **Authentication & Access Control** — User registration, JWT-based auth, two-factor authentication (TOTP), social login (GitHub, GitLab, Bitbucket), and role-based permissions with group management.

## Project Detail Page

Each project has a rich detail page featuring:

- **Repository info** with branch, last commit (hash, author, time ago), and tech stack badges (filtered to frameworks/CMS/UI kits via an editable whitelist)
- **Project Overview** — Tabbed AI-generated documentation with 8 sections plus Sensitive Data and Dependencies tabs
- **KPI Dashboard** — Stars, forks, open issues, watchers, commits, contributors, and language breakdown with percentage bars
- **Contributors Grid** — Top contributors with avatars and commit counts
- **Recent Commits** — Last 5 commits with author, message, hash, and relative time
- **Recent Deploys** — Last 5 deployments with status badge, provider badge, strategy, docker image, app URL link, and view details
- **Last Deploy Card** — Detailed view of the most recent deployment with destroy capability

## Architecture

Dockier is built as a set of microservices using [Encore.ts](https://encore.dev) on the backend and React with Tailwind CSS on the frontend.

**Backend services:** Auth, Users, Groups, Roles, Projects, Git Integration (with AI analysis, sensitive data scanner, dependency scanner, tech stack detection), Code Analysis, Notifications, Deploy, Image Builder, and Integrations.

**Frontend:** Single-page React app (Vite + React 19 + Tailwind CSS v4) with dark mode default, portal-based dropdown selects, session-cached analysis, and shared badge components (SensitivityBadge, StatusBadge, TechBadge, ProviderBadge, SourceControlBadge).

**AI Integration:** OpenAI API (gpt-5.4-mini) with server-side API key (`OpenAIApiKey` Encore secret). Used for project analysis (sections, deploy options) and security fix generation. Response format enforced as `json_object`. Results cached in PostgreSQL `analysis_cache` table keyed by repo + branch + commit SHA.

**Vulnerability Scanning:** Dependencies checked against [OSV.dev](https://osv.dev) batch API. Sensitive data detected via pattern matching on field names from migrations and models — no AI credits consumed.

## License

MPL-2.0

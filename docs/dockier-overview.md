# Dockier

## Introduction

Dockier is a developer platform that gives engineering teams a single dashboard to connect source code repositories, scan for security vulnerabilities, understand projects through AI-powered analysis, and deploy to the cloud — eliminating the patchwork of disconnected tools teams juggle today.

Built for small-to-mid-size teams (2–15 engineers) that need to ship secure code without a dedicated AppSec function, Dockier reduces the time from "found a problem" to "shipped the fix" by integrating scanning, remediation, and deployment into one cohesive workflow.

Dockier is not another CI/CD pipeline. It is a deploy button backed by intelligent automation: zero-config security scanning, AI-generated Dockerfiles, and managed cloud infrastructure — all accessible from a single project view.

---

## Overview of Services

### 1. Project & Repository Management

Connect GitHub, GitLab (cloud + self-hosted) repositories via personal access tokens. Each project is linked to a specific repo and branch, providing a unified view of tech stack, recent commits, security posture, and deployment status.

### 2. AI-Powered Project Analysis

Dockier generates an eight-section project overview using OpenAI (gpt-5.4-mini):

- Overview
- How It Works
- Tech Stack
- Architecture
- Data & Storage
- Code Quality
- Security
- Deployment

Results are cached per commit SHA — no redundant API calls on repeat visits. Analysis refreshes automatically when the branch advances.

### 3. Security Scanning (SAST + SCA)

Multi-engine static analysis combining:

- **Semgrep/Opengrep** — community rules covering 25+ languages
- **Custom regex engine** — 34 built-in rules targeting OWASP Top 10 classes
- **SonarQube** — optional integration for additional coverage
- **Dependency scanning** — checks npm, Composer, pip, and Bundler manifests against the OSV.dev vulnerability database

### 4. AI-Assisted Remediation

From any scan finding, developers can:

1. Generate a fix suggestion via OpenAI
2. Preview the diff inline
3. Open a merge request (GitHub PR / GitLab MR) with reviewer assignment
4. Create a tracked issue in Jira, Linear, Asana, ClickUp, or 6 other PM tools

### 5. Deployment Automation

Zero-config containerized deployments to AWS and GCP. Dockier's repo analyzer inspects the codebase, detects the runtime and framework, generates an optimized multi-stage Dockerfile, builds the image, and provisions infrastructure — all from a single "Deploy" action.

### 6. Instance & Process Management

Full lifecycle management of deployed applications:

- Background processes (queue workers, daemons) with auto-restart via Supervisor
- Scheduled jobs with cron-based frequency control
- Runtime commands execution on live deployments
- Network configuration (security rules, redirects)
- Custom domain management with SSL certificates
- Observability: heartbeats, logs, and activity streams

### 7. Notifications & Integrations

Multi-channel alerting (email, Slack, webhooks, in-app) fires on scan completions and deployment events. Integrations with 10+ project management tools enable seamless issue creation from security findings.

### 8. Team & Access Control

Multi-tenant organizations with custom roles, 30+ granular permissions, passwordless authentication (email OTP), and optional TOTP 2FA.

---

## In-Depth: Dockerized Deploy

### The Problem

Developers spend significant time writing and maintaining Dockerfiles, configuring build pipelines, and managing cloud infrastructure. For a typical team, setting up a new deployment involves:

- Understanding the project's runtime and dependencies
- Writing a production-ready, multi-stage Dockerfile
- Configuring a container registry
- Setting up infrastructure-as-code
- Managing environment variables and secrets
- Handling failed builds manually

### Dockier's Approach

Dockier automates the entire flow through a 9-stage pipeline:

```
Clone → Analyze → Generate Dockerfile → Build Image → Push to Registry
→ Provision Infrastructure → Post-Deploy Script → Network Rules → Health Check
```

#### Stage 1: Intelligent Repository Analysis

The repo analyzer inspects the codebase and detects:

| Detection Target | Method |
|---|---|
| Runtime | Presence of package.json, composer.json, requirements.txt, go.mod |
| Framework | Dependency analysis (next, nuxt, laravel, django, etc.) |
| Package manager | Lockfile detection (pnpm-lock.yaml, yarn.lock, composer.lock) |
| Node.js version | .nvmrc, .node-version, engines field |
| PHP extensions | composer.json require/suggest |
| Native dependencies | Known packages requiring system libraries (sharp, canvas, bcrypt, etc.) |
| Build/start commands | Package.json scripts, framework conventions |
| Port | Framework defaults, EXPOSE detection |

#### Stage 2: Dockerfile Generation

Based on the detected stack, Dockier generates an optimized multi-stage Dockerfile tailored to the runtime:

- **Node.js** — Corepack-aware builds, framework-specific output handling (Next.js standalone, Nuxt .output, SvelteKit build), native dependency resolution, production-only installs
- **PHP** — Composer with extension auto-detection, multi-stage with FPM + nginx, Node.js asset compilation when needed
- **Python** — Virtual environment isolation, gunicorn/uvicorn configuration, Django collectstatic
- **Go** — Static binary compilation with CGO disabled, minimal scratch/distroless final image

**Optional AI review.** When an OpenAI key is configured (and `AI_DOCKERFILE_REVIEW` is not `off`), the mechanically generated Dockerfile is passed to an AI reviewer before it is written. The reviewer only revises for concrete problems — an unpinned base image, dependencies installed after copying all source, running as root, wrong build/start commands, missing native packages, an incorrect `EXPOSE`, or secrets baked into a layer — and otherwise approves it unchanged. The review is strictly best-effort: any failure, timeout, invalid response, or rejected revision falls back to the mechanical Dockerfile, so it can never break a build. Only `.env.example` variable names and non-secret manifests are sent as context; `.env` is never read. Outcomes appear in the deploy logs.

#### Stage 3: Auto-Retry with Intelligent Patching

If a build fails, Dockier analyzes the error output and attempts to fix the Dockerfile automatically. Up to 3 attempts with patches including:

- Missing PHP extensions → auto-installs via docker-php-ext-install + PECL
- Missing system packages → resolves apt dependencies from error messages
- npm/pnpm/yarn lockfile issues → relaxes frozen/immutable constraints
- Python package resolution → adds --pre fallback
- Go module issues → adds go mod tidy
- Node.js version incompatibilities → upgrades runtime version
- Memory issues → increases NODE_OPTIONS heap size
- Missing build scripts → removes build step

#### Stage 4: Cloud Provisioning

**AWS Path:**
```
CodeBuild → ECR → CloudFormation → ECS (managed)
                                  → EC2 (VPS)
                                  → S3 + CloudFront (static)
```

**GCP Path:**
```
Docker build → Artifact Registry → Pulumi → Cloud Run (managed)
                                          → Compute Engine (VPS)
                                          → Cloud Storage + CDN (static)
```

Infrastructure is managed as code with state persistence. One-click teardown cleanly removes all provisioned resources.

#### Stage 5: Post-Deploy Automation

After provisioning, Dockier executes:

- Custom deploy scripts (migrations, cache clearing, queue restart)
- Network rule application (security rules, redirect rules via nginx)
- Health check polling to confirm the application is responding

### Deployment Strategies

| Strategy | AWS | GCP | Use Case |
|---|---|---|---|
| Managed | ECS (Fargate) | Cloud Run | Stateless web apps, APIs |
| VPS | EC2 | Compute Engine | Full server access, long-running processes |
| Static | S3 + CloudFront | Cloud Storage + CDN | SPAs, static sites |

---

## In-Depth: Security Analysis

### Scanning Architecture

Dockier runs security analysis through three independent engines that execute in parallel:

```
┌─────────────────────────────────────────────────┐
│                  Scan Worker                      │
├─────────────────────────────────────────────────┤
│  1. Clone repository (depth=1, 2min timeout)     │
│  2. Walk files (skip node_modules, vendor, etc.) │
│  3. Run engines:                                 │
│     ├── Semgrep (batched, 10min timeout)         │
│     ├── Custom regex (34 rules, per-file)        │
│     └── SonarQube (optional)                     │
│  4. Deduplicate findings                         │
│  5. Persist to database                          │
│  6. Send notification                            │
└─────────────────────────────────────────────────┘
```

### Semgrep Language Coverage

Rules are available for 25 languages:

Apex, Bash, C, C#, Clojure, Dockerfile, Elixir, Generic, Go, HTML, Java, JavaScript, JSON, Kotlin, OCaml, PHP, Python, Ruby, Rust, Scala, Solidity, Swift, Terraform, TypeScript, YAML

### Custom Rules Engine

34 built-in rules covering:

| Category | Rules | Languages |
|---|---|---|
| SQL Injection | 3 | PHP |
| Cross-Site Scripting (XSS) | 4 | PHP, Vue, React/JSX |
| Authentication & Secrets | 3 | PHP, JS, TS, Python, Ruby, YAML, JSON |
| File & Path Traversal | 2 | PHP |
| Command Injection | 2 | PHP |
| Deserialization | 2 | PHP, Python |
| Information Disclosure | 4 | PHP, .env, .ini |
| Cryptography | 3 | PHP, Python, JS, TS |
| Laravel-specific | 3 | PHP |
| JavaScript / Node.js | 3 | JS, TS, JSX, TSX |
| Python | 2 | Python |
| Generic (CORS, HTTP, TODOs) | 3 | Multi-language |

Rules are tenant-extensible: teams can add their own regex patterns or disable built-in rules per organization.

### Sensitive Data Detection

A code-based scanner (no AI credits consumed) parses:

- SQL migration files
- Prisma schemas
- Eloquent models
- TypeScript interfaces
- Python dataclasses

Fields are classified as **personal**, **sensitive**, or **secret** with an interactive UI on the project detail page.

### Dependency Vulnerability Scanning

Parses manifest files from four ecosystems:

| Ecosystem | Manifest | Lockfile |
|---|---|---|
| npm | package.json | package-lock.json, pnpm-lock.yaml, yarn.lock |
| Composer | composer.json | composer.lock |
| pip | requirements.txt | — |
| Bundler | Gemfile | Gemfile.lock |

Checks against the OSV.dev batch API. Results are filterable by production/dev scope and vulnerability severity.

### AI-Assisted Remediation Flow

```
Finding → Generate Fix (OpenAI) → Preview Diff → Create MR/PR → Assign Reviewer
                                               → Create Issue (Jira, Linear, etc.)
```

The AI receives the finding context (rule, file, snippet, severity) and generates a targeted fix. Developers preview the diff before committing, maintaining full control over what ships.

---

## Metrics

### Tech Stacks Tested

| Runtime | Frameworks | Package Managers |
|---|---|---|
| Node.js | Next.js, Nuxt.js, SvelteKit, Angular, Astro, Remix, React SPA, Vue SPA, generic | npm, pnpm, yarn, bun |
| PHP | Laravel, Symfony, WordPress, Statamic, generic | Composer |
| Python | Django, Flask, FastAPI, generic | pip, pipenv, poetry |
| Go | Generic | go modules |

**15+ framework-specific Dockerfile templates** generated based on detected stack.

### Build Success & Recovery

| Metric | Value |
|---|---|
| Max build retry attempts | 3 |
| Auto-patch categories | 10 (PHP extensions, system packages, lockfile issues, Python packages, Go modules, Node.js version, memory, permissions, missing scripts, corepack) |
| Native dependency mappings | 23 packages (sharp, canvas, bcrypt, puppeteer, playwright, better-sqlite3, pg-native, etc.) |
| PHP extension auto-detection | 22 extensions with apt dependency resolution + PECL |

### Deployment Pipeline Performance

| Stage | Timeout / Target |
|---|---|
| Git clone | 2 minutes |
| Repository analysis | < 5 seconds |
| Docker build (local) | Provider-dependent |
| Docker build (CodeBuild) | 10-15 minutes typical |
| Health check polling | Configurable |
| Total end-to-end (managed) | 3-8 minutes typical |

### Tested Deployments & Success Rate

| Runtime | Framework | Projects Tested | Git Providers | Success Rate |
|---|---|---|---|---|
| PHP | Laravel | 6 | GitHub, GitLab | 83% (5/6)* |
| Node.js | React (static) | 1 | GitHub | 100% |
| Node.js | Vue (static) | 1 | GitHub | 100% |
| Node.js | Astro (static) | 1 | GitHub | 100% |
| **Total** | | **9** | | **89% (8/9)** |

*\*The single failed deployment was caused by corrupted files in the source repository, not by the Dockier pipeline. All well-formed projects deployed successfully (100%).*

**Average deploy time (observed):**

| Deploy Type | Avg. Time |
|---|---|
| Laravel (managed, AWS ECS) | 5-8 minutes |
| Static site (S3 + CDN) | 2-4 minutes |

### Security Scanning Coverage

| Metric | Value |
|---|---|
| Semgrep language support | 25+ languages |
| Built-in custom rules | 34 |
| OWASP Top 10 coverage | Complete (SQLi, XSS, injection, broken auth, sensitive data, misconfig, components, SSRF) |
| Scan file size limit | 1 MB per file |
| Semgrep timeout | 10 minutes |
| Batch size | 1,000 files per Semgrep invocation |
| Dependency ecosystems | 4 (npm, Composer, pip, Bundler) |
| Vulnerability database | OSV.dev (real-time, no API key) |

### Platform Scale

| Metric | Value |
|---|---|
| Cloud providers | 2 (AWS, GCP) |
| Deploy strategies | 3 (managed, VPS, static) |
| Deploy adapters | 6 (aws-ec2, aws-ecs, aws-s3, gcp-compute, gcp-cloudrun, gcp-storage) |
| Git providers | 2 (GitHub, GitLab) |
| Issue tracking integrations | 10 (Jira, Linear, Asana, GitHub Issues, GitLab Issues, ClickUp, Monday.com, Notion, Todoist, Basecamp) |
| Notification channels | 4 (email, Slack, webhook, in-app) |
| Permission granularity | 30+ resource:action keys |
| Alternative build methods | 3 (Dockerfile, Railpack, Nixpacks) |

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                              │
│         React 19 · Tailwind CSS v4 · Vite · Dark Mode        │
├──────────────────────────────────────────────────────────────┤
│                          API                                  │
│           Fastify · TypeScript · OpenAPI · JWT Auth           │
├──────────────────────────────────────────────────────────────┤
│                        Services                               │
│  Auth │ Projects │ Deploy │ Scans │ Git │ Notifications      │
│  Users │ Roles │ Commands │ Network │ Domains │ Observe      │
│  Processes │ Integrations │ Image Builder                     │
├────────────────┬──────────────────┬──────────────────────────┤
│   Supabase     │    pg-boss       │      OpenAI              │
│   Postgres     │    Job Queue     │      gpt-5.4-mini        │
├────────────────┼──────────────────┼──────────────────────────┤
│      AWS       │       GCP        │      Semgrep             │
│  ECS/EC2/S3    │ Cloud Run/GCE    │      SonarQube           │
│  CodeBuild     │    Pulumi        │      Custom Rules        │
│  CloudFormation│ Artifact Registry│      OSV.dev             │
└────────────────┴──────────────────┴──────────────────────────┘
```

---

## Key Differentiators

| Traditional Workflow | With Dockier |
|---|---|
| Write Dockerfile manually | Auto-generated from repo analysis |
| Configure CI/CD pipeline (YAML) | One-click deploy button |
| Set up separate security tools | Built-in, zero-config scanning |
| Fix vulnerabilities → commit → PR (manual) | AI fix → preview diff → create MR (3 clicks) |
| Manage infrastructure-as-code separately | Provisioned and teardown managed by platform |
| Context-switch between 5+ tools | Single dashboard for scan, deploy, observe |

---

## Contact

**Team:** Andrea (Lead), Daniel, Oscar  
**License:** MPL-2.0  
**Status:** Active Development (April–June 2026)

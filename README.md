# Dockier

A DevSecOps platform built with Encore.ts and React. Connect your repositories, scan for vulnerabilities, analyze projects with AI, and deploy — all from one dashboard.

## Quick Start

### Prerequisites

- Node.js 22+
- [Encore CLI](https://encore.dev/docs/install)
- PostgreSQL 18+
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Set required Encore secrets
encore secret set DatabaseUrl --type dev    # postgresql://postgres@localhost:5432/dockier
encore secret set JwtSecret --type dev      # any random string
encore secret set OpenAIApiKey --type dev   # sk-... (for AI features)

# Create and seed the database
pnpm db:reset

# Run the backend
encore run
```

Backend runs on `http://localhost:4000`. Encore dashboard at `http://localhost:9400`.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend runs on `http://localhost:5173`.

### Default Login

- Email: `admin@dockier.io`
- Password: `Admin123!`

## Database

All migrations live in `prisma/migrations/` (one SQL file per table). Seeders in `prisma/seeders/`.

```bash
pnpm db:migrate   # Run migrations only
pnpm db:seed      # Run seeders (roles, admin user, custom rules, 1935 semgrep rules)
pnpm db:reset     # Drop everything, migrate, seed
```

## Testing

```bash
pnpm test                              # Run all tests
pnpm test -- __tests__/api-smoke.test.ts  # API smoke tests only (requires encore run)
```

95 tests: 48 unit tests + 47 API smoke tests covering all 93 endpoints.

## Architecture

```
├── auth/               → Authentication, 2FA, JWT
├── users/              → User CRUD
├── roles/              → Role-based permissions
├── projects/           → Project management
├── git-integration/    → Git providers, AI analysis, sensitive data, commits
├── code-analysis/      → Security scans, Semgrep rules, custom rules
├── deploy/             → Server providers, deployments, SSH keys
├── image-builder/      → Docker builds (AWS CodeBuild)
├── notifications/      → Multi-channel notifications
├── integrations/       → PM tools (Jira, Linear)
├── lib/                → Shared DB connection
├── prisma/
│   ├── migrations/     → 21 SQL migrations (one per table)
│   ├── seeders/        → SQL + CSV seeders
│   ├── migrate.ts      → Migration runner
│   ├── seed.ts         → Seeder runner
│   └── reset.ts        → Drop + migrate + seed
├── frontend/           → React 19 + Vite + Tailwind v4
└── __tests__/          → API smoke tests
```

## API Endpoints (93 total)

| Service | Count | Key Endpoints |
|---|---|---|
| Auth | 6 | POST /auth/login, GET /auth/me, POST /auth/2fa/* |
| Users | 5 | CRUD /users |
| Roles | 5 | CRUD /roles |
| Projects | 5 | CRUD /projects |
| Git Integration | 19 | /git/connections, /git/repo-badges, /git/analyze-sensitive-data |
| Code Analysis | 14 | /code-analysis/scans, /code-analysis/custom-rules, /code-analysis/semgrep-rules |
| Deploy | 10 | /deploy/providers, /deploy/deployments, /deploy/ssh-keys |
| Image Builder | 6 | /image-builder/builds |
| Notifications | 7 | /notifications, /notifications/channels |
| Integrations | 4 | PM team/project/member listing, issue creation |

All endpoints require `Authorization: Bearer <jwt>` except login and register.

## Deployment

### Encore Cloud

```bash
encore app create
encore deploy
```

Set secrets via Encore dashboard. Frontend deployed separately (S3, Vercel, etc.) with `VITE_API_BASE` pointing to the Encore API URL.

### Docker (self-hosted)

See `Dockerfile` and `docker-compose.yml` for a self-contained setup with PostgreSQL, Traefik reverse proxy, and Semgrep CLI.

## License

MPL-2.0

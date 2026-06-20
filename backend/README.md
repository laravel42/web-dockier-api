# Dockier Backend

Fastify + TypeScript API for Dockier. A single `@dockier/backend-fastify` package runs either the full **gateway** (all domains) or individual service entrypoints for local debugging.

## Services

| Service | Path prefix / domain | Responsibility |
| ------- | -------------------- | -------------- |
| `auth` | `/auth/*` | Passwordless OTP, sessions, 2FA, tenants, memberships, billing details |
| `users` | `/users/*` | User CRUD |
| `projects` | `/projects/*` | Project CRUD |
| `roles` | `/roles/*` | Custom roles and permission assignment |
| `deploy` | `/deploy/*`, providers, SSH keys | Deployments, providers, destroy, webhooks |
| `notifications` | `/notifications/*` | Channels, inbox, send |
| `integrations` | `/integrations/*` | PM tool connections and issue creation |
| `code-analysis` | `/scans/*`, rules | Scans, findings, custom rules |
| `git-integration` | `/git/*` | Git connections, repos, analysis caches |
| `image-builder` | `/builds/*` | Image builds, logs, deploy pipeline hooks |

Domain logic lives under each service’s `domain/` folder (planner, processor, analyzers, PM adapters, etc.).

## Auth and tenancy

- **Sign-up:** `POST /auth/register/start` → `POST /auth/passwordless/verify` (`type=signup`).
- **Sign-in:** `POST /auth/passwordless/start` → `POST /auth/passwordless/verify`.
- **Session:** `GET /auth/me` returns user, active tenant, role, and resolved permission keys.
- **Tenants:** `organizations` + `organization_memberships`; switch via `POST /auth/tenants/:id/switch`.
- **Roles:** Per-tenant custom roles in `roles` / `role_permissions`; default Admin/Member seeded on org creation.
- **Owner:** Organization owner flag for billing, org delete, and ownership transfer (separate from role permissions).
- **2FA:** TOTP setup/enable on authenticated routes.
- **Dev only:** `POST /auth/demo-login`, `POST /auth/password/login` (disabled in production).

Supabase Auth must have the Email provider enabled for OTP/magic-link flows.

## Shared infrastructure

- **Supabase admin client** — `src/shared/supabase/client.ts` + generated types in `types.ts`
- **JWT guard** — `src/shared/auth.ts` + permission checks in `src/shared/permissions/`
- **OpenAPI** — Zod route schemas; Swagger UI at `/docs`, JSON at `/docs/json`
- **Job queue** — pg-boss (`src/shared/queue.ts`) when `DATABASE_URL` is set

## Run modes

```bash
pnpm backend:dev                              # gateway (from repo root)
pnpm --filter @dockier/backend-fastify dev

pnpm backend:start:gateway
pnpm --filter @dockier/backend-fastify start:auth
pnpm --filter @dockier/backend-fastify start:deploy
# … other start:* scripts
```

`SERVICE_NAME=gateway` mounts all services on one port (default `4000`).

## Environment

Copy repo-root `.env.example` → `.env`. Required: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`. See `.env.example` for OpenAI, cloud deploy keys, and pooler URLs.

Production: Railway with secrets from Cloudflare Secrets Store (`LOAD_SECRETS_FROM=cloudflare`). See `docs/operations/railway.mdx`.

## Admin seeder

```bash
pnpm backend:seed:admin
```

Idempotent: creates/links Supabase auth user, organization membership, admin role, and app `users` / `profiles` rows. Optional env: `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_DISPLAY_NAME`, `ADMIN_SEED_ORG_NAME`, `ADMIN_SEED_ORG_SLUG`.

## Tests

Service tests live in `backend/src/services/*/__tests__/*.test.ts`. Run from repo root:

```bash
pnpm test
pnpm backend:typecheck
```

## Migration note

This backend replaced the former Encore runtime. Historical migration details: [`docs/MIGRATION_FASTIFY.md`](../docs/MIGRATION_FASTIFY.md).

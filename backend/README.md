# Dockier Fastify Backend Migration

This package is the Encore replacement scaffold for Dockier's backend while preserving the existing microservice boundaries.

## What is migrated now

- `auth` service: passwordless OTP/magic-link start+verify, tenant membership flows, and `GET /auth/me`
- `users` service: create/get/list/update/delete
- `projects` service: create/get/list/update/delete
- `roles` service: create/get/list/update/delete
- `deploy` service: providers, deployments, SSH keys, IaC generation, webhook updates
- `notifications` service: channels, send flow, inbox/read tracking
- `integrations` service: PM teams/projects/members + issue creation
- `code-analysis` service: scans/findings/custom rules/rule overrides (+ best-effort async stubs)
- `git-integration` service: connections/repos/branches/tree/content/stats/analysis endpoints
- `image-builder` service: builds, logs, cancel, image lookup, deploy status, webhook
- Restored domain helper modules under Fastify services:
  - `deploy/domain/planner.ts`: runtime detection, IaC preview generation, resource estimation
  - `deploy/domain/templates.ts`: provider/strategy template selection
  - `deploy/domain/processor.ts`: deployment creation + webhook status/log processing
  - `image-builder/domain/orchestrator.ts`: build input normalization + orchestration metadata
  - `image-builder/domain/buildspec.ts`: buildspec preview synthesis for build metadata
  - `git-integration/domain/provider-client.ts`: provider API adapters for repos/branches/tree/files
  - `git-integration/domain/analysis.ts`: stack detection, deploy option inference, service/sensitive/dependency analyzers
  - `git-integration/domain/mr-generator.ts`: finding title/effort estimation + MR/PR draft creation helpers
- Shared Supabase admin client with strict typing (`src/shared/supabase/types.ts`)
- Shared JWT auth guard (`src/shared/auth.ts`)
- OpenAPI/Swagger generation + docs UI (`/docs`, `/docs/json`)

## Auth and tenancy model

- Registration flow: `POST /auth/register/start` then `POST /auth/passwordless/verify` (`type=signup`).
- Existing-user passwordless sign-in: `POST /auth/passwordless/start` then `POST /auth/passwordless/verify`.
- Tenants live in `organizations`, and membership lives in `organization_memberships`.
- Roles are fixed and app-managed: `admin` and `member`.
- New self-registered users default to `member` unless explicitly provisioned as `admin` (seed/admin tooling).
- The backend issues a tenant-scoped JWT for API access after OTP verification.
- Authorization is enforced in API handlers and backed by RLS policies for tenant tables.

Supabase Auth must have the Email provider (OTP/magic-link) and email signups enabled for registration to work.

## Microservice run modes

One binary can boot each service independently:

```bash
pnpm --filter @dockier/backend-fastify start:auth
pnpm --filter @dockier/backend-fastify start:users
pnpm --filter @dockier/backend-fastify start:projects
pnpm --filter @dockier/backend-fastify start:gateway
```

`gateway` mounts all migrated services and still exposes migration status endpoints for observability.

## API documentation

- Swagger UI: `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs/json`

## Environment variables

Copy `backend/.env.example` and provide values via your deployment platform or local env.

## Admin seeder

Use the admin seeder to create/link a Supabase auth user and synchronize tenant RBAC/app rows:

```bash
pnpm backend:seed:admin
```

It is safe to run multiple times. The seeder:

- creates the auth identity if missing (or reuses existing),
- ensures `organizations` + `organization_memberships` admin role,
- ensures `user_roles` includes `admin`,
- ensures app-side `users` and `profiles` rows are synchronized.

Optional env overrides live in `backend/.env.example` (`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_DISPLAY_NAME`, `ADMIN_SEED_ORG_NAME`, `ADMIN_SEED_ORG_SLUG`).

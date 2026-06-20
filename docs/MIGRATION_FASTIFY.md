# Encore → Fastify migration (completed)

Dockier’s backend previously used Encore. It now runs on **Fastify + TypeScript** in `backend/`, preserving domain boundaries as route modules in a single deployable gateway.

**Status:** Complete for runtime-critical paths. This document is retained for historical context.

## What shipped

- Fastify gateway with `SERVICE_NAME` selector (monolith or per-service dev mode)
- Supabase typed storage adapter
- Passwordless Supabase Auth + tenant-scoped JWT
- Multi-tenant `organizations` / `organization_memberships` + custom RBAC
- OpenAPI (Zod) + Swagger UI at `/docs`
- All ten domain services implemented under `backend/src/services/*`
- Canonical SQL in `supabase/migrations/` (not a root `migrations/` folder)
- Frontend on Cloudflare Pages; backend on Railway; secrets via Cloudflare Secrets Store

## Migrated services

`auth`, `users`, `projects`, `roles`, `deploy`, `notifications`, `integrations`, `code-analysis`, `git-integration`, `image-builder`

## Parity notes

- Domain helpers restored under each service’s `domain/` directory (deploy planner/processor, git analysis, PM adapters, image build pipeline, MR generator, etc.).
- Remaining gaps are non-critical optional integrations (e.g. some SonarQube proxy endpoints return safe defaults).
- Background work uses **pg-boss** on Postgres when `DATABASE_URL` is configured (replaces Encore pub/sub for deploy/notification jobs).

## Required environment variables

See repo-root `.env.example`. Minimum: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`.

## Do not reintroduce

- `encore.service.ts`, `encore.app`, or `encore.dev` imports
- Encore-specific runtime configuration

For current architecture, see [`README.md`](../README.md) and [`PRODUCT.md`](../PRODUCT.md).

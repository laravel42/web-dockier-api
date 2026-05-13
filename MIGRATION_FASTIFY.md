# Encore -> Fastify Migration Scaffold

This repository now includes a practical migration foundation in `backend/` to replace Encore with Fastify + TypeScript while preserving microservice boundaries.

## Delivered in this pass

- Fastify runtime with service selector (`SERVICE_NAME`)
- Supabase typed storage adapter (`@supabase/supabase-js`)
- Passwordless Supabase auth flow (`/auth/passwordless/start`, `/auth/passwordless/verify`)
- Multitenancy (`organizations`, `organization_memberships`) with strict `admin`/`member` RBAC
- OpenAPI-first route definitions via Zod
- Swagger UI + JSON docs endpoints
- Mintlify-compatible docs in `docs/`
- Cloudflare Pages config for static frontend deployment
- Root-level migration folder (`migrations/`) as the single SQL migration source

## Fully migrated services

- `auth`
- `users`
- `projects`
- `roles`
- `deploy`
- `notifications`
- `integrations`
- `code-analysis`
- `git-integration`
- `image-builder`

## Notes on best-effort parity

- All scaffolded service endpoints are now implemented under `backend/src/services/*/routes.ts` with Fastify + Zod schemas and OpenAPI metadata.
- Restored service-internal logic modules now include:
  - `git-integration/domain`: tech-stack detection, deploy-option analysis, service detection, dependency vulnerability scanner.
  - `integrations/domain/providers`: parity adapters for Jira, Linear, GitHub, GitLab, Asana, ClickUp, Monday, Notion, Todoist, Basecamp.
  - `image-builder/domain/aws-runtime`: CodeBuild status refresh + CloudWatch log streaming.
  - `deploy/domain`: runtime planner, deploy template resolution, pipeline processor, and destroy orchestration helpers.
  - `image-builder/domain/buildspec`: buildspec preview generation for runtime build metadata.
  - `git-integration/domain/mr-generator`: MR/PR draft generation and finding summarization utilities.

## Completion state

- Runtime-critical restoration items from the prior audit are implemented in Fastify architecture for deploy/image-builder/git-integration/integrations flows.
- `TODO(restoration)` markers are removed from active runtime paths.
- Remaining stubs are non-critical external integrations (for example SonarQube profile/rule proxy endpoints) and return safe defaults.

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `SERVICE_NAME` (gateway/auth/users/projects/etc.)
- `PORT`
- `CORS_ORIGIN`

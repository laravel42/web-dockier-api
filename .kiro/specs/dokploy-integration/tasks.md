# Implementation Plan

## Overview

Replace the existing native deploy pipeline (CloudFormation/Pulumi + custom image building) with a Dokploy-backed orchestration pipeline. The integration uses Dokploy's API for project management, server provisioning, application configuration, deployment execution, and AI-powered failure recovery. The frontend deploy wizard is simplified by removing the build step and replacing it with a real-time pipeline progress view.

## Tasks

### Phase 1: Foundation (Backend Infrastructure)

- [x] 1. Database Migration
  - [x] 1.1 Create migration `supabase/migrations/0068_dokploy_integration.sql`
  - [x] 1.2 Tables: `dokploy_tenant_projects`, `dokploy_servers`, `dokploy_applications`
  - [x] 1.3 Include proper indexes, foreign keys, and `IF NOT EXISTS` guards

- [ ] 2. Environment & Configuration
  - [x] 2.1 Add `DOKPLOY_API_URL`, `DOKPLOY_API_TOKEN`, `DOKPLOY_SSH_KEY_ID`, `DEPLOY_PROVIDER` to `.env.example`
  - [x] 2.2 Add config values to `backend/src/shared/config.ts`
  - [ ] 2.3 Update `AGENTS.md` secrets documentation

- [ ] 3. Dokploy API Client
  - [x] 3.1 Create `backend/src/services/deploy/domain/dokploy/types.ts` — all Dokploy request/response types
  - [x] 3.2 Create `backend/src/services/deploy/domain/dokploy/client.ts` — typed HTTP client with auth, retries, error handling
  - [x] 3.3 Methods: project CRUD, server CRUD, application CRUD, git provider config, build config, env config, deploy trigger, AI fix trigger
  - [ ] 3.4 Unit tests for client error handling and retry logic

- [x] 4. Mapping Layer (DB Operations)
  - [x] 4.1 Create `backend/src/services/deploy/domain/dokploy/mappings.ts`
  - [x] 4.2 Functions: `getOrCreateTenantProject`, `getOrCreateServer`, `getOrCreateApplication`
  - [x] 4.3 Concurrency-safe (use advisory locks or INSERT ON CONFLICT for race conditions)

### Phase 2: Pipeline Stages

- [ ] 5. Ensure Project Stage
  - [ ] 5.1 Create `backend/src/services/deploy/domain/dokploy/stages/ensure-project.ts`
  - [ ] 5.2 Look up tenant → Dokploy project mapping
  - [ ] 5.3 If missing, create project via `client.createProject()`
  - [ ] 5.4 Store mapping in `dokploy_tenant_projects`
  - [ ] 5.5 Log progress to deployment record

- [ ] 6. Sync Git Credentials Stage
  - [ ] 6.1 Create `backend/src/services/deploy/domain/dokploy/stages/sync-git.ts`
  - [ ] 6.2 Load git connection from Dockier DB (provider type, token/credentials)
  - [ ] 6.3 For GitHub: prepare params for `application.saveGithubProvider`
  - [ ] 6.4 For GitLab: prepare params for `application.saveGitlabProvider`
  - [ ] 6.5 For others: use `application.saveGitProvider` with SSH key
  - [ ] 6.6 This stage stores needed params; actual git config is applied in configure-app stage

- [ ] 7. Provision Server Stage
  - [ ] 7.1 Create `backend/src/services/deploy/domain/dokploy/stages/provision-server.ts`
  - [ ] 7.2 Check if project already has a provisioned server (`dokploy_servers`)
  - [ ] 7.3 If existing + healthy, reuse it
  - [ ] 7.4 If not: launch VPS using AWS EC2 SDK or GCP Compute API (reuse existing `provider-credentials.ts`)
  - [ ] 7.5 Wait for SSH access (poll port 22)
  - [ ] 7.6 Register as Dokploy remote server (`server.create`)
  - [ ] 7.7 Run setup (`server.setup`) and validate (`server.validate`)
  - [ ] 7.8 Store in `dokploy_servers`

- [ ] 8. Configure Application Stage
  - [ ] 8.1 Create `backend/src/services/deploy/domain/dokploy/stages/configure-app.ts`
  - [ ] 8.2 Check if project already has a Dokploy application (`dokploy_applications`)
  - [ ] 8.3 If not: create via `application.create` (name, environmentId, serverId)
  - [ ] 8.4 Configure git source (using params from sync-git stage)
  - [ ] 8.5 Determine build type from repo analysis (Has Dockerfile → `dockerfile`, Static site → `static` + publishDirectory, Railpack-compatible → `railpack`, Default → `nixpacks`)
  - [ ] 8.6 Set build type via `application.saveBuildType`
  - [ ] 8.7 Set env vars via `application.saveEnvironment`

- [ ] 9. Deploy & Poll Stage
  - [ ] 9.1 Create `backend/src/services/deploy/domain/dokploy/stages/trigger-deploy.ts`
  - [ ] 9.2 Trigger deploy via `application.deploy`
  - [ ] 9.3 Poll application status until `done` or `error` (configurable interval, default 5s)
  - [ ] 9.4 Extract appUrl from application once deployed
  - [ ] 9.5 Return success/failure with logs

- [ ] 10. AI Recovery Stage (Dokploy AI)
  - [ ] 10.1 Create `backend/src/services/deploy/domain/dokploy/stages/ai-recovery.ts`
  - [ ] 10.2 On deploy failure, invoke Dokploy's built-in AI fix feature via the Dokploy API (already configured on Dokploy account)
  - [ ] 10.3 Do NOT call OpenAI directly — Dokploy AI is tightly integrated with its build system and handles deployment errors better
  - [ ] 10.4 Dokploy AI analyzes logs and applies fixes internally (env vars, build config, dependencies)
  - [ ] 10.5 After AI applies fix, return `{ fixed: true, description }` for logging
  - [ ] 10.6 Return whether a fix was applied (for retry decision)
  - [ ] 10.7 Non-fatal: if Dokploy AI is unavailable or cannot fix the issue, return `{ fixed: false }`

### Phase 3: Pipeline Orchestrator

- [ ] 11. Pipeline Entry Point
  - [ ] 11.1 Create `backend/src/services/deploy/domain/dokploy/pipeline.ts`
  - [ ] 11.2 Function `executeDokployPipeline(event: PipelineInput): Promise<void>`
  - [ ] 11.3 Coordinate stages: ensure-project → (sync-git || provision-server) → configure-app → deploy-with-retry
  - [ ] 11.4 Retry loop: up to 3 attempts with Dokploy AI recovery between failures
  - [ ] 11.5 Update deployment status and logs at each stage
  - [ ] 11.6 Handle timeouts (15 min max)
  - [ ] 11.7 Idempotency: safe to re-run from any stage

- [ ] 12. Router Integration
  - [ ] 12.1 Modify worker to check `DEPLOY_PROVIDER` config
  - [ ] 12.2 If `"dokploy"`, call `executeDokployPipeline` instead of `executePipeline`
  - [ ] 12.3 Existing pipeline remains available via `DEPLOY_PROVIDER=native`
  - [ ] 12.4 No changes to the `POST /deploy/deployments` route (same API contract)

### Phase 4: Frontend Changes

- [ ] 13. Remove Build Step from Wizard
  - [ ] 13.1 Remove `StepCompose` from `DeployWizard.tsx` step rendering
  - [ ] 13.2 Remove step 3 (Build) from `STEPS` array in constants
  - [ ] 13.3 Update step indices in `useDeployWizard.ts` (steps become 0-3 instead of 0-4)
  - [ ] 13.4 Remove `StepCompose.tsx` file
  - [ ] 13.5 Remove Dockerfile preview logic from `useDeployWizard.ts`
  - [ ] 13.6 Remove `tofuScript`, `tofuResources`, `useDocker`, `useRepoDockerfile`, `buildMethod`, `dockerfilePreview` from `WizardState`
  - [ ] 13.7 Remove `generateScript` and `generatePreview` callbacks
  - [ ] 13.8 Remove tofu-related loading/error state

- [ ] 14. New Deploy Progress UI
  - [ ] 14.1 Redesign `StepDeploy.tsx` to show orchestration timeline
  - [ ] 14.2 Show stages: Project → Git Sync → Server → App Config → Deploy
  - [ ] 14.3 Each stage shows: pending / in-progress (spinner) / success (check) / failed (x)
  - [ ] 14.4 On failure + retry: show Dokploy AI fix description and retry count
  - [ ] 14.5 Use existing deploy log polling (already polls `GET /deploy/deployments/:id`)
  - [ ] 14.6 Parse structured stage info from deploy logs (add stage markers like `[stage:ensure-project]`)

- [ ] 15. Simplify WizardState & Plans
  - [ ] 15.1 Remove `tofuScript`, `tofuResources`, `tofuAppName` from `WizardState` type
  - [ ] 15.2 Remove `useDocker`, `useRepoDockerfile`, `buildMethod`, `dockerfilePreview` from `WizardState`
  - [ ] 15.3 Remove `generateScript` flow from `useDeployWizard.ts`
  - [ ] 15.4 Keep plan selection (instance size still matters for server provisioning)
  - [ ] 15.5 The `createDeployment` call no longer sends `tofuScript` or `buildMethod`

### Phase 5: Cleanup & Testing

- [ ] 16. Backend Integration Tests
  - [ ] 16.1 Test Dokploy client with mocked HTTP responses
  - [ ] 16.2 Test pipeline orchestration with mocked client
  - [ ] 16.3 Test Dokploy AI recovery with mocked API responses
  - [ ] 16.4 Test mapping layer race condition handling
  - [ ] 16.5 Test idempotency (re-running pipeline doesn't duplicate resources)

- [ ] 17. Remove Legacy Code (Deferred)
  - [ ] 17.1 After `DEPLOY_PROVIDER=dokploy` is validated in production, remove: CloudFormation templates (`domain/cfn-templates/`), Pulumi templates (`domain/pulumi-templates/`), Legacy adapters (`domain/adapters/aws-ec2.ts`, `aws-ecs.ts`, `aws-s3.ts`, etc.), Build pipeline (`lib/build-pipeline.ts` image building), Tofu generation endpoint (`/deploy/tofu/generate`), Dockerfile preview endpoint, `StepCompose` component (already done in Task 4.1)
  - [ ] 17.2 Keep `DEPLOY_PROVIDER` flag until migration complete

- [ ] 18. Documentation
  - [ ] 18.1 Update `AGENTS.md` with new deploy flow description
  - [ ] 18.2 Update `PRODUCT.md` if deploy feature description changes
  - [ ] 18.3 Add operational runbook: how to set up a Dokploy instance, configure API access

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": [1, 2],
      "description": "Foundation — DB migration and environment configuration"
    },
    {
      "wave": 2,
      "tasks": [3, 4],
      "description": "API client and mapping layer (depend on wave 1)"
    },
    {
      "wave": 3,
      "tasks": [5, 6, 7],
      "description": "Pipeline stages — ensure project, sync git, provision server (depend on waves 1–2)"
    },
    {
      "wave": 4,
      "tasks": [8],
      "description": "Configure application (depends on stages 5, 6, 7)"
    },
    {
      "wave": 5,
      "tasks": [9],
      "description": "Deploy & poll (depends on stage 8)"
    },
    {
      "wave": 6,
      "tasks": [10],
      "description": "AI recovery (depends on stage 9)"
    },
    {
      "wave": 7,
      "tasks": [11],
      "description": "Pipeline orchestrator entry point (depends on all stages)"
    },
    {
      "wave": 8,
      "tasks": [12],
      "description": "Router integration (depends on pipeline entry point)"
    },
    {
      "wave": 9,
      "tasks": [13, 14, 15],
      "description": "Frontend changes — remove build step, progress UI, simplify state (depend on router integration)"
    },
    {
      "wave": 10,
      "tasks": [16],
      "description": "Backend integration tests (depend on all prior tasks)"
    },
    {
      "wave": 11,
      "tasks": [17, 18],
      "description": "Cleanup and documentation (depend on integration tests)"
    }
  ]
}
```

## Notes

- **Feature flag:** The `DEPLOY_PROVIDER` env var gates the new pipeline. Set to `"dokploy"` to activate, `"native"` (default) to keep the existing CloudFormation/Pulumi flow.
- **Idempotency:** Every stage is designed to be re-runnable. Mapping layer uses `INSERT ON CONFLICT` and advisory locks to prevent duplicate resource creation under concurrent requests.
- **AI recovery is non-fatal:** Dokploy AI fix failures never block the pipeline — they simply skip retry enhancement and let the deploy fail normally after max attempts.
- **No breaking API changes:** The `POST /deploy/deployments` route contract is unchanged. The switch is entirely backend-internal.
- **Legacy removal is deferred:** Task 17 should only be executed after the Dokploy pipeline is validated in production for at least one release cycle.

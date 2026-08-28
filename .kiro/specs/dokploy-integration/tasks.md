# Implementation Plan

## Overview

Replace the existing native deploy pipeline (CloudFormation/Pulumi + custom image building) with a Dokploy-backed orchestration pipeline. The integration uses Dokploy's API for project management, application configuration, deployment execution, and AI-powered failure recovery. Compute is a per-tenant VPS launched on the deploying user's **own AWS or GCP account** (credentials from `server_providers`), then registered in Dokploy as a remote server — Dockier owns no shared compute. The frontend deploy wizard is simplified by removing the build step and replacing it with a real-time pipeline progress view.

**Current status:** Phases 1–6 and 8–11 are complete. Task 7b (plan threading) is done, and Task 7 is fully done for **both AWS and GCP** — the provision-server stage launches a VPS on the tenant's account (EC2 or Compute Engine), waits for SSH, and registers it in Dokploy; teardown removes the Dokploy app/server and terminates the cloud VM on project delete (all with unit tests). The main outstanding item is a live end-to-end validation, currently blocked on network reachability to the Dokploy instance.

## Tasks

### Phase 1: Foundation (Backend Infrastructure)

- [x] 1. Database Migration
  - [x] 1.1 Create migration `supabase/migrations/0068_dokploy_integration.sql`
  - [x] 1.2 Tables: `dokploy_tenant_projects`, `dokploy_servers`, `dokploy_applications`
  - [x] 1.3 Include proper indexes, foreign keys, and `IF NOT EXISTS` guards

- [ ] 2. Environment & Configuration
  - [x] 2.1 Add `DOKPLOY_API_URL`, `DOKPLOY_API_TOKEN`, `DOKPLOY_SSH_KEY_ID`, `DEPLOY_PROVIDER` to `.env.example`
  - [x] 2.2 Add config values to `backend/src/shared/config.ts`
  - [x] 2.3 Update `AGENTS.md` secrets documentation

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

- [x] 5. Ensure Project Stage
  - [x] 5.1 Create `backend/src/services/deploy/domain/dokploy/stages/ensure-project.ts`
  - [x] 5.2 Look up tenant → Dokploy project mapping
  - [x] 5.3 If missing, create project via `client.createProject()`
  - [x] 5.4 Store mapping in `dokploy_tenant_projects`
  - [x] 5.5 Log progress to deployment record

- [x] 6. Sync Git Credentials Stage
  - [x] 6.1 Create `backend/src/services/deploy/domain/dokploy/stages/sync-git.ts`
  - [x] 6.2 Load git connection from Dockier DB (provider type, token/credentials)
  - [x] 6.3 For GitHub: prepare params for `application.saveGithubProvider`
  - [x] 6.4 For GitLab: prepare params for `application.saveGitlabProvider`
  - [x] 6.5 For others: use `application.saveGitProvider` with SSH key
  - [x] 6.6 This stage stores needed params; actual git config is applied in configure-app stage

- [x] 7. Provision Server Stage — per-tenant VPS on the user's own AWS/GCP account (AWS + GCP provisioning + teardown done)
  - [x] 7.1 Create `backend/src/services/deploy/domain/dokploy/stages/provision-server.ts`
  - [x] 7.2 Check if project already has a provisioned server (`dokploy_servers`)
  - [x] 7.3 If existing + healthy, reuse it
  - [x] 7.6 Register as Dokploy remote server (`server.create`) — via `registerServerInDokploy()`
  - [x] 7.7 Run setup (`server.setup`) and validate (`server.validate`)
  - [x] 7.8 Store in `dokploy_servers`
  - [x] 7.9 Testing-only fallback: register `DOKPLOY_DEFAULT_SERVER_IP` when set
  - [ ] 7.10 Resolve per-tenant cloud credentials from `providerId` via `getProviderCredentialsSafe()` (`lib/provider-credentials.ts`); branch on `provider` (`"aws"` | `"gcp"`)
  - [ ] 7.11 **AWS provisioning** — new `provisionEc2Instance(creds, plan)`:
    - Build EC2 client from tenant creds + region using `getEc2()` (`lib/aws-sdk.ts`)
    - Import deploy SSH key (`ImportKeyPairCommand`, idempotent by name)
    - Find-or-create security group opening ingress 22/80/443 + egress all
    - Resolve recent Ubuntu 22.04+ AMI (`DescribeImagesCommand`, Canonical `099720109477`)
    - Launch instance (`RunInstancesCommand`): instanceType from plan, key pair, SG, public IP, 30GB gp3, tag `ManagedBy=dockier`
    - Poll `DescribeInstancesCommand` until `running` + public IP assigned → return `{ ip, instanceId }`
  - [x] 7.12 **GCP provisioning** — new `provisionGceInstance()` (`provisioning/gcp-gce.js`) + `GcpClient` methods:
    - Builds client with `createGcpClient(apiKey)` (`domain/infra/gcp-client.ts`)
    - Added `createInstance(zone, params)` to `GcpClient` — `instances.insert` with Ubuntu 22.04 LTS image, machineType from plan, external NAT config, deploy SSH key in `ssh-keys` metadata (`root:<pubkey>`), 30GB pd-balanced disk, `dockier-dokploy` network tag; treats 409 as already-exists
    - Added `ensureFirewallRule()` (idempotent, tcp 22/80/443 on the network tag) and `waitForZoneOperation()` + `getInstanceExternalIp()`
    - Polls the zonal operation to completion, then reads `networkInterfaces[].accessConfigs[].natIP` → returns `{ instanceId, publicIp, zone }`
    - GCE instance-name sanitization; error mapping for auth/quota; wired into `stageProvisionServer` (gcp branch) with SSH wait + Dokploy registration
    - Unit tests: `__tests__/gcp-gce.test.ts` (15 tests)
  - [x] 7.13 SSH reachability poll — new `waitForSsh(ip, 22, timeout)` in `provisioning/wait-for-ssh.ts`; poll TCP connect until reachable or timeout (~3 min) before Dokploy registration
  - [x] 7.14 Wire it up: replaced the `throw` in `stageProvisionServer` with resolve-creds → branch aws (provision → `waitForSsh` → `registerServerInDokploy`) / gcp throws not-implemented / others unsupported
  - [x] 7.15 Error handling: invalid creds, quota/permission, SSH timeout mapped to clear messages + mark `dokploy_servers.server_status='error'` for re-provision on next deploy
  - [x] 7.16 Injects the Dokploy-managed key's public half (from `client.listSSHKeys()` matched to `DOKPLOY_SSH_KEY_ID`) into the VM so Dokploy can connect — **assumes Dokploy holds the private half; verify before a live run**
  - [x] 7.17 Unit tests for the AWS path (`__tests__/aws-ec2.test.ts`, `__tests__/wait-for-ssh.test.ts`) — 20 tests: happy path, AMI selection, SG/key-pair idempotency, IP polling, error mapping
  - [x] 7.18 Teardown (`lifecycle/dokploy-teardown.ts`): on project infra teardown, remove the Dokploy application (`application.remove`) + server (`server.remove`), terminate the tenant's cloud VM (EC2 `TerminateInstances` / GCE `deleteInstance`), and delete the `dokploy_*` mapping rows. Best-effort/idempotent — per-resource results aggregate to torn_down/partial/nothing_to_tear_down. Dispatched from `teardownProjectInfrastructure` when `DEPLOY_PROVIDER=dokploy`. Unit tests: `__tests__/dokploy-teardown.test.ts` (8 tests)

- [x] 7b. Plan Threading (prerequisite for 7.11/7.12 instance sizing)
  - [x] 7b.1 Added `instanceType` + `region` to the `POST /deploy/deployments` request schema (frontend already sent them; backend was dropping them)
  - [x] 7b.2 Threaded through `CreateDeploymentParams` → `enqueueDeployment` (region falls back to the provider's region). Not persisted to `deployments` (pipeline runs from the enqueue payload; redeploy reuses the existing server)
  - [x] 7b.3 Added `instanceType` + `region` to `PipelineInput` (`domain/pipeline/shared.ts`)
  - [x] 7b.4 Passed into `stageProvisionServer` and mapped to the EC2 `instanceType` (instance sizes come from `plans.ts` via the wizard)

- [x] 8. Configure Application Stage
  - [x] 8.1 Create `backend/src/services/deploy/domain/dokploy/stages/configure-app.ts`
  - [x] 8.2 Check if project already has a Dokploy application (`dokploy_applications`)
  - [x] 8.3 If not: create via `application.create` (name, environmentId, serverId)
  - [x] 8.4 Configure git source (using params from sync-git stage)
  - [x] 8.5 Determine build type from repo analysis (Has Dockerfile → `dockerfile`, Static site → `static` + publishDirectory, Railpack-compatible → `railpack`, Default → `nixpacks`)
  - [x] 8.6 Set build type via `application.saveBuildType`
  - [x] 8.7 Set env vars via `application.saveEnvironment`

- [x] 9. Deploy & Poll Stage
  - [x] 9.1 Create `backend/src/services/deploy/domain/dokploy/stages/trigger-deploy.ts`
  - [x] 9.2 Trigger deploy via `application.deploy`
  - [x] 9.3 Poll application status until `done` or `error` (configurable interval, default 5s)
  - [x] 9.4 Extract appUrl from application once deployed
  - [x] 9.5 Return success/failure with logs

- [x] 10. AI Recovery Stage (Dokploy AI)
  - [x] 10.1 Create `backend/src/services/deploy/domain/dokploy/stages/ai-recovery.ts`
  - [x] 10.2 On deploy failure, invoke Dokploy's built-in AI fix feature via the Dokploy API (already configured on Dokploy account)
  - [x] 10.3 Do NOT call OpenAI directly — Dokploy AI is tightly integrated with its build system and handles deployment errors better
  - [x] 10.4 Dokploy AI analyzes logs and applies fixes internally (env vars, build config, dependencies)
  - [x] 10.5 After AI applies fix, return `{ fixed: true, description }` for logging
  - [x] 10.6 Return whether a fix was applied (for retry decision)
  - [x] 10.7 Non-fatal: if Dokploy AI is unavailable or cannot fix the issue, return `{ fixed: false }`

### Phase 3: Pipeline Orchestrator

- [x] 11. Pipeline Entry Point
  - [x] 11.1 Create `backend/src/services/deploy/domain/dokploy/pipeline.ts`
  - [x] 11.2 Function `executeDokployPipeline(event: PipelineInput): Promise<void>`
  - [x] 11.3 Coordinate stages: ensure-project → (sync-git || provision-server) → configure-app → deploy-with-retry
  - [x] 11.4 Retry loop: up to 3 attempts with Dokploy AI recovery between failures
  - [x] 11.5 Update deployment status and logs at each stage
  - [x] 11.6 Handle timeouts (15 min max)
  - [x] 11.7 Idempotency: safe to re-run from any stage

- [x] 12. Router Integration
  - [x] 12.1 Modify worker to check `DEPLOY_PROVIDER` config
  - [x] 12.2 If `"dokploy"`, call `executeDokployPipeline` instead of `executePipeline`
  - [x] 12.3 Existing pipeline remains available via `DEPLOY_PROVIDER=native`
  - [x] 12.4 No changes to the `POST /deploy/deployments` route (same API contract)

### Phase 4: Frontend Changes

- [x] 13. Remove Build Step from Wizard
  - [x] 13.1 Remove `StepCompose` from `DeployWizard.tsx` step rendering
  - [x] 13.2 Remove step 3 (Build) from `STEPS` array in constants
  - [x] 13.3 Update step indices in `useDeployWizard.ts` (steps become 0-3 instead of 0-4)
  - [x] 13.4 Remove `StepCompose.tsx` file
  - [x] 13.5 Remove Dockerfile preview logic from `useDeployWizard.ts`
  - [x] 13.6 Remove `tofuScript`, `tofuResources`, `useDocker`, `useRepoDockerfile`, `buildMethod`, `dockerfilePreview` from `WizardState`
  - [x] 13.7 Remove `generateScript` and `generatePreview` callbacks
  - [x] 13.8 Remove tofu-related loading/error state

- [x] 14. New Deploy Progress UI
  - [x] 14.1 Redesign `StepDeploy.tsx` to show orchestration timeline
  - [x] 14.2 Show stages: Project → Git Sync → Server → App Config → Deploy
  - [x] 14.3 Each stage shows: pending / in-progress (spinner) / success (check) / failed (x)
  - [x] 14.4 On failure + retry: show Dokploy AI fix description and retry count
  - [x] 14.5 Use existing deploy log polling (already polls `GET /deploy/deployments/:id`)
  - [x] 14.6 Parse structured stage info from deploy logs (add stage markers like `[stage:ensure-project]`)

- [x] 15. Simplify WizardState & Plans
  - [x] 15.1 Remove `tofuScript`, `tofuResources`, `tofuAppName` from `WizardState` type
  - [x] 15.2 Remove `useDocker`, `useRepoDockerfile`, `buildMethod`, `dockerfilePreview` from `WizardState`
  - [x] 15.3 Remove `generateScript` flow from `useDeployWizard.ts`
  - [x] 15.4 Keep plan selection (instance size still matters for server provisioning)
  - [x] 15.5 The `createDeployment` call no longer sends `tofuScript` or `buildMethod`

### Phase 5: Cleanup & Testing

- [x] 16. Backend Integration Tests
  - [x] 16.1 Test Dokploy client with mocked HTTP responses
  - [x] 16.2 Test pipeline orchestration with mocked client
  - [x] 16.3 Test Dokploy AI recovery with mocked API responses
  - [x] 16.4 Test mapping layer race condition handling
  - [x] 16.5 Test idempotency (re-running pipeline doesn't duplicate resources)

- [ ] 17. Remove Legacy Code (Deferred)
  - [ ] 17.1 After `DEPLOY_PROVIDER=dokploy` is validated in production, remove: CloudFormation templates (`domain/cfn-templates/`), Pulumi templates (`domain/pulumi-templates/`), Legacy adapters (`domain/adapters/aws-ec2.ts`, `aws-ecs.ts`, `aws-s3.ts`, etc.), Build pipeline (`lib/build-pipeline.ts` image building), Tofu generation endpoint (`/deploy/tofu/generate`), Dockerfile preview endpoint, `StepCompose` component (already done in Task 4.1)
  - [ ] 17.2 Keep `DEPLOY_PROVIDER` flag until migration complete

- [ ] 18. Documentation
  - [x] 18.1 Update `AGENTS.md` with new deploy flow description
  - [x] 18.2 Updated `PRODUCT.md` deploy description: per-tenant VPS provisioning on the user's own AWS/GCP account + teardown on delete
  - [x] 18.3 Added operational runbook `docs/operations/dokploy.mdx` (Dokploy setup, API token, SSH key id retrieval, config + validation, provisioning/teardown, troubleshooting); registered in `docs/docs.json`

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
      "tasks": [5, 6, "7b", 7],
      "description": "Pipeline stages — ensure project, sync git, plan threading (7b), provision server incl. per-tenant AWS/GCP VPS provisioning (7 depends on 7b for instance sizing). Depend on waves 1–2."
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

- **Server provisioning model:** VPS instances are provisioned **on the deploying tenant's own AWS/GCP account** using per-tenant credentials from `server_providers` (resolved by `providerId`), then registered in Dokploy. Dockier owns no shared compute. `DOKPLOY_DEFAULT_SERVER_IP` is a **testing-only** override that skips cloud provisioning; it is not part of the production model.
- **Reuse vs. build for Task 7:** Reusable — `getProviderCredentialsSafe()`, `getEc2()`, `GcpClient`/`createGcpClient` (+ GCE delete/find/exists), and `registerServerInDokploy()` (`server.create`/`setup`/`validate` + `upsertServer`). Must be built — the EC2 `RunInstances` launcher, `GcpClient.createInstance()` (only delete/find/exists exist today), the `waitForSsh` port-22 poller, and plan threading onto `PipelineInput`.
- **Feature flag:** The `DEPLOY_PROVIDER` env var gates the new pipeline. Set to `"dokploy"` to activate, `"native"` (default) to keep the existing CloudFormation/Pulumi flow.
- **Idempotency:** Every stage is designed to be re-runnable. Mapping layer uses `INSERT ON CONFLICT` and advisory locks to prevent duplicate resource creation under concurrent requests.
- **AI recovery is non-fatal:** Dokploy AI fix failures never block the pipeline — they simply skip retry enhancement and let the deploy fail normally after max attempts.
- **No breaking API changes:** The `POST /deploy/deployments` route contract is unchanged. The switch is entirely backend-internal.
- **Legacy removal is deferred:** Task 17 should only be executed after the Dokploy pipeline is validated in production for at least one release cycle.

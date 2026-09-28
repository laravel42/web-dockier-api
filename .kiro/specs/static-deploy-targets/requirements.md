# Static Deploy Targets — Requirements

**Status:** Draft — awaiting decisions on OQ-2, OQ-3, OQ-4
**Supersedes:** the static-site portions of `.kiro/specs/unified-deploy-adapters/` (written before the Dokploy pivot; its paths and assumptions are stale)

## Problem

Static sites currently deploy to Dokploy, which is the wrong target for them on both cost and latency:

- A static site on Dokploy consumes a VPS slot to run nginx, and serves every request from a single region.
- S3 + CloudFront (or GCS + Cloud CDN) serves from the edge for roughly the price of the bytes transferred.

The native static adapters that would do this already exist and are intact (`AwsS3Adapter`, `GcpStorageAdapter`), but they are unreachable: the deploy wizard hard-pins `deployStrategy` to the literal `"vps"` (`frontend/src/components/DeployWizard/types.ts:110`, `constants.ts:114`), and the worker routes every deploy to Dokploy when `DEPLOY_PROVIDER=dokploy` (`backend/src/services/deploy/domain/worker.ts:27`).

Worse, static sites are **actively broken** on the current path. A source-only Vite/Astro/Angular SPA is built by Railpack, which serves the output via Caddy on port 80, while `resolveContainerPort` returns 3000 because `isNodeApp` infers "runs a Node server" from the language alone (`dokploy/stages/configure-app.ts:571`, `:607`). Traefik forwards to 3000 → Bad Gateway. There is no test coverage for the static case.

## Goals

1. A static site deploys to cloud object storage + CDN instead of a VPS.
2. Dockier detects that a repo is a static site and proposes the static target; the user confirms at **project creation**.
3. The confirmed choice is persisted on the project so that deploys without a UI (push-to-deploy, webhooks) honour it.
4. Teardown destroys the right infrastructure for the target that actually built the project.

## Non-goals

- Replacing or removing the Dokploy pipeline for server apps.
- Reviving the `image-builder` service, which contains a third, CDN-less static implementation (`deployTarget: "s3"`, `source-bundler.ts:56`) that nothing calls. It should be treated as legacy.
- Static hosting on providers other than AWS and GCP.

## Vocabulary (binding)

"Static" currently means six different things in this codebase, and two of them are near-opposites. This spec uses these terms and no others:

| Term | Meaning in this spec |
|---|---|
| **`deployTarget`** (new, project-level) | User-confirmed intent: `"auto" \| "static" \| "server"`. Stored in `projects.settings`. |
| **`deployStrategy: "static"`** (existing) | The native pipeline strategy that builds locally and uploads output to S3/GCS. What this feature turns on. |
| **`buildType: "static"`** (existing, Dokploy) | Dokploy's nginx image that COPYs an **already-committed** build directory. **Not** what this feature uses. |
| **`isStaticSite`** (existing, Dokploy) | Misnomer for "the built output is committed to the repo". Hardcoded `false` at `dokploy/pipeline.ts:152`. Must stay `false`. |
| **`DetectedStack.isStatic`** / **`kind: "static"`** | Analyzer output meaning "produces static output". The detection signal this feature reads. |

**REQ-0 (trap):** Confirming `deployTarget: "static"` MUST NOT set Dokploy's `isStaticSite: true`. A source-only Astro repo with `isStaticSite: true` fails the build with `COPY dist .: "/dist": not found`. These are different axes: `deployTarget` selects *which pipeline*, `isStaticSite` describes *what is in the repo*.

## Requirements

### REQ-1 — Detect and propose at project creation

- **1.1** During project creation, after repo + branch + connection are selected, Dockier analyses the repo and determines whether it produces static output.
- **1.2** When static output is detected, the create form shows a confirmation control proposing static hosting, including the reason for the proposal and an indication of the cost difference.
- **1.3** The user can accept (→ `deployTarget: "static"`) or decline (→ `deployTarget: "server"`).
- **1.4** When static output is not detected, no control is shown and `deployTarget` is `"auto"`.
- **1.5** Detection failure must never block project creation. On failure, `deployTarget` is `"auto"` and creation proceeds.
- **1.6** Detection MUST NOT propose static for repos that `getStaticDeployBlockReason()` rejects: PHP/Python/Go runtimes, SSR Next/Nuxt/Astro/Remix, and Payload CMS (`deploy/domain/planning/static-site-builder.ts:66-99`).

### REQ-2 — Persist the target on the project

- **2.1** `deployTarget` is persisted at `projects.settings.deployTarget`. `projectSettingsSchema` is `.passthrough()` and `updateProject` shallow-merges settings, so no schema migration is required for this field.
- **2.2** `POST /projects` currently **omits `settings` from its body schema** (`projects/routes.ts:47-55`), so Zod strips it and `settings` sent at create is silently discarded. The create schema and the frontend client type (`frontend/src/services/projects.ts:20`) MUST be extended, or `deployTarget` will never persist.
- **2.3** `deployTarget` is editable after creation from project settings, following the `pushToDeploy` write pattern (`projectsApi.update(id, { settings: { ... } })`).
- **2.4** Existing projects default to `"auto"`, preserving today's behaviour exactly.

### REQ-3 — Route static deploys to the native static path

- **3.1** When a deployment's effective strategy is `"static"`, the worker routes to `executePipeline` (native) rather than `executeDokployPipeline`, **regardless of `DEPLOY_PROVIDER`** (`deploy/domain/worker.ts:27`).
- **3.2** The deployment-creation credential pre-flight that exists for Dokploy VPS provisioning (`deploy/domain/deployments.ts:289-303`) MUST NOT reject static deploys — it checks a precondition that does not apply to them.
- **3.3** `deployStrategy` is derived from the project's `deployTarget` when the caller does not specify one, so push-to-deploy and webhook deploys inherit it.
- **3.4** `POST /deploy/deployments` validates `deployStrategy` against the same enum as `/deploy/tofu/generate` (`z.enum(["vps","managed","static"])`). Today it accepts `z.string().max(50)` and blind-casts, so a typo silently becomes `"managed"` (`routes/deployments.ts:44`, `deployments.ts:316`).

### REQ-4 — AWS static deploys work end to end

- **4.1** `getAdapter("aws", "static")` resolves to `AwsS3Adapter` and the deploy produces a reachable CloudFront URL.
- **4.2** A static deploy template exists for AWS. Today `resolveDeployTemplate` finds no `aws`+`static` entry and silently falls back to `DEPLOY_TEMPLATES[0]` = `aws-managed-node` (`planning/templates.ts:16`, `:84-88`), giving static deploys an ECS template and the wrong `build_method`.
- **4.3** `buildAws()` has no `static` branch, so AWS+static currently generates an ECS Fargate Pulumi program (`pulumi-templates/aws.ts:6-9`). AWS static uses CloudFormation and needs no Pulumi program; the generated `tofu_script` must be inert rather than misleading.
- **4.4** Build-time environment variables reach the static build. `injectEnvVars` is a no-op on both static adapters, so a Vite SPA ships pointing at the wrong API URL. Without this the feature produces broken sites.
- **4.5** The deploy log clearly states the target, the bucket, the CloudFront distribution, and the file count.

### REQ-5 — Teardown destroys the correct infrastructure

- **5.1** Teardown currently routes on the global `DEPLOY_PROVIDER` flag (`lifecycle/project-teardown.ts:292`). With mixed routing this destroys the wrong kind of infrastructure.
- **5.2** Each deployment persists which pipeline handled it. The `deployments` table has no such column today; add one (migration `0074`) and write it in `createDeploymentRecord` (`domain/processor.ts:168-189`).
- **5.3** Teardown reads the persisted marker and dispatches accordingly.
- **5.4** The migration backfills existing rows following the `0060_projects_infra_state.sql` precedent: mark rows as the pipeline that must have built them, defaulting to preserve current behaviour.

### REQ-6 — Safety net for static apps that still reach Dokploy

A project with `deployTarget: "auto"` or `"server"`, or a tenant with no cloud credentials, can still send a static SPA through Railpack. That path must not Bad Gateway.

- **6.1** `resolveContainerPort` receives the analyzer's `kind` and returns 80 for static output on Railpack instead of inferring Node from the language (`configure-app.ts:602-618`).
- **6.2** Unit tests cover `resolveContainerPort` across railpack × (Node SSR, static SPA, PHP) and nixpacks × PHP. There is currently **no test coverage** for this function.
- **6.3** The build-failure advisory stops telling static-bundle users to "add a start script" (`stages/verify-deploy.ts:150-161`), which is wrong for a static site.
- **6.4** `publishDirectory` is populated rather than always falling back to the literal `"dist"` (`configure-app.ts:247`).

## Open questions

- **OQ-2 — GCP in scope for v1?** Recommendation: **no, AWS first.** GCP static requires the `pulumi` CLI, which is **not installed in `backend/Dockerfile`** (Node 22 + pnpm are), so `GcpStorageAdapter` would fail at `pulumi up` in production. Its upload path also never checks `fetch` status and swallows all errors (`adapters/gcp-storage.ts:285-357`), so it can report success having uploaded zero files. Both must be fixed before GCP ships.
- **OQ-3 — Custom domains in scope?** Recommendation: **defer.** v1 serves the CloudFront default domain. A custom domain needs an ACM certificate in `us-east-1` plus DNS, and the domains service only has a Dokploy applier (`domains/domain/dokploy-applier.ts`).
- **OQ-4 — Build-time env vars: how are they sourced?** REQ-4.4 says they must work; the open part is where they come from (project env files, a new per-project build-env list, or the existing `project_env_files` table from migration `0053`).

## Out of scope but noted

`POST /projects/:projectId/deploy/hook` (`routes/git-push-webhook.ts:63`) has no auth pre-handler; its token is `projectId.slice(0,8)`, and project ids appear in ordinary API responses. This is effectively an unauthenticated deploy trigger. Unrelated to static hosting, but it should be tracked separately.

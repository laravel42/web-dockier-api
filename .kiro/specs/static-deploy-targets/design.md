# Static Deploy Targets — Design

Companion to `requirements.md`. Verify every file:line against the current codebase before implementing — this document is a point-in-time snapshot.

## 1. Two axes, deliberately kept apart

The single most important design constraint is that two independent decisions have both been called "static" and must not be merged:

```
deployTarget (project-level, user-confirmed)     → WHICH PIPELINE runs
  "static"  → native pipeline → getAdapter(provider, "static") → S3/GCS + CDN
  "server"  → Dokploy pipeline
  "auto"    → current behaviour (DEPLOY_PROVIDER decides)

isStaticSite (per-deploy, Dokploy-only)          → WHAT IS IN THE REPO
  true  → repo ships a committed build dir; Dokploy's nginx COPYs it
  false → source only; Railpack must build it     ← stays hardcoded false
```

A source-only Astro repo is `deployTarget: "static"` **and** `isStaticSite: false`. Conflating them reintroduces the `COPY dist .: "/dist": not found` failure the hardcode at `dokploy/pipeline.ts:152` exists to prevent.

## 2. Flow

```
PROJECT CREATION (frontend/src/pages/Projects/)
  repo + branch + connection selected
    └─> analysis  ──> produces static output?  ──no──> deployTarget = "auto"
                              │ yes
                              └─> confirm control ──> "static" | "server"
    └─> POST /projects { ..., settings: { deployTarget } }

DEPLOY CREATION (wizard, redeploy, rollback, push-to-deploy, webhooks)
  createAndEnqueueDeployment
    └─> deployStrategy = explicit ?? project.settings.deployTarget mapped ?? "managed"
    └─> skip Dokploy credential pre-flight when strategy === "static"
    └─> persist deployments.deploy_provider = "native" | "dokploy"
    └─> enqueue

WORKER (deploy/domain/worker.ts:27)
  routePipeline(event)
    if event.deployStrategy === "static"        -> executePipeline   (native)
    else if DEPLOY_PROVIDER === "dokploy"       -> executeDokployPipeline
    else                                        -> executePipeline

NATIVE STATIC PATH (already implemented, currently unreachable)
  stageProviderCredentials -> stageClone -> stageLoadProjectContext
  -> stageAnalyze -> stageBuild (skipped: ctx.isStaticDeploy)
  -> stageProvision -> getAdapter(provider, "static")
       AwsS3Adapter: guard -> installDeps -> buildSite -> findOutputDir
                     -> ensureIndexHtml -> ensureS3Bucket -> syncFilesToS3
                     -> CFN s3.yml (CloudFront + OAC) -> poll -> AppUrl
  -> stagePostDeploy (skipped) -> stageFinalize -> stageHealthCheck

TEARDOWN (lifecycle/project-teardown.ts:292)
  read deployments.deploy_provider  (NOT the global flag)
    "native"  -> getAdapter(provider, strategy).destroy()
    "dokploy" -> teardownViaDokploy()
```

## 3. Detection at project creation

`useProjectForm.ts:145-180` already runs a detection effect at exactly the right moment — it fires on repo + branch + connection and calls `gitApi.getRepoBadges`. Two problems:

1. **Badges only return framework names with confidence scores.** There is no static-vs-server signal in that response.
2. **The richer analysis runs too late.** `gitApi.getStackAnalysis` is called *after* a successful create (`useProjectForm.ts:230-243`), purely to warm the badge cache.

Design: extend the existing effect to also call `getStackAnalysis` pre-submit, and surface a static/server classification from it. The backend already computes this twice — `DetectedStack.isStatic` (`repo-analyzer/index.ts:104`) and `RepoRuntimeInfo.kind` (`git-integration/domain/repo-config.ts:140-153`). `repo-config.ts` is the better source: it derives from runtime first, specifically to avoid the bug where a Laravel repo with a `package.json` picked up `static-export` from the Node analyzer and looked static.

The response needs a classification field the frontend can read. Confirm whether `getStackAnalysis` already exposes one before adding it — this was not verified.

UI placement: a sixth conditionally-rendered block in `ProjectFormModal.tsx`, after the Framework field (`:122-176`). A dedicated wizard step would be inconsistent with the rest of the form, which is single-page progressive disclosure.

Detection must apply the same exclusions as `getStaticDeployBlockReason()` (`planning/static-site-builder.ts:66-99`) so the proposal is never shown for an app that would be rejected at deploy time. Ideally share that predicate rather than reimplementing it.

## 4. Data model

**`projects.settings.deployTarget`** — JSONB, no migration. `projectSettingsSchema` is `.passthrough()` (`projects/schemas.ts:19`) and `updateProject` shallow-merges (`projects/domain/projects.ts:264-271`), so adding the key is additive. Add it explicitly to the schema for documentation and validation:

```ts
deployTarget: z.enum(["auto", "static", "server"]).optional(),
```

Rejected alternative: a dedicated `projects.deploy_target` column. `settings` is where every other project-level deploy preference already lives (`pushToDeploy`, `deployScript`, `healthCheck*`), and needs no migration.

**`deployments.deploy_provider`** — new column, migration `0074`. This one cannot live in JSON because teardown queries it.

```sql
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS deploy_provider TEXT NOT NULL DEFAULT 'dokploy';
```

Backfill follows the `0060_projects_infra_state.sql` precedent. Choose the default that preserves current behaviour for the deployed environment, and backfill historical rows from the best available evidence (`infra` metadata is written only on the native/webhook path, per `processor.ts:95-131`; Dokploy state lives in the `dokploy_applications` sibling table). Whether existing rows can be classified reliably was **not verified** — if not, default everything to the current global flag's value and accept that pre-migration history is approximate.

## 5. Changes by file

| File | Change |
|---|---|
| `deploy/domain/worker.ts:27` | Strategy-aware routing. `deployStrategy` is already on `PipelineInput` — no plumbing needed. |
| `deploy/domain/deployments.ts:289` | Exempt static from the Dokploy credential pre-flight. |
| `deploy/domain/deployments.ts:252` | Derive `deployStrategy` from the project's `deployTarget` when not explicitly supplied. |
| `deploy/routes/deployments.ts:44` | `deployStrategy` → `z.enum(["vps","managed","static"])`. |
| `deploy/domain/processor.ts:168` | Persist `deploy_provider`. |
| `deploy/domain/planning/templates.ts` | Add `aws-static-generic` with `strategy: "static"`. Without it, AWS+static silently resolves to `aws-managed-node`. |
| `deploy/domain/pulumi-templates/aws.ts:6` | Add a `static` branch that emits an inert program; AWS static uses CFN, not Pulumi. |
| `deploy/domain/adapters/aws-s3.ts:75` | Implement `injectEnvVars` as build-time env for `buildSite`, or pass env through `AdapterContext`. |
| `deploy/domain/lifecycle/project-teardown.ts:292` | Route on the persisted marker. |
| `deploy/domain/dokploy/stages/configure-app.ts:602` | REQ-6: `resolveContainerPort` takes `kind`; static → 80. |
| `deploy/domain/dokploy/stages/verify-deploy.ts:150` | REQ-6: correct the advisory for static bundles. |
| `projects/routes.ts:47` | Accept `settings` on create (currently stripped). |
| `projects/schemas.ts:7` | Add `deployTarget` to `projectSettingsSchema`. |
| `frontend/src/services/projects.ts:20` | Add `settings` to the create client type. |
| `frontend/src/pages/Projects/useProjectForm.ts:145` | Extend detection; add `deployTarget` to `submitData`. |
| `frontend/src/pages/Projects/ProjectFormModal.tsx:176` | Confirmation control. |
| `frontend/src/pages/ProjectDetail/settings/DeploymentsSection.tsx` | Post-creation editing of `deployTarget`. |

## 6. Known defects in the static adapters

These exist today and will surface the moment the path becomes reachable.

- **`injectEnvVars` is a no-op** on both adapters (`aws-s3.ts:75-83`, `gcp-storage.ts:52-60`). REQ-4.4.
- **No custom-domain support.** Users get the CloudFront domain or a bare GCP global IP. OQ-3.
- **GCS uploads can silently succeed with zero files.** The `fetch` calls in `gcp-storage.ts:285-357` never check status, and the enclosing block catches everything and logs `⚠`. AWS is strict by comparison (`aws-s3.ts:137` throws on build failure).
- **`pulumi` is not in `backend/Dockerfile`.** `GcpStorageAdapter` shells out to it and throws without `event.tofuScript`. GCP static cannot work on the deployed image as-is.
- **`s3.yml` does not create the bucket** — the adapter must do it first, which it does (`aws-s3.ts:158`). The template description still says "created by CodeBuild", which is stale but harmless.
- **Zero adapter tests.** No test file references `AwsS3Adapter`, `GcpStorageAdapter`, or `static-site-builder`.

## 7. Worker environment

The static adapters build **in-process on the backend host**: `installDeps` then `buildSite` run `pnpm`/`yarn`/`npm` in the cloned repo (`planning/static-site-builder.ts:121`, `:187`). `backend/Dockerfile` is `node:22-bookworm-slim` with corepack and pnpm, so the toolchain exists. Not assessed: build duration against the pg-boss `expireInSeconds: 1800` ceiling (`worker.ts:40`), disk headroom for `node_modules` on Railway, and behaviour under concurrent static deploys. Worth measuring during Phase 1 rather than assuming.

## 8. Phasing

- **Phase 1 — AWS static end to end.** REQ-1 through REQ-5, AWS only. Delivers the cost saving.
- **Phase 2 — REQ-6 safety net.** Independent of Phase 1 and can land first; it fixes a live bug.
- **Phase 3 — GCP static.** Resolves OQ-2: `pulumi` into the image, fix the silent upload.
- **Phase 4 — Custom domains.** Resolves OQ-3: ACM in `us-east-1`, DNS, a static applier in the domains service.

## 9. Verification

Unit-testable: routing predicate, strategy derivation, template resolution, `resolveContainerPort`, detection exclusions.

Not unit-testable and requiring a real deploy: the S3 upload, CloudFront provisioning, and teardown. Phase 1 is not done until a real Vite repo deploys to a working CloudFront URL and a teardown removes the bucket and distribution. A mocked adapter test proves nothing about whether this works.

The current state of `AwsS3Adapter` against live AWS APIs is **unverified** — it has not run since before the Dokploy pivot.

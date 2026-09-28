# Static Deploy Targets — Tasks

See `requirements.md` and `design.md`. Verify file:line references against the current codebase before editing.

## Phase 2 first — safety net (independent, fixes a live bug)

- [ ] 1. Fix the static-SPA port bug on the Dokploy path
  - [x] 1.1 Thread the analyzer's `kind` ("server" | "static") from `dokploy/pipeline.ts` into `stageConfigureApp`. It is already computed by `resolveRuntimeStartCommand` and currently only used for an error-message hedge in `verify-deploy.ts:159`.
  - [x] 1.2 Change `resolveContainerPort(buildType, primaryLanguage, techStack)` to also take `kind`, and return 80 for railpack + static output. Today `isNodeApp` returns true for any TS/JS repo (`configure-app.ts:571`), so a Vite SPA routes to 3000 while Railpack's Caddy serves on 80. — `kind` is optional, so a failed analysis keeps the previous language-based behaviour.
  - [x] 1.3 Add unit tests for `resolveContainerPort`: railpack × Node SSR (3000), railpack × static SPA (80), railpack × PHP (80), nixpacks × PHP (80), dockerfile (3000). No coverage exists today. — 16 cases in `__tests__/container-port.test.ts`.
  - [x] 1.4 Stop `nodeRuntimeEnv` injecting `PORT`/`HOST` for static output (`configure-app.ts:633-660`).
  - [x] 1.5 Fix the failure advisory in `verify-deploy.ts:150-161` so static bundles are not told to "add a start script". — The actual defect was narrower than written: `missingStart` already requires `kind === "server"`, so static bundles never got the start-script advice. What they did get was the PORT/0.0.0.0 paragraph, which is meaningless for a bundle with no server process. Replaced with a static-specific diagnosis (port mismatch vs empty build output); 2 tests added.
  - [ ] 1.6 ~~Populate `publishDirectory` instead of always defaulting to `"dist"`~~ — **deferred, not skipped.** `publishDirectory` is only read when `buildType === "static"` (`configure-app.ts:247`), which requires `isStaticSite === true`, which is hardcoded `false` at `pipeline.ts:152`. The code path is unreachable, so populating the field would add logic that cannot execute. Revisit if Dokploy's `static` build type ever becomes reachable (i.e. if a committed-build-output signal is introduced).
  - [ ] 1.7 **Verify against a real deploy**: confirm which port Railpack actually serves a built SPA on. The whole fix rests on it being 80, which is inferred from code comments, not observed. If Railpack runs a Node preview server instead, revisit 1.2 before shipping. — **Still outstanding. Cannot be done from the repo.**

## Phase 1 — AWS static end to end

- [ ] 2. Persist the target on the project
  - [ ] 2.1 Add `deployTarget: z.enum(["auto","static","server"]).optional()` to `projectSettingsSchema` (`projects/schemas.ts:7`).
  - [ ] 2.2 Accept `settings` in the `POST /projects` body schema (`projects/routes.ts:47-55`) — it is currently stripped by Zod, so anything sent at create is silently discarded.
  - [ ] 2.3 Add `settings` to the frontend create client type (`frontend/src/services/projects.ts:20`).
  - [ ] 2.4 Unit-test that `deployTarget` survives create and a partial settings update without clobbering siblings (`updateProject` shallow-merges, `projects.ts:264-271`).

- [ ] 3. Detect and propose at project creation
  - [ ] 3.1 Confirm whether `gitApi.getStackAnalysis` already returns a static-vs-server classification. If not, expose `RepoRuntimeInfo.kind` (`git-integration/domain/repo-config.ts:140-153`) on that response — it derives from runtime first and avoids the Laravel-looks-static bug.
  - [ ] 3.2 Extract the static-eligibility predicate from `getStaticDeployBlockReason()` (`planning/static-site-builder.ts:66-99`) so detection and deploy-time validation share one implementation rather than drifting.
  - [ ] 3.3 Extend the detection effect in `useProjectForm.ts:145-180` to call `getStackAnalysis` pre-submit and derive a proposal. Keep the existing badge-based framework detection.
  - [ ] 3.4 Add the confirmation control to `ProjectFormModal.tsx` after the Framework field (`:176`), showing the detection reason and the cost comparison.
  - [ ] 3.5 Include `deployTarget` in `submitData` (`useProjectForm.ts:206-219`).
  - [ ] 3.6 Ensure detection failure leaves `deployTarget: "auto"` and never blocks creation (the existing effect already degrades silently — preserve that).
  - [ ] 3.7 Allow editing `deployTarget` after creation in project settings, following the `pushToDeploy` pattern (`ProjectDetail/settings/DeploymentsSection.tsx:21-24`).

- [ ] 4. Route static deploys to the native pipeline
  - [ ] 4.1 Make `routePipeline` strategy-aware (`deploy/domain/worker.ts:27`): `deployStrategy === "static"` → `executePipeline`, regardless of `DEPLOY_PROVIDER`. `deployStrategy` is already on `PipelineInput`.
  - [ ] 4.2 Exempt static from the Dokploy credential pre-flight (`deployments.ts:289-303`) — it checks a VPS-provisioning precondition that does not apply.
  - [ ] 4.3 Derive `deployStrategy` from `project.settings.deployTarget` in `createAndEnqueueDeployment` when the caller sends none, so push-to-deploy and webhooks inherit it.
  - [ ] 4.4 Tighten `deployStrategy` to `z.enum(["vps","managed","static"])` in `routes/deployments.ts:44` and drop the blind cast at `deployments.ts:316`.
  - [ ] 4.5 Unit-test routing: static → native under `DEPLOY_PROVIDER=dokploy`; server → Dokploy; auto → unchanged.

- [ ] 5. Make the AWS static path correct
  - [ ] 5.1 Add an `aws-static-generic` entry to `DEPLOY_TEMPLATES` (`planning/templates.ts`). Without it, `resolveDeployTemplate` falls through to `DEPLOY_TEMPLATES[0]` = `aws-managed-node`, giving static deploys an ECS template and the wrong `build_method`.
  - [ ] 5.2 Add a `static` branch to `buildAws()` (`pulumi-templates/aws.ts:6`) emitting an inert program. AWS static provisions via CloudFormation; today it would generate an ECS Fargate program.
  - [ ] 5.3 Implement build-time env vars for static (REQ-4.4). Resolve **OQ-4** (where they come from) first. Without this, a Vite SPA ships pointing at the wrong API URL.
  - [ ] 5.4 Improve static deploy logging: target, bucket, distribution id, file count.
  - [ ] 5.5 Add the first tests for `AwsS3Adapter` — at minimum `supports()`, `sanitizeBucketName()`, and the `getStaticDeployBlockReason` guard. No adapter tests exist today.

- [ ] 6. Teardown correctness
  - [ ] 6.1 Migration `0074_deployments_deploy_provider.sql` — add `deploy_provider TEXT NOT NULL DEFAULT '<current-behaviour>'`, using `IF NOT EXISTS`.
  - [ ] 6.2 Backfill historical rows following the `0060_projects_infra_state.sql` pattern. Determine first whether existing rows can be classified reliably; if not, default to the current global flag and note that pre-migration history is approximate.
  - [ ] 6.3 Write `deploy_provider` in `createDeploymentRecord` (`processor.ts:168-189`).
  - [ ] 6.4 Route teardown on the persisted marker instead of the global flag (`lifecycle/project-teardown.ts:292`).
  - [ ] 6.5 Unit-test that a native-static deployment tears down via `getAdapter(...).destroy()` and a Dokploy one via `teardownViaDokploy()`, under both `DEPLOY_PROVIDER` values.

- [ ] 7. End-to-end verification (Phase 1 is not done without this)
  - [ ] 7.1 Deploy a real source-only Vite repo with `deployTarget: "static"` and confirm a working CloudFront URL.
  - [ ] 7.2 Redeploy the same project and confirm the CFN stack updates rather than erroring.
  - [ ] 7.3 Tear it down and confirm both the bucket and the distribution are removed.
  - [ ] 7.4 Confirm a push-to-deploy on that project stays on the static path (it reuses `deploy_strategy` from the last deployment, `push-to-deploy.ts:101-110`).
  - [ ] 7.5 Measure build duration against the 1800s job ceiling (`worker.ts:40`) and disk headroom for `node_modules` on Railway.
  - [ ] 7.6 Confirm a server app still deploys via Dokploy unchanged.

## Phase 3 — GCP static (resolves OQ-2)

- [ ] 8. Make GCP static viable
  - [ ] 8.1 Install the `pulumi` CLI in `backend/Dockerfile`. It is absent today, so `GcpStorageAdapter` cannot work on the deployed image.
  - [ ] 8.2 Fix the silent upload failure in `gcp-storage.ts:285-357` — check `fetch` status and stop swallowing errors. It can currently report success having uploaded zero files.
  - [ ] 8.3 Confirm `gcp-static-site` template resolution and the `buildGcpCloudStorageCdn` program still work (`pulumi-templates/gcp.ts:8`).
  - [ ] 8.4 End-to-end: deploy, redeploy, teardown on GCP.

## Phase 4 — Custom domains (resolves OQ-3)

- [ ] 9. Custom domains for static
  - [ ] 9.1 ACM certificate issuance in `us-east-1` for CloudFront.
  - [ ] 9.2 Add the alternate domain name to the distribution and wire DNS.
  - [ ] 9.3 A static applier in the domains service, which today has only a Dokploy applier.

## Cleanup (independent)

- [ ] 10. Reduce the "static" ambiguity that caused this
  - [ ] 10.1 Rename `isStaticSite` → `hasCommittedBuildOutput` across `RepoAnalysisInfo`, `determineBuildType`, and `dokploy/pipeline.ts:152`. This single rename removes most of the trap.
  - [ ] 10.2 Collapse the five parallel declarations of the `"vps" | "managed" | "static"` union (`pulumi-templates/types.ts:13`, `processor.ts:27`, `planning/planner.ts:20`, `planning/templates.ts:6`, `frontend/src/services/deploy.ts:129`) into one shared type.
  - [ ] 10.3 Decide the fate of `services/image-builder/` — a third static implementation (`deployTarget: "s3"`, CodeBuild sync, no CDN) that no frontend code calls and whose client references a route that no longer exists. Delete or mark clearly as legacy.
  - [ ] 10.4 Remove the dead `redeployLatest` client method, or wire it up — the UI's "redeploy" button currently calls the **rollback** endpoint (`useDeployDetail.ts:180`).

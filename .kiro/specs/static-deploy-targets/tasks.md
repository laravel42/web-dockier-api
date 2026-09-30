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
  - [x] 4.1 Make `routePipeline` strategy-aware (`deploy/domain/worker.ts:27`): `deployStrategy === "static"` → `executePipeline`, regardless of `DEPLOY_PROVIDER`. `deployStrategy` is already on `PipelineInput`.
  - [x] 4.2 Exempt static from the Dokploy credential pre-flight (`deployments.ts:289-303`) — it checks a VPS-provisioning precondition that does not apply.
  - [ ] 4.3 Derive `deployStrategy` from `project.settings.deployTarget` in `createAndEnqueueDeployment` when the caller sends none, so push-to-deploy and webhooks inherit it. — **blocked on task 2** (persistence). Partially mitigated: push-to-deploy now carries the previous deployment's strategy forward via `toDeployStrategy`, so a project that has deployed statically once stays static.
  - [x] 4.4 Tighten `deployStrategy` to `z.enum(["vps","managed","static"])` in `routes/deployments.ts:44` and drop the blind cast at `deployments.ts:316`. — Also added a shared `DeployStrategy` type and `toDeployStrategy()` narrowing helper in `deploy/types.ts`, applied at the three DB boundaries that read the free-text `deploy_strategy` column (redeploy, rollback, push-to-deploy). Down payment on task 10.2.
  - [x] 4.5 Unit-test routing: static → native under `DEPLOY_PROVIDER=dokploy`; server → Dokploy; auto → unchanged. — 7 cases in `domain/__tests__/route-pipeline.test.ts`.

- [ ] 5. Make the AWS static path correct
  - [x] 5.1 Add an `aws-static-generic` entry to `DEPLOY_TEMPLATES` (`planning/templates.ts`). Without it, `resolveDeployTemplate` falls through to `DEPLOY_TEMPLATES[0]` = `aws-managed-node`, giving static deploys an ECS template and the wrong `build_method`. — 6 tests in `planning/__tests__/templates.test.ts` pin every (provider, strategy) pair.
  - [x] 5.2 Add a `static` branch to `buildAws()` (`pulumi-templates/aws.ts:6`) emitting an inert program. AWS static provisions via CloudFormation; today it would generate an ECS Fargate program.
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

## Deploy timeline

- [x] 16. Show a static-appropriate stage timeline in the Deploy step
  - [x] 16.1 `STAGE_DEFS` in `StepDeploy.tsx` was hardcoded to Dokploy's five stages, so a static deploy displayed "Create Project / Sync Git Credentials / Provision Server / Configure Application / Deploy" — none of which happen — and every step stayed pending because the native pipeline emits `── Section ──` headers, not `[stage:xxx]` markers. Replaced with a per-strategy stage list: static gets Clone → Analyze → Build Site → Upload Files → Provision CDN → Verify.
  - [x] 16.2 Added `NATIVE_STAGE` ids + `stageMarker()` to `lib/logging.ts` and extended `ContextualLogger.section(title, stageId?)` so tagging a section emits the marker. Tagged the six native boundaries: clone and analyze (`lib/build-pipeline.ts`), build-site/upload/cdn (`adapters/aws-s3.ts`), verify (`pipeline/health.ts`). The console logger ignores the id, so image-builder and scan logs are unchanged.
  - [x] 16.3 Parser now advances earlier stages when a later one starts. The native pipeline only marks section *starts*, so without this every step would spin forever. Also marks all stages complete on a succeeded deployment, since the last native section is followed by untagged lines. Failed stages are never downgraded.
  - [x] 16.4 Extracted the parsing into `steps/deployStages.ts` — it is the real logic and was untestable inside a component file (also silenced two `react-refresh/only-export-components` warnings). 11 tests in `frontend/src/__tests__/deploy-stages.test.ts` built from the real log of the first successful static deploy, including a case asserting the Dokploy timeline still behaves as before.
  - Not covered: a native **vps/managed** deploy would show the Dokploy timeline, since the strategy, not the pipeline, selects the list. Unreachable today (static is the only native path from the UI). Revisit if `DEPLOY_PROVIDER=native` is ever used for servers.

## Routing on the deployed site

- [x] 17. Make clean URLs and 404s work on a deployed static site
  - [x] 17.1 **Root cause:** OAC requires an S3 *REST* origin, which resolves a request path to an object key verbatim — no `.html` suffixing, no directory index resolution beyond `DefaultRootObject` for `/`. A site built to `editor.html` was unreachable at `/editor`.
  - [x] 17.2 **Why it was invisible:** `s3.yml` mapped 403 *and* 404 to `/index.html` with a **200**, so every missing page silently rendered the homepage with a success status. Observed live: a 41-page Astro site where every sub-page showed the homepage and only same-page anchors worked.
  - [x] 17.3 Added an `AWS::CloudFront::Function` on viewer-request that appends `index.html` to trailing-slash paths and `.html` to extensionless ones, leaving paths with an extension alone. ES5-only — the `cloudfront-js-2.0` runtime is not a full modern JS environment.
  - [x] 17.4 Replaced the hardcoded SPA fallback with `ErrorPagePath` / `ErrorResponseCode` parameters, set per deploy by `notFoundBehaviourFor()`: SPA → `/index.html` + 200 (client-side routing needs it), multi-page → `/404.html` + 404, multi-page with no 404 page → `/index.html` + 404.
  - [x] 17.5 Site shape is decided from the **uploaded object keys**, not the detected framework — the Astro repo that exposed this was misdetected as framework `spa` (task 15), so the label cannot be trusted while the file layout is ground truth. A `404.html` outweighs the page count.
  - [x] 17.6 `cloudfront:*Function*` permissions added to `docs/operations/aws-static-hosting-iam.md`. Without them stack creation now fails outright rather than degrading — existing deployments need the policy updated before their next deploy.
  - [x] 17.7 9 tests in `adapters/__tests__/aws-s3-naming.test.ts` using the real file list from the failing build, including one asserting a multi-page site never gets a 200.
  - Residual gap: a directory-format build (`editor/index.html`) is only reachable at `/editor/` with the trailing slash, since the function cannot probe S3 to choose between `/editor.html` and `/editor/index.html`. Astro and Next emit trailing slashes for that format by default, so it works in practice. Revisit if a generator turns up that does neither.

## Diagnosability

- [x] 18. Surface why a CloudFormation stack failed
  - [x] 18.1 A rolled-back stack reports an empty `StackStatusReason`, so `pollStackStatus` logged the status as its own reason: `CloudFormation stack failed: UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS — UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS`. Useless. Added `describeStackFailureReason()`, which reads `DescribeStackEvents`, keeps genuine `*_FAILED` resource events, drops CloudFormation's "Resource creation/update cancelled" noise, and reports the **oldest** failure — the one that triggered the rollback.
  - [x] 18.2 Fixed a substring-matching bug in the poller: `CFN_FAILURE_PATTERNS` are matched with `includes()`, and `UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS` contains `UPDATE_ROLLBACK_COMPLETE`, so a rollback still in flight was reported as terminal — before its events were even written. Transient `*_IN_PROGRESS` states are now skipped first.
  - [x] 18.3 Added `cloudformation:DescribeStackEvents` to the documented policy. This reverses an earlier least-privilege trim: the principle (grant only what's invoked) was right, but the correct response was to invoke it rather than stay blind. Diagnosis is best-effort — a missing permission degrades to a warning rather than replacing the deploy failure with a different one.
  - [x] 18.4 Changed `ErrorResponseCode` to a `Number` parameter. `CustomErrorResponse.ResponseCode` is an integer property and relying on CloudFormation to coerce a String parameter was an avoidable suspect while debugging this rollback.
  - [x] 18.5 7 tests in `infra/__tests__/cfn-failure-reason.test.ts`, including root-cause ordering, noise filtering, and graceful degradation without the IAM permission.

## Resource namespace & CDN follow-ups

- [x] 11. Namespace static-hosting buckets under `dockier-*`
  - [x] 11.1 `dockier-<account-id>-<repo>-static` for the site and `dockier-<account-id>-templates` for CFN staging, replacing `<repo>-static-site` and `image-builder-templates-<account>`. Account id gives global uniqueness (S3 names are global); the prefix lets tenant IAM scope to `arn:aws:s3:::dockier-*` instead of `*-static-site`, which would match unrelated buckets in other accounts.
  - [x] 11.2 Name stays derived from account + repo only — deliberately stable across deploys, because `destroy()` recomputes it and the CloudFront origin points at it. A per-deploy component would orphan a bucket per deploy and break teardown.
  - [x] 11.3 `s3.yml` now takes the bucket through its required `SourceBucket` parameter instead of interpolating `${AppName}-static-site` in four places, so the naming rule exists only in the adapter.
  - [x] 11.4 15 tests in `adapters/__tests__/aws-s3-naming.test.ts` covering stability, per-account and per-repo uniqueness, and the S3 naming rules including the recomputed 63-char budget.
  - [x] 11.5 Fixed an empty `catch {}` in `destroy()` that silently swallowed bucket-deletion failures, leaving a bucket the tenant keeps paying for. An already-absent bucket is now treated as success; anything else is reported.
  - Done before the first successful static deploy, so no buckets existed to migrate. Renaming after one would have needed a migration.

- [ ] 12. CloudFront invalidation on redeploy
  - [ ] 12.1 Nothing in the codebase calls CloudFront directly — there is no invalidation on redeploy. Not currently a correctness bug: the distribution uses CachingOptimized, which respects origin `Cache-Control`, and the adapter uploads HTML as `no-cache` with hashed assets as `immutable`. It matters for forced refreshes and for sites with unhashed assets.
  - [ ] 12.2 Add `cloudfront:CreateInvalidation` to the documented IAM policy at the same time — deliberately omitted today rather than granted unused.

- [ ] 13. Migrate the rest of the AWS resource namespace to `dockier-*` (needs a migration plan)
  - [ ] 13.1 `stackNameFor()` in `lib/naming.ts` produces `image-builder-app-<name>` and is shared by the EC2, ECS and S3 adapters. **Live EC2/ECS deployments use these stack names** — renaming would make Dockier lose track of every existing stack, so teardown would target a non-existent stack and orphan the real infrastructure.
  - [ ] 13.2 Needs either a grandfathering lookup (try the new name, fall back to the legacy one) or a one-off migration recorded per deployment. Unlike task 11 this cannot be done for free.
  - [ ] 13.3 Same question for ECR repositories and any IAM roles/instance profiles created by the adapters.

- [ ] 14. Skip Dockerfile generation for static deploys
  - [ ] 14.1 `stageAnalyze` calls `analyzeAndGenerate` unconditionally (`pipeline/stages.ts:99`), so a static deploy generates a Dockerfile it never uses — and pays for an OpenAI call in the AI review. Observed in the first live static deploy: `✓ AI improved Dockerfile [3.8s]`. Skip when `ctx.isStaticDeploy`.

- [ ] 15. Investigate framework misdetection on Astro repos
  - [ ] 15.1 A repo with `astro@7.2.2` in its dependencies logged `Framework: spa 7.2.2`. The SPA fallback branch takes its version from React/Vue/Vite, so 7.2.2 matching Astro's version suggests an unexpected path through `repo-analyzer/analyzers/node.ts` — possibly related to the workspace detection (`Features: workspace, static-export`).
  - [ ] 15.2 Harmless today: `static-export` was still detected, which is what `getStaticDeployBlockReason` checks, and the build succeeded. It matters for task 3, where detection drives the static proposal.

## Cleanup (independent)

- [ ] 10. Reduce the "static" ambiguity that caused this
  - [ ] 10.1 Rename `isStaticSite` → `hasCommittedBuildOutput` across `RepoAnalysisInfo`, `determineBuildType`, and `dokploy/pipeline.ts:152`. This single rename removes most of the trap.
  - [ ] 10.2 Collapse the five parallel declarations of the `"vps" | "managed" | "static"` union (`pulumi-templates/types.ts:13`, `processor.ts:27`, `planning/planner.ts:20`, `planning/templates.ts:6`, `frontend/src/services/deploy.ts:129`) into one shared type.
  - [ ] 10.3 Decide the fate of `services/image-builder/` — a third static implementation (`deployTarget: "s3"`, CodeBuild sync, no CDN) that no frontend code calls and whose client references a route that no longer exists. Delete or mark clearly as legacy.
  - [ ] 10.4 Remove the dead `redeployLatest` client method, or wire it up — the UI's "redeploy" button currently calls the **rollback** endpoint (`useDeployDetail.ts:180`).

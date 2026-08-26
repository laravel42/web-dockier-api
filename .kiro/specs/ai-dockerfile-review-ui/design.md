# Design Document

## Overview

Add a stateless, pre-deploy Dockerfile preview that surfaces the Phase 1 AI review in the Deploy Wizard's Build step. A new backend endpoint clones the repo, runs the exact generation + review primitives the deploy pipeline uses, and returns the mechanical Dockerfile, the final (post-review) Dockerfile, and the structured `changes`. The wizard fetches this when the user reaches the Build step and renders it in a panel alongside the existing IaC script preview.

The preview is **informational and non-blocking**: it never gates navigation, never persists anything, and its failure never stops a deploy. The real deploy still generates and reviews the Dockerfile at deploy time, so the preview is a faithful representation, not a binding artifact.

## Architecture

```
Deploy Wizard (frontend)
  Step 4 "Build" (StepCompose)
    ├─ existing: Docker toggle, Dockerfile source, build method, IaC script preview
    └─ NEW: Dockerfile review panel
              │  useDeployWizard.generatePreview()  (once per input set)
              ▼
        deployApi.previewDockerfile({ gitConnectionId, repo, branch, knownPlatform, useRepoDockerfile })
              │  POST /deploy/dockerfile/preview   (DEPLOY_CREATE, rate-limited, bounded timeout)
              ▼
  Backend deploy service (request handler)
        previewDockerfile() domain function
          ├─ resolve tenant-scoped git credentials
          ├─ resolve knownPlatform from projectId (getProjectDeployConfig)
          ├─ cloneRepo(...)                         → repoDir, workDir
          ├─ analyzeAndGenerate({ repoDir, logger, knownPlatform,
          │     skipExistingDockerfile: useRepoDockerfile, capture: true })
          │       → { mechanicalDockerfile, finalDockerfile, revised,
          │           changes, skipReason, source, aiEnabled, runtime, framework }
          └─ finally: rm(workDir)                    (always)
              │
              ▼  { aiEnabled, source, mechanicalDockerfile, finalDockerfile, revised, changes[], skipReason?, runtime, framework }
        (no DB writes)
```

The endpoint mirrors the stateless compute-and-return shape of the existing `POST /deploy/tofu/generate`, but unlike that route it must clone (so it carries a higher timeout, a rate limit, and guaranteed cleanup).

**Single source of truth.** Rather than reimplementing the generate → gate → review sequence, `analyzeAndGenerate()` is extended with an opt-in `capture` mode that returns the Dockerfile strings, the review `changes`, `skipReason`, `source`, and `aiEnabled` in addition to its existing behavior. Both the deploy pipeline and the preview call the same function, so gating, prompt wiring, and pre-generation steps (packageManager injection, lockfile copying) can never drift between preview and deploy. In the preview's throwaway clone, the file `analyzeAndGenerate` writes to disk is simply discarded when `workDir` is removed.

### Current vs proposed

- **Current:** the review runs only inside the deploy pipeline background job; outcomes appear in deploy logs after a deploy starts.
- **Proposed:** a synchronous preview path exposes the same result in the Build step before deploy, with no change to the pipeline itself.

## File Structure

```
backend/src/lib/
└── build-pipeline.ts              ← MODIFIED: add opt-in `capture` mode to analyzeAndGenerate

backend/src/services/deploy/
├── routes/dockerfile-preview.ts   ← NEW: POST /deploy/dockerfile/preview route
├── routes.ts                      ← MODIFIED: register the new route
├── schemas.ts                     ← MODIFIED: dockerfilePreview request/response schemas
└── domain/
    ├── dockerfile-preview.ts      ← NEW: previewDockerfile() — clone + analyzeAndGenerate(capture), stateless
    └── __tests__/dockerfile-preview.test.ts  ← NEW

frontend/src/
├── services/deploy.ts             ← MODIFIED: deployApi.previewDockerfile + types
└── components/DeployWizard/
    ├── types.ts                   ← MODIFIED: WizardState preview fields + DockerfilePreview type
    ├── useDeployWizard.ts         ← MODIFIED: generatePreview(), previewLoading/previewError, trigger
    ├── DeployWizard.tsx           ← MODIFIED: pass preview props to StepCompose
    └── steps/
        ├── StepCompose.tsx        ← MODIFIED: render the preview panel
        └── DockerfilePreviewPanel.tsx  ← NEW: the panel component (states)
```

No new backend dependency and no database migration.

## Data Models

Backend request/response (Zod in `schemas.ts`), mirrored by frontend types:

```typescript
// Request
interface DockerfilePreviewRequest {
  gitConnectionId: string;   // uuid or ""
  repo: string;              // "owner/name"
  branch: string;
  projectId?: string;        // used to resolve knownPlatform server-side
  useRepoDockerfile?: boolean;
}

// Response
interface DockerfilePreviewResponse {
  aiEnabled: boolean;                 // review actually ran (key set + flag on + source=generated)
  source: "generated" | "repo";       // Dockier-generated vs the repo's own Dockerfile
  mechanicalDockerfile: string;        // rule-based output (or the repo Dockerfile when source=repo)
  finalDockerfile: string;             // after review; == mechanical when not revised
  revised: boolean;
  changes: Array<{ what: string; why: string }>;
  skipReason?: string;                 // present when review was skipped/rejected
  runtime: string;                     // e.g. "node"
  framework: string;                   // e.g. "nextjs" | "generic"
}
```

Frontend `WizardState` additions:

```typescript
// Build step (4) — Dockerfile preview
dockerfilePreview: DockerfilePreviewResponse | null;
```

`useDeployWizard` local state (not persisted in WizardState): `previewLoading: boolean`, `previewError: string`, plus a ref tracking the last previewed input key to enforce "once per input set".

## Components and Interfaces

### Backend: `analyzeAndGenerate` capture mode (single source of truth)

`AnalyzeOptions` gains `capture?: boolean`. `AnalyzeResult` gains optional fields populated only when `capture` is true:

```typescript
interface AnalyzeOptions {
  repoDir: string;
  logger: ContextualLogger;
  skipExistingDockerfile?: boolean;
  knownPlatform?: string;
  capture?: boolean;   // NEW: also return Dockerfile strings + review details
}

interface AnalyzeResult {
  // ...existing fields (repoConfig, detectedStack, detectedPort, dockerfileGenerated, aiReviewed, aiRevised)
  // Populated only when capture === true:
  mechanicalDockerfile?: string;   // rule-based output, or the repo Dockerfile when skipExistingDockerfile
  finalDockerfile?: string;        // after review; == mechanical when not revised
  reviewChanges?: Array<{ what: string; why: string }>;
  reviewSkipReason?: string;
  source?: "generated" | "repo";
  aiEnabled?: boolean;
}
```

Capture mode changes nothing observable for the pipeline (it already computes `df`/`finalDf` internally); it just also records those values on the result. The existing write-to-disk and logging behavior is unchanged.

### Backend domain: `previewDockerfile()`

```typescript
interface PreviewDockerfileInput {
  tenantId: string;
  gitConnectionId: string;
  repo: string;
  branch: string;
  projectId?: string;
  useRepoDockerfile?: boolean;
}

export async function previewDockerfile(
  input: PreviewDockerfileInput,
): Promise<DockerfilePreviewResponse>;
```

Behavior (thin — no generation/review logic of its own):
1. Resolve git credentials for the tenant (same lookup the pipeline's `stageClone` uses).
2. Resolve `knownPlatform` from `projectId` via `getProjectDeployConfig` (matches the pipeline's `loadProjectContext`).
3. `cloneRepo({ git, branch, shortId, logger })` with a console/no-op `ContextualLogger`.
4. `analyzeAndGenerate({ repoDir, logger, knownPlatform, skipExistingDockerfile: !!useRepoDockerfile, capture: true })`.
5. Map the captured `AnalyzeResult` fields into `DockerfilePreviewResponse` (adding `runtime`/`framework` from `repoConfig`).
6. `finally { await rm(workDir, { recursive: true, force: true }).catch(() => {}) }`.

All generation and review — including gating, non-fatal fallback, and the Phase 1 context helpers — lives in `analyzeAndGenerate`; the preview only clones, delegates, maps, and cleans up.

### Backend route: `POST /deploy/dockerfile/preview`

Follows the `tofu.ts` pattern: typed route, `preHandler: [app.requirePermission(PERMISSIONS.DEPLOY_CREATE), tenantRateLimit({ max, windowMs, prefix: "dockerfile-preview" })]`, `handlerTimeout` sized for clone + review (≈ 120–150s). Resolves `tenantId` via `getAuth(request)`, calls `previewDockerfile`, returns the response schema.

### Frontend: `deployApi.previewDockerfile`

Added to `frontend/src/services/deploy.ts` using the shared `request<DockerfilePreviewResponse>("/deploy/dockerfile/preview", { method: "POST", body })` helper.

### Frontend: `generatePreview()` in `useDeployWizard`

A `useCallback` parallel to `generateScript`: guards on `useDocker && !useRepoDockerfile && deployStrategy !== "static"`, sets `previewLoading`, calls `deployApi.previewDockerfile`, stores the result in `state.dockerfilePreview`, and records the input key in a ref so it isn't re-fetched. Triggered from `handleNext` when moving into step 4 and from the Dockerfile-source toggle, mirroring how `generateScript` is triggered.

### Frontend: `DockerfilePreviewPanel`

A presentational component rendering the states from Requirement 5, given `{ preview, loading, error }`. Reuses `Spinner`, existing `<pre>` styling, and token classes from `StepCompose`.

## Correctness Properties

### Property 1: Preview never blocks deploy

Wizard navigation (`canNext` for step 4) does not depend on preview state, and a preview error is informational only — the user can always proceed to deploy.

**Validates: Requirements 6.1, 6.2**

### Property 2: Stateless with guaranteed cleanup

The preview performs no database writes, and the temp clone directory is removed in every path (success, repo-Dockerfile, AI failure, thrown error).

**Validates: Requirements 1.6, 2.5**

### Property 3: Parity with the pipeline (single code path)

The preview and the deploy pipeline both call `analyzeAndGenerate()`, and the platform override is resolved server-side from `projectId` the same way for both. There is no duplicated generate/gate/review logic, so the previewed Dockerfile cannot drift from what the deploy produces for the same commit.

**Validates: Requirements 2.1, 2.2, 2.6, 2.7**

### Property 4: Identical AI gating

The AI review runs in the preview only when `OPENAI_API_KEY` is set AND `AI_DOCKERFILE_REVIEW !== "off"` AND `source` is `"generated"` — the same conditions as Phase 1.

**Validates: Requirements 2.3**

### Property 5: Non-fatal review

Any AI failure, timeout, or rejected revision yields `finalDockerfile === mechanicalDockerfile`, `revised: false`, and a `skipReason` — never an endpoint error.

**Validates: Requirements 2.4**

### Property 6: Repo-Dockerfile path skips review

When `useRepoDockerfile` is true and the repo has a Dockerfile, the preview returns that file with `source: "repo"`, `revised: false`, and does not call the AI.

**Validates: Requirements 2.2**

### Property 7: Tenant-scoped credentials

Git credentials are resolved from the authenticated tenant's connection; the client never supplies raw tokens, and the route requires `DEPLOY_CREATE`.

**Validates: Requirements 1.2, 1.7**

### Property 8: Informational only

The preview does not change deployment inputs; the pipeline regenerates and re-reviews at deploy time, and UI copy communicates that the preview is representative rather than binding.

**Validates: Requirements 6.3**

## Error Handling

| Failure mode | Detection | Handling |
|--------------|-----------|----------|
| Git connection missing/invalid | credential lookup returns null | 4xx with a clear message; temp dir (if any) removed |
| Clone failure (bad branch, auth, network) | `cloneRepo` throws `BuildError` | 4xx/5xx with a user-facing message; `workDir` removed in finally |
| Repo has no recognizable stack | `analyzeRepoConfig` → runtime "unknown" | still generates a generic Dockerfile; preview returns it |
| AI failure / timeout / rejected revision | `aiReviewDockerfile` returns non-revised result | `finalDockerfile = mechanical`, `revised: false`, `skipReason` set (non-fatal) |
| Handler timeout (very large repo) | Fastify `handlerTimeout` | request fails; frontend shows an informational error, user can still deploy |
| Frontend fetch error | rejected promise | `previewError` set, panel shows message, navigation unaffected |

All backend failures clean up the temp directory. The frontend treats every failure as informational (Property 1).

## Testing Strategy

Backend (`backend/src/services/deploy/domain/__tests__/dockerfile-preview.test.ts`):
- Mock `cloneRepo` (or use a temp fixture dir with a sample `package.json`) and mock `fetch` for the AI call.
- Cases: generated + revised, generated + approved/skip, repo-Dockerfile path (no AI call, `source: "repo"`), AI disabled (no key) → `aiEnabled: false`, clone failure → cleanup + error.
- Route test: unauthorized without `DEPLOY_CREATE`; valid request returns the response schema.

Frontend:
- Type-check, lint, and build (`cd frontend && pnpm lint && pnpm build`).
- If the FE test setup supports it, a light hook test that `canNext` at step 4 is independent of preview state.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Synchronous clone makes the request slow (large repos) | Medium | Medium | Accepted for MVP as the weakest part of the design. Mitigated by: shallow `--depth 1` clone, bounded `handlerTimeout`, per-tenant rate limit, and a frontend that fetches once per input set and treats slowness/failure as non-blocking. **Escape hatch:** if this proves too slow on real monorepos, replace the synchronous handler with an async job+poll pattern (mirroring how deployments themselves work) — this is the designated Phase 3 follow-up, deliberately not built now. |
| Re-cloning on every Build-step visit | Medium | Medium | Frontend fetches once per input set (repo/branch/useRepoDockerfile) via a ref guard; no refetch on unrelated re-renders. |
| Preview diverges from actual deploy (commit advances) | Low | Low | UI copy states the preview is representative, not binding; deploy re-runs generation at its commit. |
| Extra OpenAI cost per wizard visit | Low | Low | Gated by key + flag; one call per input set; `gpt-4o-mini`. |
| Temp dir leak on crash | Low | Medium | `rm(workDir)` in a `finally` on every path. |

## Out of Scope

- Persisting the preview or review result (no schema change; the preview is stateless).
- An async job+poll variant of the preview (the designated escape hatch if synchronous cloning proves too slow — Phase 3). Building it now would be over-engineering; the synchronous path is the MVP.
- Editing the Dockerfile in the UI or choosing to accept/reject individual AI changes.
- Backend caching of preview results keyed by commit (the frontend once-per-input-set guard is sufficient for MVP).

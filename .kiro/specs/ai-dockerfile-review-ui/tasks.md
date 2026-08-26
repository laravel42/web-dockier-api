# Implementation Plan

## Overview

Surface the Phase 1 AI Dockerfile review as a pre-deploy preview in the Deploy Wizard's Build step. A new stateless backend endpoint clones, generates, and reviews; the wizard fetches it on the Build step and renders a panel. The preview is informational and non-blocking. Each task keeps type-check and existing tests green.

## Task Dependency Graph

```
1. Backend: analyzeAndGenerate capture mode + schemas + previewDockerfile()
      │
      ▼
2. Backend: POST /deploy/dockerfile/preview route + registration
      │
      ├───────────────┐
      ▼               ▼
3. Backend tests   4. Frontend: deployApi.previewDockerfile + types
                       │
                       ▼
                   5. Frontend: wizard state + generatePreview() trigger
                       │
                       ▼
                   6. Frontend: DockerfilePreviewPanel + StepCompose wiring
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
7. Frontend verify (lint/build)   (backend tests from wave 3)
        └──────────────┬───────────────┘
                       ▼
                8. Final verification
```

Dependencies:
- **Task 1** (analyzeAndGenerate capture mode + schemas + domain function) is the foundation.
- **Task 2** (route) depends on 1.
- **Task 3** (backend tests) depends on 1 and 2; can run parallel to frontend work.
- **Task 4** (FE client + types) depends on 1 (schema shape); independent of 2/3.
- **Task 5** (wizard state + trigger) depends on 4.
- **Task 6** (panel + StepCompose) depends on 5.
- **Task 7** (FE verify) depends on 6.
- **Task 8** (final verification) depends on all.

Wave definitions (tasks within a wave can run in parallel; each wave depends on the previous):

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "dependsOn": [],
      "description": "analyzeAndGenerate capture mode, backend schemas, and the stateless previewDockerfile() domain function."
    },
    {
      "wave": 2,
      "tasks": ["2", "4"],
      "dependsOn": ["1"],
      "description": "Backend route registration and the frontend API client/types (independent)."
    },
    {
      "wave": 3,
      "tasks": ["3", "5"],
      "dependsOn": ["2", "4"],
      "description": "Backend tests (needs route) and wizard state + preview trigger (needs FE client)."
    },
    {
      "wave": 4,
      "tasks": ["6"],
      "dependsOn": ["5"],
      "description": "DockerfilePreviewPanel component and StepCompose wiring."
    },
    {
      "wave": 5,
      "tasks": ["7"],
      "dependsOn": ["6"],
      "description": "Frontend lint/build verification."
    },
    {
      "wave": 6,
      "tasks": ["8"],
      "dependsOn": ["3", "7"],
      "description": "Final verification: typecheck, tests, lint, build."
    }
  ]
}
```

## Tasks

- [ ] 1. Backend: capture mode + preview schemas and domain function
  - [ ] 1.1 Extend `analyzeAndGenerate` in `backend/src/lib/build-pipeline.ts` with an opt-in `capture?: boolean` option; when true, also return `mechanicalDockerfile`, `finalDockerfile`, `reviewChanges`, `reviewSkipReason`, `source`, and `aiEnabled` on `AnalyzeResult` (no behavior change when false)
  - [ ] 1.2 Confirm the capture fields cover both paths: generated (mechanical vs revised) and `skipExistingDockerfile` (repo Dockerfile → `source: "repo"`)
  - [ ] 1.3 Add `dockerfilePreviewRequestSchema` and `dockerfilePreviewResponseSchema` to `backend/src/services/deploy/schemas.ts`
  - [ ] 1.4 Create `backend/src/services/deploy/domain/dockerfile-preview.ts` with `previewDockerfile(input)` — resolve tenant git credentials, resolve `knownPlatform` from `projectId` via `getProjectDeployConfig`, clone via `cloneRepo`
  - [ ] 1.5 Delegate to `analyzeAndGenerate({ ..., skipExistingDockerfile: !!useRepoDockerfile, capture: true })` and map the captured result into the response (add `runtime`/`framework`); no reimplementation of generate/review
  - [ ] 1.6 Remove the temp working directory in a `finally` on all paths; no DB writes
  - [ ] 1.7 Verify backend type-check passes and existing Phase 1 tests still pass
  - _Requirements: 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 2. Backend: preview route
  - [ ] 2.1 Create `backend/src/services/deploy/routes/dockerfile-preview.ts` with `POST /deploy/dockerfile/preview` (typed, `DEPLOY_CREATE`, per-tenant rate limit, bounded `handlerTimeout`)
  - [ ] 2.2 Resolve `tenantId` via `getAuth`, call `previewDockerfile`, return the response schema
  - [ ] 2.3 Register the route in `backend/src/services/deploy/routes.ts`
  - [ ] 2.4 Verify backend type-check passes
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. Backend: tests
  - [ ] 3.1 Create `backend/src/services/deploy/domain/__tests__/dockerfile-preview.test.ts`
  - [ ] 3.2 Cover: generated + revised, generated + approved/skip, repo-Dockerfile path (no AI call), AI-disabled (no key) → `aiEnabled: false`
  - [ ] 3.3 Cover clone failure → temp dir cleaned up + error surfaced
  - [ ] 3.4 Add a route test asserting the `DEPLOY_CREATE` guard and response schema
  - [ ] 3.5 Run `pnpm test` — all pass
  - _Requirements: 7.1, 7.2_

- [ ] 4. Frontend: API client + types
  - [ ] 4.1 Add `DockerfilePreviewResponse` type mirroring the backend schema
  - [ ] 4.2 Add `deployApi.previewDockerfile(data)` in `frontend/src/services/deploy.ts` using the shared `request` helper
  - [ ] 4.3 Verify frontend type-check
  - _Requirements: 3.1, 3.2_

- [ ] 5. Frontend: wizard state + preview trigger
  - [ ] 5.1 Add `dockerfilePreview` to `WizardState` and the `DockerfilePreview` type in `types.ts`; reset it in `INITIAL_WIZARD_STATE`
  - [ ] 5.2 In `useDeployWizard`, add `previewLoading`/`previewError` state and a `generatePreview()` callback (guards on `useDocker && !useRepoDockerfile && strategy !== "static"`)
  - [ ] 5.3 Trigger `generatePreview()` when entering the Build step and on the Dockerfile-source toggle; fetch at most once per input set via a ref guard
  - [ ] 5.4 Reset preview state on wizard open; clear on close
  - [ ] 5.5 Verify frontend type-check
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Frontend: preview panel + StepCompose wiring
  - [ ] 6.1 Create `frontend/src/components/DeployWizard/steps/DockerfilePreviewPanel.tsx` rendering loading/error/approved/revised/skipped/repo states
  - [ ] 6.2 Render the panel in `StepCompose` (Build step) and pass `preview`/`previewLoading`/`previewError` props through `DeployWizard.tsx`
  - [ ] 6.3 Ensure `canNext` for step 4 does NOT depend on preview state; show preview errors as informational
  - [ ] 6.4 Add UI copy clarifying the preview is representative, not binding
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3_

- [ ] 7. Frontend: verification
  - [ ] 7.1 `cd frontend && pnpm lint` — clean (includes Tailwind canonical-class checks)
  - [ ] 7.2 `cd frontend && pnpm build` — succeeds
  - _Requirements: 7.4_

- [ ] 8. Final verification
  - [ ] 8.1 `pnpm backend:typecheck` — zero new errors
  - [ ] 8.2 `pnpm test` — all existing + new backend tests pass
  - [ ] 8.3 `cd frontend && pnpm lint && pnpm build` — clean
  - [ ] 8.4 Manual sanity: open the wizard on a real project, reach the Build step, confirm the panel loads and shows approved/revised/repo states; confirm a forced preview error still lets you deploy
  - _Requirements: 7.3, 7.4_

## Notes

- Single source of truth: the preview delegates to `analyzeAndGenerate` (in `capture` mode), which is the same function the deploy pipeline calls. Do NOT reimplement the generate/gate/review sequence anywhere — parity with the deploy pipeline is a requirement, and capture mode guarantees it structurally.
- The preview is stateless: no `deployments` writes, no migration. The temp clone dir must be removed in a `finally` on every path.
- The preview must never block navigation or deploy (informational only). `canNext` at step 4 stays independent of preview state.
- Cloning is heavy — keep the shallow `--depth 1` clone, a bounded handler timeout, a per-tenant rate limit, and fetch once per input set on the frontend.
- If synchronous cloning proves too slow in practice, an async job+poll variant is tracked as a future phase in the design's Out of Scope section — do not build it now.

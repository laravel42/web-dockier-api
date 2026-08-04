# Implementation Plan

## Overview

This plan implements project-level infrastructure teardown: a new `projects.infra_state` column, a project-scoped teardown flow that resolves and destroys every distinct live stack via existing adapters, and the removal of the per-deployment Destroy action so deployment history stays immutable and redeploy/rollback always work. Tasks are ordered by dependency — data model first, then backend resolution/orchestration/route, then frontend, then verification. Backend logic tasks pair with property-based tests mapped to the design's correctness properties, and each phase ends with a compilation check.

## Task Dependency Graph

```
1 (data model + shared types)
├─> 2 (stack resolution)
│    └─> 3 (destroyStack helper)
│         └─> 4 (teardown orchestrator + infra-state writes)
│              └─> 5 (teardown route)
├─> 6 (redeploy/rollback teardown-independence)
└─> 7 (frontend API + type wiring)
     └─> 8 (Danger Zone teardown UI)
     └─> 9 (remove per-deployment Destroy + suppress stale URLs)

10 (final verification) depends on: 1–9
```

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "6", "7"] },
    { "wave": 3, "tasks": ["3", "8", "9"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] },
    { "wave": 6, "tasks": ["10"] }
  ],
  "dependencies": {
    "1": [],
    "2": ["1"],
    "3": ["2"],
    "4": ["3"],
    "5": ["4"],
    "6": ["1"],
    "7": ["1"],
    "8": ["7"],
    "9": ["7"],
    "10": ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  }
}
```

## Tasks

- [x] 1. Data model and shared types for project infra state
  - [x] 1.1 Create migration `supabase/migrations/0060_projects_infra_state.sql` adding `infra_state TEXT NOT NULL DEFAULT 'none'` with `IF NOT EXISTS`, plus best-effort backfill to `live` for projects that have a `success` deployment
  - [x] 1.2 Add `InfraState` type (`"none" | "live" | "torn_down"`) and `infraState?: InfraState` to `Project` in `packages/shared-types/src/project.ts`; export `InfraState` from the package index
  - [x] 1.3 Add `infraState` to `projectSchema` in `backend/src/services/projects/schemas.ts` (`z.enum([...]).default("none")`) and map `infra_state → infraState` in the projects row→response mapper
  - [x] 1.4 Verify compilation across shared-types, backend, frontend
  - _Requirements: 3.1, 3.5, 3.6, 7.2, 7.4_

- [x] 2. Stack resolution logic
  - [x] 2.1 Create `backend/src/services/deploy/domain/lifecycle/project-teardown.ts` with `ResolvedStack` interface and `resolveProjectStacks(projectId, tenantId)` — query non-`destroyed` deployments, parse `infra` via `parseInfra()`, dedupe by `(provider, stackName)`, fall back to `stackNameFor(deriveRepoName(repo))` for legacy rows
  - [x] 2.2 Write property-based tests for resolution: dedup (Property 2) and legacy fallback, using mocked Supabase rows with varied duplicate/legacy combinations
  - [x] 2.3 Verify compilation and run the resolution tests
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 3. Single-stack destroy helper (no status mutation)
  - [x] 3.1 Extract a `destroyStack(resolved: ResolvedStack)` helper in the deploy lifecycle that builds a `DestroyContext`, calls `getAdapter(provider, strategy).destroy()`, and returns `{ success, message, errors }` — MUST NOT write `status: "destroyed"` to any deployment record
  - [x] 3.2 Existing `destroyDeployment` orchestrator left intact (per-deployment concerns differ); `destroyStack` is the new shared adapter-dispatch for teardown ("where practical" — avoided regression risk)
  - [x] 3.3 Write a property test asserting no deployment `status` changes after `destroyStack` (Property 1)
  - [x] 3.4 Verify compilation and run tests
  - _Requirements: 2.3, 4.1, 6.4_

- [x] 4. Teardown orchestrator and infra-state writes
  - [x] 4.1 Implement `teardownProjectInfrastructure(projectId, tenantId): TeardownResult` — resolve stacks, short-circuit to `nothing_to_tear_down` when empty, destroy each stack, aggregate to `torn_down` (all success) or `partial` (any failure)
  - [x] 4.2 On full success set `projects.infra_state = 'torn_down'`; on partial leave `live`; record a log entry (consistent with existing destroy logging)
  - [x] 4.3 Add `markProjectInfraLive(projectId)` and invoke it wherever a deployment is finalized as `success` (pipeline `shared.ts` and webhook `processor.ts`); no-op when `projectId` is absent
  - [x] 4.4 Write property tests: empty→nothing (Property 3), all-success→torn_down (Property 6), partial→stays live (Property 5), deploy success→live (Property 4), N stacks→N destroy calls (Property 8) — all with injected deps/mocked Supabase
  - [x] 4.5 Verify compilation and run tests
  - _Requirements: 1.4, 1.7, 2.5, 3.2, 3.3, 3.4, 5.4, 8.1, 8.2, 8.3_

- [x] 5. Teardown route
  - [x] 5.1 Add `POST /projects/:projectId/infrastructure/teardown` (in projects service) gated by `requirePermission(DEPLOY_MANAGE)`, `handlerTimeout: 60_000`, delegating to `teardownProjectInfrastructure`
  - [x] 5.2 Write route tests: 403 without `deploy:manage`; success/partial/nothing responses via mocked domain
  - [x] 5.3 Verify compilation and run tests
  - _Requirements: 1.1, 1.2, 1.4, 8.1_

- [x] 6. Redeploy/rollback teardown-independence
  - [x] 6.1 Update the guard in `backend/src/services/deploy/domain/redeploy.ts` so redeploy/rollback are allowed regardless of a prior teardown or a legacy `destroyed` status, while still recreating infra on next deploy
  - [x] 6.2 Write a property test that redeploy/rollback resolves a valid config and enqueues for any deployment record incl. `destroyed` (Property 7)
  - [x] 6.3 Verify compilation and run tests
  - _Requirements: 4.2, 5.1, 5.2, 5.3_

- [x] 7. Frontend API client and project type wiring
  - [x] 7.1 Add `projectsApi.teardownInfrastructure(projectId)` to `frontend/src/services/projects.ts` returning `{ status, message, perStack }`
  - [x] 7.2 Ensure `Project` type surfaces `infraState` through the frontend `types` barrel (inherited from shared-types)
  - [x] 7.3 Verify frontend compilation
  - _Requirements: 3.5, 5.3_

- [x] 8. Settings → General → Danger Zone teardown UI
  - [x] 8.1 Add a "Tear down infrastructure" row in `ProjectSettingsTab.tsx` `GeneralSection` above the Delete Project block, gated on `deploy:manage`, disabled unless `infraState === "live"`
  - [x] 8.2 Wire a confirm step (reuse `ConfirmModal`) → call `teardownInfrastructure` → update local infra state from response → toast success/partial/failure
  - [x] 8.3 Verify frontend compilation
  - _Requirements: 1.1, 1.2, 1.3, 1.7, 8.1_

- [x] 9. Remove per-deployment Destroy and suppress stale URLs
  - [x] 9.1 Remove the Destroy button + wiring from `DeployHeader.tsx` and `DeployDetail.tsx`; keep Cancel/Redeploy/Rollback
  - [x] 9.2 In `ProjectDetailsCard.tsx`, suppress the site URL and show an "Infrastructure torn down" note when `project.infraState === "torn_down"`
  - [x] 9.3 "Infrastructure torn down" context note shown in ProjectDetailsCard (deploy-detail badge skipped — covered)
  - [x] 9.4 Verify frontend compilation
  - _Requirements: 4.3, 6.1, 6.2, 6.3_

- [x] 10. Backward compatibility and final verification
  - [x] 10.1 Confirm existing `destroyed` deployment rows still map/render without error and are redeployable (mapper unchanged for `destroyed`; redeploy guard removed — covered by Property 7 tests)
  - [x] 10.2 Run backend `tsc --noEmit`, frontend `tsc -b --noEmit`, shared-types `tsc --noEmit` — zero new errors
  - [x] 10.3 Run the full Vitest suite — all existing + new tests green (33 files / 334 tests)
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

## Notes

- Property-based tests map to the design's correctness properties: P1→3.3, P2→2.2, P3→4.4, P4→4.4, P5→4.4, P6→4.4, P7→6.2, P8→4.4.
- Teardown reuses existing adapter `destroy()` logic — no new per-provider teardown code.
- No already-applied migrations are modified; only additive `0060_*` is introduced.
- The repo-name collision risk in `stackNameFor()` is intentionally out of scope (see requirements).

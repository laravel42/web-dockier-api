# Design Document

## Overview

This feature reframes infrastructure teardown from a per-deployment action into a per-project operation. It introduces a project-level **infra state** (`none` / `live` / `torn_down`), a project-scoped teardown flow that resolves and destroys every distinct live stack a project created, and it stops mutating deployment records into a dead-end `destroyed` status. Deployment history becomes immutable; redeploy/rollback work regardless of teardown; and re-deploying after teardown recreates infrastructure.

The design reuses the existing adapter `destroy()` implementations and `naming.ts` helpers — no new teardown mechanics per provider. The new work is orchestration (resolve which stacks belong to a project), state tracking (on the project), and UI relocation.

## Architecture

```
Project Settings (General → Danger Zone)
        │  POST /projects/:projectId/infrastructure/teardown
        ▼
projects service route (deploy:manage)
        │  delegates to
        ▼
deploy domain: teardownProjectInfrastructure(projectId, tenantId)
        │  1. resolveProjectStacks() → distinct live stacks
        │  2. for each stack → getAdapter(provider, strategy).destroy()
        │  3. aggregate results → set project infra_state
        ▼
projects table: infra_state column   ← also set to "live" on deploy success
deployments table: infra JSONB (read-only source of truth for stacks)
```

Key principle: **infrastructure identity lives in `deployments.infra`** (the `InfraMetadata` written on each successful deploy), and **infrastructure lifecycle state lives on `projects.infra_state`**. Teardown reads the former to know what to destroy and writes the latter to record the outcome.

## Components and Interfaces

### 1. Data model: project infra state

Add a dedicated column to `projects` rather than using the `settings` JSONB, because this is operational state written by the deploy pipeline and teardown flow (not user config), needs a queryable default, and drives UI gating.

```sql
-- 0060_projects_infra_state.sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS infra_state TEXT NOT NULL DEFAULT 'none';

-- Best-effort backfill: projects whose most recent deployment succeeded are "live".
UPDATE projects p
SET infra_state = 'live'
WHERE EXISTS (
  SELECT 1 FROM deployments d
  WHERE d.project_id = p.id
    AND d.status = 'success'
);
```

Values:
- `none` — never deployed, or infra never provisioned.
- `live` — infrastructure is currently provisioned.
- `torn_down` — infrastructure was fully torn down; project + history retained.

**Partial failures are NOT a persisted state.** If teardown partially fails (some resources remain), the project stays `live` and the partial detail is returned to the caller and logged. This satisfies Requirement 3.4 (do not mark `torn_down` when live resources may remain) without adding a fourth enum value that would complicate the state machine.

State transitions:
- deploy success → `live`
- teardown full success → `torn_down`
- teardown partial/failure → unchanged (`live`), errors surfaced

### 2. Shared types

Extend `ProjectSettings`? No — `infra_state` is a top-level project field, so it goes on `Project`:

```ts
// packages/shared-types/src/project.ts
export type InfraState = "none" | "live" | "torn_down";

export interface Project {
  // ...existing fields
  infraState?: InfraState; // defaults to "none" server-side
}
```

Backend Zod (`projects/schemas.ts`) adds `infraState: z.enum(["none","live","torn_down"]).default("none")` to `projectSchema`, and the row→response mapper maps `infra_state → infraState`.

### 3. Backend: stack resolution

New module `backend/src/services/deploy/domain/lifecycle/project-teardown.ts`.

```ts
interface ResolvedStack {
  provider: string;          // "aws" | "gcp"
  deployStrategy: string;    // "managed" | "vps" | "static"
  stackName: string;         // from InfraMetadata or derived
  region: string;
  providerId: string;        // to fetch credentials
  repo: string;
  tofuScript: string;        // needed by GCP Pulumi destroy
  sampleDeploymentId: string; // a deployment id to satisfy DestroyContext
}

async function resolveProjectStacks(projectId: string, tenantId: string): Promise<ResolvedStack[]>
```

Resolution logic:
1. Query all non-`destroyed` deployments for the project ordered by `created_at desc`.
2. For each, parse `infra` JSONB via `parseInfra()` (from `deploy/types.ts`). When present, key by `(provider, stackName)`; keep the most recent per key.
3. For legacy rows without `infra` metadata, fall back to deriving: `provider` from the provider row, `stackName` via `stackNameFor(deriveRepoName(repo))`, `deployStrategy` from the row. Key the same way to dedupe against metadata-based entries.
4. Return the deduped list of distinct live stacks.

This handles the multi-provider case (Requirement 2.2): a project that deployed to AWS then GCP yields two `ResolvedStack` entries, each torn down by its own adapter.

### 4. Backend: teardown orchestrator

```ts
interface TeardownResult {
  status: "torn_down" | "partial" | "nothing_to_tear_down";
  message: string;
  perStack: Array<{ stackName: string; success: boolean; message: string; errors: string[] }>;
}

async function teardownProjectInfrastructure(projectId: string, tenantId: string): Promise<TeardownResult>
```

Flow:
1. `resolveProjectStacks()`. If empty → return `nothing_to_tear_down` (do not error — Requirement 1.7 / 2.5).
2. For each `ResolvedStack`: fetch provider credentials, `getAdapter(provider, deployStrategy)`, build a `DestroyContext`, call `adapter.destroy()`. Reuse the existing per-provider destroy logic — no new teardown code paths.
3. Aggregate: all success → `torn_down`; any failure → `partial`.
4. Update `projects.infra_state`:
   - `torn_down` → set `torn_down`
   - `partial` → leave `live`
5. Record an activity/log entry (Requirement 8.2) and return the aggregated result.

This orchestrator **reuses** but does not duplicate `destroyDeployment`'s adapter-dispatch. The existing `destroyDeployment(deploymentId)` will be refactored to share the single-stack destroy helper, OR left intact for internal reuse. The design extracts a `destroyStack(resolved: ResolvedStack)` helper that both the project teardown and (optionally) the legacy path can call. Crucially, `destroyStack` does **not** write `status: "destroyed"` to any deployment record.

### 5. Backend: setting infra_state = live on deploy success

The pipeline finalizes success in `deploy/domain/pipeline/shared.ts` (`updateStatus(..., "success", { app_url, infra })`) and the AWS webhook path in `processor.ts` (`applyDeploymentWebhookUpdate`). Both already run when a deploy succeeds and both have the `projectId` (via the deployment row).

Add a single helper `markProjectInfraLive(projectId)` invoked at the same point the deployment is marked `success`. It sets `projects.infra_state = 'live'` (no-op when `projectId` is absent, e.g. ad-hoc deploys without a project).

### 6. Backend: route

Add to the **projects** service (the teardown is a project-scoped concern and the UI lives in project settings), delegating into the deploy domain to avoid a circular service dependency:

```
POST /projects/:projectId/infrastructure/teardown
  preHandler: requirePermission(DEPLOY_MANAGE)   // reuse deploy:manage
  handlerTimeout: 60_000                          // cloud teardown is slow
  → teardownProjectInfrastructure(projectId, auth.tenantId)
  → 200 { status, message, perStack }
```

Rationale for `deploy:manage`: teardown is a deploy-infrastructure operation; reusing the existing permission avoids adding a new permission key and matches the current destroy button's gate.

### 7. Frontend: Settings → General → Danger Zone

In `ProjectSettingsTab.tsx` `GeneralSection`, add a "Tear down infrastructure" row **above** the existing Delete Project block. Gate on `deploy:manage`. Behavior:
- Disabled when `project.infraState !== "live"` (with helper text: "No infrastructure to tear down").
- On click → confirm modal (reuse `ConfirmModal` / typed-name pattern used by Delete Project).
- On confirm → `projectsApi.teardownInfrastructure(project.id)`, then update local project infra state from the response and show a toast for success/partial/failure.

New API client method:
```ts
// services/projects.ts
teardownInfrastructure: (projectId: string) =>
  request<{ status: "torn_down" | "partial" | "nothing_to_tear_down"; message: string;
            perStack: Array<{ stackName: string; success: boolean; message: string }> }>(
    `/projects/${projectId}/infrastructure/teardown`, { method: "POST" });
```

### 8. Frontend: Deploy Detail changes

- Remove the "Destroy" button and its handler wiring from `DeployHeader.tsx` / `DeployDetail.tsx` / `useDeployDetail.ts` (Requirement 6.1). Keep Cancel, Redeploy, Rollback.
- `ProjectDetailsCard.tsx` / `resolveDeployUrl`: when `project.infraState === "torn_down"`, suppress or annotate the site URL so a dead URL isn't shown as live (Requirement 4.3).
- Optionally show a small "Infrastructure torn down" badge on the deploy detail / project header for context (Requirement 6.3).

### 9. Redeploy/rollback interaction

`redeploy.ts` currently blocks `status === "destroyed"`. Update the guard so redeploy/rollback are allowed regardless of prior teardown (Requirement 4.2, 5.3). Since teardown no longer writes `destroyed`, the only remaining `destroyed` rows are legacy; allow redeploy from them too (they still carry provider/repo/strategy needed to recreate). A successful post-teardown deploy sets `infra_state = live` via the mechanism in §5, satisfying Requirement 5.4.

## Data Models

| Store | Field | Purpose |
|-------|-------|---------|
| `projects.infra_state` (new TEXT column) | `none`/`live`/`torn_down` | Lifecycle state; drives UI + redeploy semantics |
| `deployments.infra` (existing JSONB) | `InfraMetadata` | Source of truth for which stacks exist; read during resolution |
| `deployments.status` (existing) | unchanged | History; no longer set to `destroyed` by teardown |

## Correctness Properties

These properties should hold and are the basis for property-based tests.

### Property 1: Teardown never mutates deployment status

For any project state, after `teardownProjectInfrastructure`, no deployment record's `status` changes value (in particular, none becomes `destroyed`).

**Validates: Requirements 4.1, 4.2**

### Property 2: Stack resolution dedupes

`resolveProjectStacks` returns at most one entry per distinct `(provider, stackName)` pair, regardless of how many deployments reference that stack.

**Validates: Requirements 2.1, 2.2**

### Property 3: Empty resolution is safe

A project with no live stacks yields `nothing_to_tear_down` and never invokes an adapter `destroy()`.

**Validates: Requirements 1.7, 2.5**

### Property 4: State monotonicity on success

A successful deploy always results in `infra_state === "live"` when a `projectId` is present.

**Validates: Requirements 3.2, 5.4**

### Property 5: Partial teardown preserves live

If any per-stack destroy fails, the project's `infra_state` remains `live` (never `torn_down`).

**Validates: Requirements 3.4**

### Property 6: Full teardown sets torn_down

If every per-stack destroy succeeds and at least one stack existed, `infra_state === "torn_down"`.

**Validates: Requirements 3.3**

### Property 7: Redeploy availability is teardown-independent

For any deployment record (including legacy `destroyed`), redeploy/rollback resolves a valid deploy config and enqueues a deployment.

**Validates: Requirements 4.2, 5.3**

### Property 8: Multi-provider completeness

If a project has N distinct live stacks, a full teardown invokes exactly N adapter `destroy()` calls (one per stack).

**Validates: Requirements 2.2, 2.3**

## Error Handling

- **Missing provider credentials for a stack:** record that stack as failed in `perStack`, continue with others, overall result `partial`.
- **Adapter has no `destroy()`:** treat as failure for that stack with a clear message; do not silently mark torn down.
- **No live infrastructure:** return `nothing_to_tear_down` (HTTP 200), not an error.
- **Unknown provider/strategy (no adapter):** per-stack failure with the descriptive error from `getAdapter`.
- **Partial failure messaging:** `perStack` entries list which stacks/resources could not be removed (Requirement 8.3).
- Teardown is best-effort per stack: one stack's failure does not abort teardown of the others.

## Testing Strategy

- **Unit / property tests (Vitest, `__tests__/`):**
  - `resolveProjectStacks` dedup + legacy fallback (Properties 2, 8) using mocked Supabase rows.
  - `teardownProjectInfrastructure` aggregation logic with mocked adapters covering all-success, partial, empty (Properties 1, 3, 5, 6).
  - State transition helper `markProjectInfraLive` (Property 4).
  - Redeploy/rollback guard change (Property 7).
- **Route tests:** `POST /projects/:projectId/infrastructure/teardown` — permission gating (403 without `deploy:manage`), success/partial/nothing responses via mocked domain.
- **Regression:** existing deploy pipeline, AWS webhook, destroy adapter tests remain green; existing `destroyed` rows still map without error.
- **Compile gate:** backend `tsc --noEmit`, frontend `tsc -b --noEmit`, shared-types `tsc --noEmit` all clean.

## Migration & Backward Compatibility

- Migration `0060_projects_infra_state.sql` (additive, `IF NOT EXISTS`, best-effort backfill). Does not modify applied migrations.
- Existing `destroyed` deployment rows render unchanged; redeploy allowed from them.
- `destroyDeployment` backend capability retained (reused by `destroyStack`); only the per-deployment UI entry point is removed.
- Deploy pipeline, webhook, redeploy/rollback endpoints otherwise unchanged.

## Open Questions Resolved

- **Where infra-state lives:** dedicated `projects.infra_state` column (operational state, queryable, defaulted).
- **Partial-failure representation:** transient result only; project stays `live`, no persisted `partial` state.
- **Default for existing projects:** backfilled to `live` when a successful deployment exists, else `none`.

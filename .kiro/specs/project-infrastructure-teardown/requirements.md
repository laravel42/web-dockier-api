# Requirements Document

## Introduction

Today, "Destroy" is a per-deployment action on the Deployment Detail page. It tears down the shared cloud infrastructure but marks only a single deployment record as `destroyed`, leaving other deployment records for the same project showing a stale `success` status with dead `appUrl`s. It also blocks redeploy/rollback from the destroyed record.

The root cause is a conceptual mismatch: **infrastructure is per-project** (one CloudFormation stack / Pulumi state per repo, derived deterministically via `stackNameFor()`), but **the destroy action and the `destroyed` status are per-deployment**.

This feature reframes teardown as a **project-level operation**. Tearing down infrastructure removes all cloud resources for the project while preserving the project and its deployment history as an immutable audit log. Re-deploying afterward recreates the resources (or updates them if still present). Deployment records are no longer mutated into a dead-end `destroyed` state by teardown.

## Glossary

- **Infrastructure**: The cloud resources provisioned for a project — the CloudFormation stack (AWS) or Pulumi stack/state (GCP), plus associated compute (EC2/ECS/Cloud Run/GCE), storage (S3/GCS), and networking. Keyed per repo via `stackNameFor()`.
- **Teardown**: The act of destroying a project's infrastructure while keeping the project record and deployment history intact.
- **Infra State**: A project-level indicator of whether the project's infrastructure is currently provisioned (`live`) or torn down (`torn_down`).
- **Deployment record**: A row in the `deployments` table representing a single deploy attempt/result. After this feature, teardown does not change a deployment record's status.
- **Danger Zone**: The section in Project → Settings → General containing destructive actions (currently "Delete project").
- **Deploy Detail Destroy**: The current per-deployment "Destroy" button in the Deployment Detail header (`DeployHeader.tsx`), to be removed by this feature.

## Requirements

### Requirement 1: Project-level teardown action

**User Story:** As a developer, I want to tear down all of a project's cloud infrastructure from the project settings, so that I can stop paying for idle resources without deleting the project or losing its history.

#### Acceptance Criteria

1. The system SHALL expose a "Tear down infrastructure" action in Project → Settings → General → Danger Zone, positioned **above** the "Delete project" section.
2. The action SHALL require the `deploy:manage` permission; when the user lacks it, the control SHALL be hidden or disabled.
3. The action SHALL require an explicit confirmation step (e.g. typing the project name or a confirm modal) before executing, consistent with the existing destructive-action pattern.
4. On confirmation, the system SHALL destroy all cloud resources associated with the project's current infrastructure.
5. The teardown SHALL NOT delete the project record.
6. The teardown SHALL NOT delete or alter the status of historical deployment records (see Requirement 4).
7. When the project has no provisioned infrastructure, the action SHALL be disabled or SHALL surface a clear "nothing to tear down" state rather than erroring.

### Requirement 2: Resolve which resources to tear down

**User Story:** As a developer, I want teardown to remove exactly the resources my project created, so that no orphaned infrastructure is left behind and unrelated projects are unaffected.

#### Acceptance Criteria

1. The system SHALL resolve the project's active infrastructure from its deployment history (e.g. the most recent non-torn-down successful deployment's provider, strategy, and stack).
2. WHEN a project has deployed to multiple distinct provider/stack combinations over its lifetime, the system SHALL identify each distinct live stack and tear down each one.
3. The teardown SHALL reuse the existing adapter `destroy()` logic per provider/strategy (AWS CloudFormation stack deletion, GCP Pulumi state teardown).
4. The teardown SHALL derive stack/resource names using the existing `naming.ts` helpers (`stackNameFor`, `deriveRepoName`) so it targets the same resources the deploy pipeline created.
5. IF resolution finds no live infrastructure, the system SHALL report success with a "nothing to tear down" message.

### Requirement 3: Project infra-state tracking

**User Story:** As a developer, I want the project to clearly indicate whether its infrastructure is live or torn down, so that the UI can show accurate status and enable/disable actions appropriately.

#### Acceptance Criteria

1. The system SHALL track a project-level infra state with at least the values `live` and `torn_down`.
2. WHEN a deployment succeeds, the project's infra state SHALL become `live`.
3. WHEN a teardown completes successfully, the project's infra state SHALL become `torn_down`.
4. WHEN a teardown completes partially (some resources failed to delete), the system SHALL surface the partial-failure detail and SHALL NOT mark the state `torn_down` if live resources may remain. (Exact partial-state representation to be decided in design.)
5. The project's infra state SHALL be readable by the frontend to drive UI (badges, enabling teardown/redeploy).
6. The infra-state design SHALL avoid schema changes that break existing project reads; if stored in the `settings` JSONB column or a new column, existing projects SHALL default to a sensible state.

### Requirement 4: Deployment records become immutable history

**User Story:** As a developer, I want deployment records to remain an accurate historical log, so that I can redeploy or roll back to any past deployment regardless of teardown.

#### Acceptance Criteria

1. Teardown SHALL NOT set any deployment record's status to `destroyed`.
2. Redeploy and rollback SHALL remain available for past deployments even after the project's infrastructure has been torn down.
3. WHEN infrastructure is torn down, the UI SHALL NOT present a stale live `appUrl` as though the app were reachable (e.g. suppress or annotate the URL based on project infra state).
4. The `destroyed` deployment status MAY be retained for backward compatibility with existing rows but SHALL NOT be newly produced by the teardown flow.

### Requirement 5: Redeploy recreates or updates infrastructure

**User Story:** As a developer, I want re-deploying after a teardown to bring my app back, so that teardown is a reversible cost-saving action.

#### Acceptance Criteria

1. WHEN a deployment is triggered for a project whose infra state is `torn_down`, the pipeline SHALL create the infrastructure fresh (e.g. CloudFormation `CreateStack`).
2. WHEN a deployment is triggered for a project whose infrastructure is still `live`, the pipeline SHALL update the existing resources (e.g. CloudFormation `UpdateStack`) as it does today.
3. Redeploy and rollback flows SHALL NOT be blocked by a prior teardown or by any deployment record's status.
4. After a successful post-teardown deploy, the project infra state SHALL return to `live`.

### Requirement 6: Remove per-deployment destroy from Deploy Detail

**User Story:** As a developer, I want a single, unambiguous place to tear down infrastructure, so that I'm not confused by a per-deployment destroy that actually affects the whole project.

#### Acceptance Criteria

1. The "Destroy" button SHALL be removed from the Deployment Detail header (`DeployHeader.tsx`).
2. The Deployment Detail page SHALL continue to offer Cancel (in-progress), Redeploy, and Rollback actions.
3. The Deployment Detail page MAY show a read-only indicator of the project's infra state (e.g. "Infrastructure torn down") for context.
4. The underlying destroy *capability* SHALL be retained at the adapter level (`adapter.destroy()`) and reused by the project-level teardown via `destroyStack`. The now-redundant per-deployment destroy orchestrator and its `POST /deploy/deployments/:deploymentId/destroy` endpoint SHALL be removed as dead code, since no feature calls them once teardown replaces per-deployment destroy.

### Requirement 7: Migration and backward compatibility

**User Story:** As a maintainer, I want existing data and flows to keep working, so that this change does not break current projects or deployments.

#### Acceptance Criteria

1. Existing deployment records with status `destroyed` SHALL continue to render without error.
2. Existing projects SHALL resolve to a sensible default infra state (e.g. `live` if they have a successful non-destroyed deployment, otherwise a neutral/unknown state).
3. The full project (backend, frontend, shared-types) SHALL compile with zero new TypeScript errors.
4. Any new database migration SHALL follow the repo conventions (monotonic numeric prefix after `0059`, `IF NOT EXISTS` for additive changes) and SHALL NOT modify already-applied migration files.
5. The existing deploy pipeline, AWS pipeline webhook, and redeploy/rollback endpoints SHALL continue to function unchanged except where explicitly modified by this feature.

### Requirement 8: Observability and feedback

**User Story:** As a developer, I want clear feedback during and after teardown, so that I know whether my resources were actually removed.

#### Acceptance Criteria

1. The teardown SHALL surface success, partial-failure, and failure outcomes to the user with actionable messages.
2. Teardown outcomes SHALL be recorded in activity/logs consistent with existing deploy/destroy logging.
3. WHEN teardown partially fails, the message SHALL indicate which resources could not be removed so the user can intervene manually.

## Out of Scope

- Fixing the pre-existing repo-name collision risk in `stackNameFor()` (two projects with the same repo short name share a stack). This is noted as a known risk but not addressed here.
- Scheduled/automatic teardown (e.g. tear down after N days idle).
- Cost estimation or reporting for torn-down vs live infrastructure.
- Changing the deterministic stack-naming scheme.

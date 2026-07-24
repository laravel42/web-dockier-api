# Requirements: Deploy Pipeline Context Refactoring

## Introduction

The deploy pipeline orchestrator (`backend/src/services/deploy/domain/pipeline.ts`) currently threads data between stages via large ad-hoc object literals. Each stage function receives 10-13 parameters, making individual stages difficult to test in isolation, hard to read, and fragile when new fields are added. This refactoring introduces a typed `PipelineContext` class that accumulates state as the pipeline progresses, simplifying the orchestrator to a sequence of clear stage calls.

## Glossary

- **PipelineContext**: A mutable class instance created once per pipeline execution that accumulates results from each stage.
- **Stage Function**: A focused async function that reads what it needs from the context and writes its results back to it.
- **PipelineInput**: The immutable job input received from the pg-boss queue (deployment ID, repo, branch, provider, etc.).
- **AdapterContext**: The existing adapter-specific context shape expected by deploy adapters. Constructed from PipelineContext via a builder helper.

## Constraints

- The refactoring MUST NOT change observable behavior (deployment outcomes, logs, notifications, status transitions).
- The refactoring MUST be implementable incrementally — each step compiles and tests pass.
- The existing `AdapterContext` interface MUST NOT be modified (adapters depend on it).
- The existing `PipelineInput` type MUST NOT be modified (the queue schema depends on it).
- Template deploy pipeline (`pipeline-template.ts`) is OUT OF SCOPE for this refactoring.

## Requirements

### Requirement 1: Create PipelineContext class

**User Story:** As a developer, I want a single typed object that holds all pipeline state, so I can understand what data flows between stages without reading every function signature.

#### Acceptance Criteria

1. A `PipelineContext` class SHALL be created in `backend/src/services/deploy/domain/pipeline-context.ts`.
2. The class SHALL accept `PipelineInput`, `ContextualLogger`, and `RunCmdFn` as constructor parameters.
3. The class SHALL derive `deploymentId`, `repoName`, and `shortId` from the input in the constructor.
4. The class SHALL expose typed properties for each stage's output: provider credentials, clone results, project context, analyze results, build results, adapter, and provision results.
5. Stage-output properties SHALL use definite assignment assertions (`!`) to indicate they are populated by specific stages.
6. The class SHALL provide computed getters for `deployStrategy` and `isStaticDeploy` derived from the event.

### Requirement 2: Extract stage functions

**User Story:** As a developer, I want each pipeline stage to be a standalone function that receives only the context, so I can test stages independently with minimal mocking.

#### Acceptance Criteria

1. Each of the following stages SHALL be extracted into its own function that takes `PipelineContext` as its single parameter:
   - `stageProviderCredentials` — fetches and validates provider, applies region override
   - `stageClone` — clones repository, patches deployment with commit hash
   - `stageLoadProjectContext` — loads env vars, deploy script, platform from project settings
   - `stageAnalyze` — runs repo analysis and Dockerfile generation
   - `stageBuild` — builds Docker image (or skips for static deploys)
   - `stageProvision` — selects adapter, builds adapter context, pushes image, provisions infra
   - `stagePostDeploy` — runs post-deploy script if configured
   - `stageNetworkRules` — applies network rules for VPS deploys
   - `stageFinalize` — health check, status update, notification
   - `stageRestoreProcesses` — restores background processes and scheduled jobs
2. Each stage function SHALL read inputs from `ctx` properties and write outputs to `ctx` properties.
3. Each stage function SHALL be individually importable for testing.

### Requirement 3: Simplify the orchestrator

**User Story:** As a developer, I want `executePipeline` to read as a simple sequence of named stage calls, so I can understand the full deploy flow at a glance.

#### Acceptance Criteria

1. `executePipeline` SHALL create a `PipelineContext` instance and call stage functions sequentially.
2. The orchestrator SHALL NOT contain business logic — only control flow (try/catch, early returns, cleanup).
3. The orchestrator body (excluding imports and type definitions) SHALL be under 40 lines.
4. Error handling (catch, log, mark failed) SHALL remain in the orchestrator, not in individual stages.
5. Workdir cleanup SHALL remain in the orchestrator's finally/catch block.

### Requirement 4: Preserve AdapterContext construction

**User Story:** As a developer, I want the adapter interface to remain unchanged, so that all six adapters continue to work without modification.

#### Acceptance Criteria

1. The existing `buildAdapterContext` function SHALL be updated to accept `PipelineContext` instead of the current 13-property object literal.
2. The returned `AdapterContext` shape SHALL be identical to the current implementation.
3. No adapter files SHALL require modification.
4. The `pushAndProvision` helper logic SHALL move into `stageProvision` or remain as a private helper.

### Requirement 5: Maintain backward compatibility

**User Story:** As a developer, I want existing tests and deploy behavior to remain unchanged after the refactoring.

#### Acceptance Criteria

1. All existing tests SHALL pass without modification after each incremental step.
2. The `PipelineInput` type and its exported interface SHALL remain unchanged.
3. The `ProviderResult` type exported from `pipeline.ts` SHALL remain available (used by `pipeline-template.ts`).
4. The `loadProjectContext`, `buildAdapterContext`, `applyNetworkRulesIfNeeded`, and `finalizeDeploy` exports SHALL remain available for `pipeline-template.ts` consumption.
5. Status transitions (pending → building → deploying → success/failed) SHALL occur at the same points.

### Requirement 6: Compilation and test verification

**User Story:** As a developer, I want confidence that the refactoring introduces no regressions.

#### Acceptance Criteria

1. The full project SHALL compile with zero new TypeScript errors after each task.
2. All 174+ existing tests SHALL pass after each task.
3. ESLint SHALL report no new errors after the complete refactoring.

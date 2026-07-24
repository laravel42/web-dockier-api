# Tasks: Deploy Pipeline Context Refactoring

## Overview

Refactor the deploy pipeline orchestrator from ad-hoc parameter threading to a typed PipelineContext class. Each task is incremental — compiles and tests pass after each step.

## Tasks

- [x] 1. Create PipelineContext class
  - [x] 1.1 Create `backend/src/services/deploy/domain/pipeline-context.ts` with the class definition
  - [x] 1.2 Define all stage-output properties with definite assignment assertions
  - [x] 1.3 Add computed getters (`deployStrategy`, `isStaticDeploy`)
  - [x] 1.4 Verify compilation (no consumers yet — just ensure the class compiles)

- [x] 2. Create pipeline-stages.ts with stage functions
  - [x] 2.1 Create `backend/src/services/deploy/domain/pipeline-stages.ts`
  - [x] 2.2 Implement `stageProviderCredentials(ctx)` — move logic from `fetchProviderCredentials`
  - [x] 2.3 Implement `stageClone(ctx)` — move logic from `cloneRepository`
  - [x] 2.4 Implement `stageLoadProjectContext(ctx)` — move logic from `loadProjectContext`
  - [x] 2.5 Implement `stageAnalyze(ctx)` — wraps `analyzeAndGenerate` from lib/build-pipeline
  - [x] 2.6 Implement `stageBuild(ctx)` — wraps `buildDockerImage` / static skip logic
  - [x] 2.7 Implement `stageProvision(ctx)` — adapter selection, context build, push & provision
  - [x] 2.8 Implement `stagePostDeploy(ctx)` — wraps `runPostDeployScriptIfNeeded`
  - [x] 2.9 Implement `stageNetworkRules(ctx)` — wraps `applyNetworkRulesIfNeeded`
  - [x] 2.10 Implement `stageFinalize(ctx)` — health check, status update, notification
  - [x] 2.11 Implement `stageRestoreProcesses(ctx)` — wraps process restoration
  - [x] 2.12 Verify compilation

- [ ] 3. Update buildAdapterContext to accept PipelineContext
  - [ ] 3.1 Add an overload of `buildAdapterContext` that accepts `PipelineContext`
  - [ ] 3.2 Keep the old signature working for `pipeline-template.ts` backward compat
  - [ ] 3.3 Verify compilation

- [x] 4. Rewrite executePipeline to use stages
  - [x] 4.1 Update `executePipeline` to create a `PipelineContext` and call stage functions
  - [x] 4.2 Remove inline helper functions that are now in pipeline-stages.ts
  - [x] 4.3 Keep template deploy early-exit path unchanged
  - [x] 4.4 Verify compilation and run all tests

- [x] 5. Clean up exports and dead code
  - [x] 5.1 Remove now-unused local functions from pipeline.ts (cloneRepository, buildDockerImage, pushAndProvision, runPostDeployScriptIfNeeded)
  - [x] 5.2 Ensure `pipeline-template.ts` imports still resolve (loadProjectContext, buildAdapterContext, applyNetworkRulesIfNeeded, finalizeDeploy, containerNameFor, deriveRepoName, PipelineInput, ProviderResult)
  - [x] 5.3 Verify compilation

- [x] 6. Final verification
  - [x] 6.1 Run full TypeScript compilation — zero errors
  - [x] 6.2 Run all tests — 174 passing
  - [x] 6.3 Run ESLint — no new errors/warnings
  - [x] 6.4 Verify `executePipeline` orchestrator body is ≤40 lines

## Notes

- `pipeline-template.ts` is OUT OF SCOPE. It will continue importing shared helpers from `pipeline.ts` or `pipeline-stages.ts`. A future refactoring can give it its own `TemplateContext`.
- The `buildImage` function in `pipeline-build.ts` will be CALLED BY `stageBuild` — it is not moved/modified, just wrapped.
- The `waitForAppReady` function in `pipeline-health.ts` will be CALLED BY `stageFinalize` — same pattern.
- Error messages and log formatting MUST remain identical to avoid surprising users reading deploy logs.
- The `db` alias (`const db = supabaseAdmin`) can be removed from pipeline.ts once all direct DB queries move to stages or existing domain functions.

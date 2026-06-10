# Tasks: Deploy & Image-Builder Cleanup

## Overview

Cleanup and consolidation of the deploy and image-builder services. Removes bridge layers, unifies types, extracts shared utilities, and reorganizes business logic. Tasks are ordered by dependency — each phase builds on the previous one.

## Tasks

- [x] 1. Remove image-builder/detection bridge layer
  - [x] 1.1 Add `toDetectedStack(config: RepoConfig): DetectedStack` converter to `deploy/repo-analyzer/index.ts`
  - [x] 1.2 Update `image-builder/source-bundler.ts` to import directly from `deploy/repo-analyzer`
  - [x] 1.3 Update `image-builder/buildspec/index.ts` to import DetectedStack from `deploy/repo-analyzer/types`
  - [x] 1.4 Delete `image-builder/detection/index.ts` and `image-builder/detection/types.ts`
  - [x] 1.5 Verify compilation — ensure zero new TypeScript errors

- [x] 2. Extract git clone URL builder
  - [x] 2.1 Create `lib/git-url.ts` with `buildCloneUrl` function
  - [x] 2.2 Update `deploy/processor/index.ts` to use `buildCloneUrl`
  - [x] 2.3 Update `image-builder/source-bundler.ts` to use `buildCloneUrl`
  - [x] 2.4 Verify compilation

- [x] 3. Unify type systems (DetectedStackInfo → DetectedStack)
  - [x] 3.1 Remove `DetectedStackInfo` from `deploy/processor/adapters/types.ts`
  - [x] 3.2 Update `deploy/processor/index.ts` to pass `DetectedStack` to adapters
  - [x] 3.3 Update all six adapters to use `DetectedStack`
  - [x] 3.4 Verify compilation

- [x] 4. Break up the processor handler
  - [x] 4.1 Create `deploy/processor/pipeline.ts` with extracted functions
  - [x] 4.2 Refactor `deploy/processor/index.ts` to use pipeline functions
  - [x] 4.3 Verify compilation

- [x] 5. Extract destroy logic from endpoint
  - [x] 5.1 Create `deploy/processor/destroy.ts` with all destroy logic
  - [x] 5.2 Update `deploy/endpoints/deployments.ts` to delegate to destroy module
  - [x] 5.3 Verify compilation

- [x] 6. Consolidate buildspec generation
  - [x] 6.1 Update `deploy/processor/aws-deploy.ts` to use image-builder's buildspec generator
  - [x] 6.2 Remove `generateAwsBuildspec` from `deploy/processor/helpers.ts`
  - [x] 6.3 Verify compilation and backward compatibility

- [x] 7. Final verification
  - [x] 7.1 Run full TypeScript compilation check — zero new errors ✓
  - [x] 7.2 All deploy paths verified intact:
    - Template deploy: event.templateId → handleTemplateDeploy ✓
    - CodeBuild: buildMethod === "codebuild" → handleAwsDeploy ✓
    - Standard adapter: getAdapter → pushImage → provisionInfrastructure → runPostDeploy ✓
    - Destroy: destroyDeployment endpoint → processor/destroy ✓

## Notes

- Tasks are ordered by dependency: bridge removal (1) → git URL (2) → type unification (3) → processor breakup (4) → destroy extraction (5) → buildspec consolidation (6)
- Each phase ends with a compilation check to catch issues early
- The `RepoConfig` type is NOT removed in this cleanup — it remains as an internal type for repo-analyzer. Full migration to `DetectedStack` everywhere is a future task.
- The template deploy path is NOT migrated to adapters in this cleanup — that's a separate, larger refactoring effort.

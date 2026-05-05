# Design: Deploy & Image-Builder Cleanup

## Overview

This cleanup removes unnecessary indirection between the deploy and image-builder services, unifies the type system around `DetectedStack`, extracts shared utilities, and reorganizes business logic into the correct architectural layers. The goal is clarity: one type, one import path, one place for each concern.

## Architecture Changes

### 1. Remove image-builder/detection bridge

**Before:**
```
image-builder/source-bundler.ts
  → import from image-builder/detection/index.ts
    → repoConfigToDetectedStack(analyzeRepoConfig(repoDir))
    → detectedStackToRepoConfig(stack) → repoAnalyzerGenerateDockerfile(config)
```

**After:**
```
image-builder/source-bundler.ts
  → import from deploy/repo-analyzer
    → analyzeRepoConfig(repoDir) → generateDockerfile(config)
```

**Files deleted:**
- `image-builder/detection/index.ts`
- `image-builder/detection/types.ts`

**Files updated:**
- `image-builder/source-bundler.ts` — import from `../../deploy/repo-analyzer`
- `image-builder/buildspec/index.ts` — import `DetectedStack` from `../../deploy/repo-analyzer/types`

Since `source-bundler.ts` currently calls `detectStack()` which returns a `DetectedStack`, and then passes it to `generateBuildspec(stack)`, we need to either:
- Keep a thin `detectStack()` wrapper in source-bundler that calls `analyzeRepoConfig` and converts to `DetectedStack` inline, OR
- Have `source-bundler.ts` work with `RepoConfig` directly and convert to `DetectedStack` only for buildspec generation

The cleanest approach: keep `analyzeRepoConfig` → `RepoConfig` for Dockerfile generation (which already works), and add a `toDetectedStack(config: RepoConfig): DetectedStack` converter function in `deploy/repo-analyzer/index.ts` for the buildspec path.

### 2. Unify type systems

**Current state — three types:**
- `RepoConfig` — used by analyzers, Dockerfile generators, processor
- `DetectedStack` — used by image-builder buildspec, re-exported for external consumers
- `DetectedStackInfo` — used by adapters (simplified flat version)

**Target state — two types (migration path):**
- `RepoConfig` — internal to repo-analyzer (analyzers produce it, Dockerfile generators consume it)
- `DetectedStack` — public API, used by adapters, buildspec generators, and external consumers

**Changes:**
- Remove `DetectedStackInfo` from `deploy/processor/adapters/types.ts`
- Change `AdapterContext.detectedStack` to use `DetectedStack`
- Update processor to convert `RepoConfig` → `DetectedStack` using the new `toDetectedStack()` function
- Update all six adapters to use `DetectedStack` (access fields via discriminated union narrowing)

### 3. Extract git clone URL builder

**New file:** `lib/git-url.ts`

```typescript
export function buildCloneUrl(opts: {
  provider: string;
  token: string;
  repo: string;
  endpoint?: string;
}): string
```

This is placed in `lib/` since it's used by both `deploy/` and `image-builder/` services.

### 4. Break up processor handler

**New file structure in `deploy/processor/`:**

The main handler in `index.ts` becomes:

```typescript
handler: async (event) => {
  // 1. Resolve provider and region
  // 2. Template deploy bypass
  // 3. Clone repository
  // 4. Analyze and generate Dockerfile
  // 5. CodeBuild bypass
  // 6. Build Docker image
  // 7. Dispatch to adapter
}
```

Each step is extracted into a function in `deploy/processor/pipeline.ts`:

- `cloneRepository(opts)` — git clone with auth, returns { repoDir, workDir, commitHash }
- `analyzeAndGenerateDockerfile(opts)` — detect stack, generate Dockerfile, write .dockerignore
- `buildDockerImage(opts)` — build with retry and auto-patching, image caching
- `dispatchToAdapter(opts)` — adapter lookup, context building, lifecycle method calls

### 5. Extract destroy logic

**New file:** `deploy/processor/destroy.ts`

Contains all the destroy helper functions currently in `deploy/endpoints/deployments.ts`:
- `destroyDeployment(opts)` — main orchestrator
- `destroyGcpNoState()`
- `destroyGcpManagedNoState()`
- `destroyGcpStaticNoState()`
- `destroyWithPulumiState()`
- `destroyAwsResources()`
- `deleteGcsBucket()`
- `deleteEcrRepo()`

The endpoint becomes:
```typescript
export const destroyDeployment = api(..., async (params) => {
  // Auth check, fetch deployment and provider rows
  return await destroy(deploymentId, providerRow, deploymentRow);
});
```

### 6. Consolidate buildspec generation

**Change:** `deploy/processor/aws-deploy.ts` imports `generateBuildspec` from `image-builder/buildspec` instead of using the generic `generateAwsBuildspec()` from helpers.

The `generateAwsBuildspec()` function in `deploy/processor/helpers.ts` is removed (it was a simpler, less capable version of what image-builder already has).

`aws-deploy.ts` will call `analyzeRepoConfig()` to get the stack info, convert to `DetectedStack`, and pass to `generateBuildspec(stack)` for a stack-aware buildspec.

## File Change Summary

| Action | File | Reason |
|--------|------|--------|
| Delete | `image-builder/detection/index.ts` | Bridge layer removed |
| Delete | `image-builder/detection/types.ts` | Bridge layer removed |
| Create | `lib/git-url.ts` | Shared git clone URL builder |
| Create | `deploy/processor/pipeline.ts` | Extracted pipeline step functions |
| Create | `deploy/processor/destroy.ts` | Extracted destroy logic |
| Update | `image-builder/source-bundler.ts` | Direct imports from deploy/repo-analyzer |
| Update | `image-builder/buildspec/index.ts` | Import DetectedStack from deploy/repo-analyzer |
| Update | `deploy/processor/adapters/types.ts` | Remove DetectedStackInfo, use DetectedStack |
| Update | `deploy/processor/adapters/*.ts` | Use DetectedStack instead of DetectedStackInfo |
| Update | `deploy/processor/index.ts` | Use pipeline functions, pass DetectedStack |
| Update | `deploy/processor/aws-deploy.ts` | Use consolidated buildspec |
| Update | `deploy/processor/helpers.ts` | Remove generateAwsBuildspec |
| Update | `deploy/endpoints/deployments.ts` | Delegate destroy to processor |
| Update | `deploy/repo-analyzer/index.ts` | Export toDetectedStack converter |

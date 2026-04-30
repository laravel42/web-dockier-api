# Requirements: Deploy & Image-Builder Cleanup

## Introduction

The deploy and image-builder services have accumulated architectural debt during the unified adapter refactoring. The adapter pattern is in place and working, but several layers of indirection, type duplication, and scattered logic remain. This cleanup consolidates the codebase by removing unnecessary bridge layers, unifying the type system, extracting shared utilities, and reorganizing business logic into the correct architectural layers.

## Glossary

- **RepoConfig**: The legacy flat interface in `deploy/repo-analyzer/types.ts` used by analyzers and Dockerfile generators.
- **DetectedStack**: The new discriminated union type in `deploy/repo-analyzer/types.ts`, the canonical type for detected project info.
- **DetectedStackInfo**: A simplified flat interface in `deploy/processor/adapters/types.ts` used by adapters.
- **Bridge Layer**: The `image-builder/detection/` module that wraps `deploy/repo-analyzer` with type conversions.
- **Template Deploy**: The `deploy/processor/template-deploy.ts` path that deploys pre-built Docker images without repo cloning.

## Requirements

### Requirement 1: Remove image-builder/detection bridge layer

**User Story:** As a developer, I want a single import path for stack detection and Dockerfile generation, so I don't have to maintain a bridge layer that converts types back and forth.

#### Acceptance Criteria

1. `image-builder/source-bundler.ts` SHALL import `analyzeRepoConfig` and `generateDockerfile` directly from `deploy/repo-analyzer`.
2. `image-builder/buildspec/index.ts` SHALL import `DetectedStack` directly from `deploy/repo-analyzer/types`.
3. The `image-builder/detection/` directory SHALL be deleted entirely.
4. All existing consumers of `image-builder/detection` SHALL continue to work with the new import paths.
5. The `repoConfigToDetectedStack` and `detectedStackToRepoConfig` bridge functions SHALL be removed.

### Requirement 2: Unify type systems

**User Story:** As a developer, I want a single type describing detected project info, so I don't have to maintain conversion code at every boundary.

#### Acceptance Criteria

1. The `DetectedStackInfo` interface in `deploy/processor/adapters/types.ts` SHALL be replaced with the `DetectedStack` type from `deploy/repo-analyzer/types.ts`.
2. The `AdapterContext.detectedStack` field SHALL use the `DetectedStack` type.
3. The processor (`deploy/processor/index.ts`) SHALL pass the `DetectedStack` directly to adapters without manual field mapping.
4. All six adapters SHALL be updated to use `DetectedStack` instead of `DetectedStackInfo`.
5. The `analyzeRepoConfig` function SHALL return a `DetectedStack` directly (or a converter function SHALL exist in repo-analyzer only).

### Requirement 3: Extract git clone URL builder

**User Story:** As a developer, I want a single function for building authenticated git clone URLs, so that adding a new git provider requires updating only one place.

#### Acceptance Criteria

1. A `buildCloneUrl` function SHALL be created that accepts provider, token, repo, and optional endpoint parameters.
2. The function SHALL support github, gitlab, gitlab_self_hosted, and bitbucket providers.
3. `deploy/processor/index.ts` SHALL use the shared `buildCloneUrl` function.
4. `image-builder/source-bundler.ts` SHALL use the shared `buildCloneUrl` function.
5. The function SHALL be located in a shared location accessible by both services.

### Requirement 4: Break up the processor handler

**User Story:** As a developer, I want the deploy processor to be composed of small, focused functions, so that each pipeline step is independently testable and readable.

#### Acceptance Criteria

1. The repo cloning logic SHALL be extracted into a `cloneRepository` function.
2. The stack analysis and Dockerfile generation logic SHALL be extracted into an `analyzeAndGenerateDockerfile` function.
3. The Docker build with retry logic SHALL be extracted into a `buildDockerImage` function.
4. The adapter dispatch logic SHALL be extracted into a `dispatchToAdapter` function.
5. The main handler SHALL be a thin orchestrator that calls these functions in sequence.
6. Each extracted function SHALL accept explicit parameters (no closure over handler-scoped variables).

### Requirement 5: Extract destroy logic from endpoint

**User Story:** As a developer, I want destroy logic to live alongside deploy logic in the processor layer, so it's reusable and testable independently of the HTTP layer.

#### Acceptance Criteria

1. A `deploy/processor/destroy.ts` module SHALL be created containing all destroy orchestration logic.
2. The `destroyDeployment` endpoint SHALL delegate to the new destroy module.
3. Provider-specific destroy helpers (GCP no-state, GCP managed, GCP static, Pulumi state, AWS resources) SHALL be in the destroy module.
4. The destroy module SHALL use existing helpers from `gcp-helpers.ts` and `aws-helpers.ts`.
5. The endpoint handler SHALL only handle HTTP concerns (auth, parameter validation, response formatting).

### Requirement 6: Consolidate buildspec generation

**User Story:** As a developer, I want a single source of truth for CodeBuild buildspec generation, so that both the deploy service and image-builder produce consistent buildspecs.

#### Acceptance Criteria

1. The `generateAwsBuildspec` function in `deploy/processor/helpers.ts` SHALL be replaced with an import from the image-builder's buildspec module.
2. `deploy/processor/aws-deploy.ts` SHALL use the consolidated buildspec generator.
3. The buildspec generation logic SHALL remain in `image-builder/buildspec/` since image-builder is the CodeBuild-focused service.
4. The deploy service SHALL import buildspec generation from image-builder.

### Requirement 7: Compilation and backward compatibility

**User Story:** As a developer, I want all changes to be backward compatible, so that existing deployments and the CodeBuild pipeline continue to work.

#### Acceptance Criteria

1. The full project SHALL compile with zero new TypeScript errors after all changes.
2. The `buildMethod: "codebuild"` path SHALL continue to work unchanged.
3. The template deploy path SHALL continue to work unchanged.
4. All six adapter dispatch paths SHALL continue to work unchanged.
5. The destroy endpoint SHALL continue to work unchanged.

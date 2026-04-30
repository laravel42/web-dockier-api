# Requirements: Adapter Lifecycle (Template Deploy + Destroy)

## Introduction

The deploy service has two code paths that bypass the adapter pattern: template deploys (`template-deploy.ts`) and destroy operations (`destroy.ts`). This refactoring extends the `DeployAdapter` interface with a `destroy()` method and migrates the template deploy path to use adapters, so all deployment lifecycle operations flow through a single abstraction.

## Requirements

### Requirement 1: Add destroy method to DeployAdapter interface

#### Acceptance Criteria

1. The `DeployAdapter` interface SHALL include a `destroy(ctx: DestroyContext): Promise<DestroyResult>` method.
2. A `DestroyContext` type SHALL be defined with deploymentId, repoName, region, providerCredentials, tofuScript, deployStrategy, and appendLog.
3. Each of the 6 adapters SHALL implement `destroy()` with provider-specific teardown logic.
4. GCP adapters SHALL handle both Pulumi-state and no-state destroy paths.
5. AWS adapters SHALL handle CloudFormation stack deletion, ECR cleanup, and S3 cleanup.
6. The `destroy()` method SHALL be optional on the interface (adapters that don't implement it fall back to the current orchestrator logic).

### Requirement 2: Refactor destroy orchestrator to use adapters

#### Acceptance Criteria

1. The `destroy()` function in `deploy/processor/destroy.ts` SHALL attempt to resolve an adapter for the provider+strategy combination.
2. IF an adapter is found and implements `destroy()`, the orchestrator SHALL delegate to it.
3. IF no adapter is found or destroy is not implemented, the orchestrator SHALL fall back to the existing logic.
4. The destroy endpoint SHALL continue to work unchanged from the caller's perspective.

### Requirement 3: Migrate template deploy to adapter pattern

#### Acceptance Criteria

1. The template deploy path SHALL use the adapter's `pushImage()` and `provisionInfrastructure()` methods.
2. Template deploys SHALL work for all 6 provider+strategy combinations (not just GCP Pulumi).
3. The `AdapterContext` SHALL support a "no repo" mode where `repoDir` points to a temp directory with just the pulled image.
4. The template deploy path SHALL preserve: Docker image pull, Pulumi state save/restore, SSH key setup, env var injection.
5. `template-deploy.ts` SHALL be deleted after migration.

### Requirement 4: Backward compatibility

#### Acceptance Criteria

1. All existing deploy paths SHALL continue to work unchanged.
2. The full project SHALL compile with zero new TypeScript errors.
3. Template deploys for GCP managed and VPS SHALL produce identical results.

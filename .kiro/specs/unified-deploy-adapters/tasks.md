# Implementation Plan: Unified Deploy Adapters

## Overview

Refactor the deploy pipeline from two divergent code paths (GCP via Pulumi, AWS via CodeBuild+CloudFormation) into a single orchestration flow with a provider adapter pattern. Implementation proceeds foundation-first: types and interfaces, then adapters one at a time, then processor refactor, then detection/Dockerfile consolidation, then image-builder re-export wiring.

## Tasks

- [x] 1. Define adapter types and interfaces
  - [x] 1.1 Create `deploy/processor/adapters/types.ts` with the `DeployAdapter` interface, `AdapterContext`, `PushImageResult`, `ProvisionResult`, and `AdapterResult` types
    - Define `DetectedStackInfo` interface with runtime, framework, packageManager, port, subDir, isStatic
    - Define `AdapterContext` with deploymentId, repoName, shortId, region, repoDir, workDir, commitHash, providerCredentials, event, detectedStack, runCmd, appendLog, writeFile, readFile, rm
    - Define `PushImageResult` with remoteImageUri and skipped fields
    - Define `ProvisionResult` with appUrl, serverIp (optional), and outputs record
    - Define `AdapterResult` with appUrl and dockerImage
    - Define `DeployAdapter` interface with id, supports(), pushImage(), provisionInfrastructure(), injectEnvVars(), runPostDeploy()
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.2 Create `deploy/processor/adapters/index.ts` with the adapter registry
    - Implement `getAdapter(provider, deployStrategy)` that finds the matching adapter via `supports()`
    - Implement `registerAdapter(adapter)` for extensibility
    - Implement `listAdapterIds()` for diagnostics
    - Add `STRATEGY_MAP` for strategy name normalization
    - Throw descriptive error when no adapter matches, including provider, strategy, and list of supported adapters
    - Initially register an empty adapter array (adapters will be added as they are implemented)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 1.3 Write property test for adapter registry dispatch
    - **Property 8: Adapter registry covers all deploy targets and rejects invalid combinations**
    - **Validates: Requirements 4.1, 4.3, 13.1**
    - Test that all 6 valid (provider, strategy) pairs return an adapter with matching `supports()` returning true
    - Test that arbitrary invalid (provider, strategy) pairs throw an error containing both provider and strategy

- [x] 2. Implement GCP adapters
  - [x] 2.1 Implement `deploy/processor/adapters/gcp-cloudrun.ts`
    - Extract Cloud Run logic from `pulumi-deploy.ts` (AR push, Pulumi Cloud Run provisioning, Cloud Run import detection)
    - `supports("gcp", "managed")` returns true
    - `pushImage`: Get GCP access token, enable AR + Cloud Run APIs, create AR repo, tag and push image
    - `injectEnvVars`: Set `imageUri` in Pulumi config; env vars baked into Pulumi program
    - `provisionInfrastructure`: Set up Pulumi workspace, restore state, run `pulumi up` with `buildGcpCloudRun` template, handle Cloud Run service import for first deploys
    - `runPostDeploy`: Save Pulumi state to DB
    - Register adapter in `deploy/processor/adapters/index.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 2.2 Implement `deploy/processor/adapters/gcp-compute.ts`
    - Extract Compute Engine VPS logic from `pulumi-deploy.ts` (AR push, Pulumi Compute Engine provisioning, SCP image transfer, container start)
    - `supports("gcp", "vps")` returns true
    - `pushImage`: Same AR push flow as Cloud Run, also enable `compute.googleapis.com`
    - `injectEnvVars`: Replace `__AR_IMAGE_URI__`, `__AR_TOKEN__`, `__USER_ENV_FLAGS__`, `__DEPLOY_DB_*__` placeholders in Pulumi program
    - `provisionInfrastructure`: Set up Pulumi workspace with SSH keys, run `pulumi up` with `buildGcpComputeEngine` template
    - `runPostDeploy`: Wait for server SSH, SCP Docker image, load and start container with port mapping and env vars, configure nginx proxy
    - Register adapter in `deploy/processor/adapters/index.ts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 2.3 Implement `deploy/processor/adapters/gcp-storage.ts`
    - Extract GCP static site logic from `pulumi-deploy.ts` (Pulumi GCS+CDN provisioning, static site build, GCS upload)
    - `supports("gcp", "static")` returns true
    - `pushImage`: Return `{ skipped: true, remoteImageUri: "" }` — no Docker image needed
    - `injectEnvVars`: No-op
    - `provisionInfrastructure`: Enable `compute.googleapis.com`, run `pulumi up` with `buildGcpCloudStorageCdn` template
    - `runPostDeploy`: Build static site locally using detected package manager, identify output directory, upload files to GCS bucket via GCS JSON API
    - Register adapter in `deploy/processor/adapters/index.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3. Checkpoint — Verify GCP adapters
  - Ensure all GCP adapter files compile without errors
  - Ensure the adapter registry returns the correct adapter for all three GCP strategy combinations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement AWS adapters
  - [x] 4.1 Implement `deploy/processor/adapters/aws-ecs.ts`
    - Extract ECS Fargate logic from `aws-deploy.ts` (ECR push, CloudFormation ECS provisioning, stack polling)
    - `supports("aws", "managed")` returns true
    - `pushImage`: Create ECR repository if needed, push Docker image to ECR
    - `injectEnvVars`: Inject env vars into ECS task definition container environment via CloudFormation parameters
    - `provisionInfrastructure`: Deploy CloudFormation stack using `image-builder/deploy-templates/ecs-fargate.yml`, handle `ROLLBACK_COMPLETE` cleanup, poll stack status
    - `runPostDeploy`: Extract app URL from CloudFormation stack outputs
    - Register adapter in `deploy/processor/adapters/index.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 4.2 Implement `deploy/processor/adapters/aws-ec2.ts`
    - Extract EC2 logic from `aws-deploy.ts` (ECR push, CloudFormation EC2 provisioning)
    - `supports("aws", "vps")` returns true
    - `pushImage`: Same ECR push flow as ECS adapter
    - `injectEnvVars`: Pass env vars as `EnvVarsJson` CloudFormation parameter
    - `provisionInfrastructure`: Deploy CloudFormation stack using `image-builder/deploy-templates/ec2.yml`, pass `SelfHostedServices` and `TechStack` parameters
    - `runPostDeploy`: Extract app URL from CloudFormation stack outputs
    - Register adapter in `deploy/processor/adapters/index.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 4.3 Implement `deploy/processor/adapters/aws-s3.ts`
    - Extract S3+CloudFront static site logic from `aws-deploy.ts`
    - `supports("aws", "static")` returns true
    - `pushImage`: Return `{ skipped: true, remoteImageUri: "" }`
    - `injectEnvVars`: No-op
    - `provisionInfrastructure`: Build static site locally, create S3 bucket, sync files, deploy CloudFormation stack using `image-builder/deploy-templates/s3.yml`
    - `runPostDeploy`: Extract app URL (CloudFront domain) from stack outputs
    - Register adapter in `deploy/processor/adapters/index.ts`
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 5. Checkpoint — Verify all adapters compile and registry is complete
  - Ensure all 6 adapter files compile without errors
  - Ensure the adapter registry returns the correct adapter for all 6 (provider, strategy) combinations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Refactor the deploy processor to use adapters
  - [x] 6.1 Refactor `deploy/processor/index.ts` to use the unified adapter dispatch
    - Replace the `if (provider === "aws") ... else ...` branching with `getAdapter(provider, strategy)` lookup
    - Add `buildMethod: "codebuild"` check before adapter dispatch — route to legacy `handleAwsDeploy` path
    - Build `AdapterContext` from existing variables (deploymentId, repoName, shortId, region, repoDir, workDir, commitHash, providerRow, event, detectedStack, runCmd, appendLog, writeFile, readFile, rm)
    - Call adapter methods in order: `injectEnvVars` → `pushImage` → `provisionInfrastructure` → `runPostDeploy`
    - Preserve template deploy bypass (`event.templateId` check)
    - Preserve Docker build with retry logic (3 attempts with `patchDockerfile`)
    - Preserve Docker image caching (check for cached image from previous deployment)
    - Preserve deployment status updates: `pending` → `building` → `deploying` → `success`/`failed`
    - Preserve timestamped logging for each pipeline step
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.2, 13.3, 13.5, 13.6, 13.7, 14.1, 14.2, 14.3, 17.1, 17.2, 17.3, 18.1, 18.2, 18.3, 18.4_

  - [ ]* 6.2 Write unit tests for processor adapter dispatch
    - Test that `buildMethod: "codebuild"` routes to legacy `handleAwsDeploy`
    - Test that template deploys bypass the unified pipeline
    - Test that the processor builds `AdapterContext` correctly and calls adapter methods in order
    - Test Docker build retry with auto-patching (mock Docker failures and `patchDockerfile`)
    - Test deployment status progression: pending → building → deploying → success
    - Test error logging includes last 20 lines of failed step output
    - _Requirements: 11.1, 11.4, 13.6, 14.1, 14.2, 14.3, 18.1, 18.3_

- [x] 7. Checkpoint — Verify refactored processor
  - Ensure `deploy/processor/index.ts` compiles without errors
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Extend the unified DetectedStack type
  - [ ] 8.1 Extend `deploy/repo-analyzer/types.ts` with the unified `DetectedStack` discriminated union
    - Add `DetectedStack` type as a discriminated union on `runtime` field
    - Node variant: framework (nextjs | nuxt | sveltekit | spa | angular | astro | generic), packageManager, packageManagerVersion, nodeVersion, hasStandalone, isStatic, subDir, port, nativeDeps, startCommand
    - PHP variant: framework (laravel | generic), phpVersion, phpExtensions, hasNodeAssets, subDir, port
    - Python variant: framework (django | fastapi | flask | generic), pythonVersion, subDir, port
    - Go variant: goVersion, subDir, port
    - Unknown variant: subDir, port
    - Keep existing `RepoConfig` interface for backward compatibility during migration
    - _Requirements: 1.7_

  - [ ]* 8.2 Write property test for stack detection runtime identification
    - **Property 1: Stack detection identifies correct runtime**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
    - Generate random directory structures with marker files (package.json, composer.json, requirements.txt/pyproject.toml/Pipfile/manage.py, go.mod)
    - Verify correct runtime, framework, package manager, and version detection

  - [ ]* 8.3 Write property test for subdirectory detection
    - **Property 2: Subdirectory detection scopes correctly**
    - **Validates: Requirements 1.6**
    - Generate random nested directory structures with runtime marker files in subdirectories but not root
    - Verify correct subdirectory identification and scoped detection

- [ ] 9. Consolidate PHP Dockerfile generator
  - [ ] 9.1 Replace `deploy/repo-analyzer/dockerfiles/php.ts` with the image-builder's production-ready php-fpm pattern
    - Port the `phpDockerfile` function from `image-builder/detection/php.ts` to `deploy/repo-analyzer/dockerfiles/php.ts`
    - Use `php:X.Y-fpm-{debian}` base image with nginx and supervisord for Laravel
    - Include multi-stage build: base, deps, frontend (when Node assets present), runner
    - Include Laravel setup: storage permissions, .env generation, artisan key:generate, cache clearing
    - Detect PHP extensions from composer.json and composer.lock (including transitive deps)
    - Handle PECL extensions (redis, imagick, etc.) and version-specific handling (imap via PECL on PHP 8.4+)
    - Map PHP version to correct Debian variant (bullseye for <8.1, bookworm for 8.1+)
    - Pick correct Composer image tag (2.2 for PHP <8.1, 2 for 8.1+)
    - Adapt the function signature to accept the existing `RepoConfig` type (bridge until full migration to `DetectedStack`)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.10_

  - [ ]* 9.2 Write property test for PHP Laravel Dockerfile generation
    - **Property 3: PHP Laravel Dockerfile uses production-ready pattern**
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - Generate random PHP versions (7.x through 8.4) and Laravel configs
    - Verify Dockerfile contains fpm base image, nginx, supervisor, multi-stage build, and Laravel setup commands

  - [ ]* 9.3 Write property test for PHP extension installation
    - **Property 4: PHP extension installation matches composer requirements**
    - **Validates: Requirements 2.5**
    - Generate random composer.json with ext-* requirements across PHP versions
    - Verify correct install commands (docker-php-ext-install for standard, pecl install for PECL, version-specific handling)

- [ ] 10. Verify Node.js, Python, and Go Dockerfile generators
  - [ ]* 10.1 Write property test for Node.js Dockerfile generation
    - **Property 5: Node.js Dockerfile uses correct version and package manager**
    - **Validates: Requirements 2.6, 2.7**
    - Generate random Node.js configs (version, package manager, framework)
    - Verify correct Node.js version, package manager install command, and framework-specific output structure

  - [ ]* 10.2 Write property test for Python Dockerfile generation
    - **Property 6: Python Dockerfile uses correct production server**
    - **Validates: Requirements 2.8**
    - Generate random Python framework configs (Django, FastAPI, Flask, generic)
    - Verify correct production server (gunicorn for Django/Flask, uvicorn for FastAPI)

  - [ ]* 10.3 Write property test for user-provided Dockerfile preservation
    - **Property 7: User-provided Dockerfile is preserved**
    - **Validates: Requirements 2.11**
    - Generate random repos with/without existing Dockerfiles
    - Verify that existing Dockerfiles are preserved and generation is skipped

- [ ] 11. Checkpoint — Verify Dockerfile generators and property tests
  - Ensure all Dockerfile generators compile without errors
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Wire image-builder to import from deploy/repo-analyzer
  - [ ] 12.1 Update `image-builder/detection/types.ts` to re-export from `deploy/repo-analyzer/types.ts`
    - Replace the local `DetectedStack` type definition with `export type { DetectedStack } from "../../deploy/repo-analyzer/types"`
    - _Requirements: 1.9, 12.2_

  - [ ] 12.2 Update `image-builder/detection/index.ts` to delegate to `deploy/repo-analyzer`
    - Import `detectStack` and `generateDockerfile` from `deploy/repo-analyzer` (or bridge through the existing detection functions)
    - Preserve the existing public API exports so `image-builder/source-bundler.ts` and other consumers continue to work
    - Ensure `detectStack` returns the unified `DetectedStack` type
    - Ensure `generateDockerfile` uses the unified generators
    - _Requirements: 1.8, 1.9, 12.2_

  - [ ]* 12.3 Write unit tests for image-builder re-export wiring
    - Test that `image-builder/detection/index.ts` exports `detectStack` and `generateDockerfile`
    - Test that the exported `DetectedStack` type matches the unified type from `deploy/repo-analyzer/types.ts`
    - _Requirements: 12.1, 12.2_

- [ ] 13. Environment variable injection and precedence
  - [ ]* 13.1 Write property test for environment variable injection
    - **Property 9: Environment variables are injected through provider-appropriate mechanism**
    - **Validates: Requirements 15.1**
    - Generate random env var sets for each adapter type
    - Verify all provided variables appear in provider-specific output (Pulumi config, CloudFormation params, docker run flags)

  - [ ]* 13.2 Write property test for infrastructure env var precedence
    - **Property 10: Infrastructure env vars override user-provided values**
    - **Validates: Requirements 15.2, 15.3**
    - Generate conflicting user + infrastructure env vars (e.g., user provides DB_HOST, infra also provides DB_HOST)
    - Verify infrastructure-derived values take precedence in the final application environment

- [ ] 14. Deprecate old code paths
  - [ ] 14.1 Add deprecation comments to `deploy/processor/pulumi-deploy.ts` and `deploy/processor/aws-deploy.ts`
    - Add `@deprecated` JSDoc comments explaining logic has moved to adapter files
    - Keep the files intact for `buildMethod: "codebuild"` backward compatibility
    - _Requirements: 13.6_

- [ ] 15. Final checkpoint — Full integration verification
  - Ensure all adapter files, processor, repo-analyzer, and image-builder detection compile without errors
  - Ensure all tests pass, ask the user if questions arise.
  - Verify the adapter registry returns correct adapters for all 6 (provider, strategy) combinations
  - Verify `buildMethod: "codebuild"` still routes to legacy path
  - Verify template deploys still bypass the unified pipeline

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- The implementation order minimizes risk: foundation types → adapters one at a time → processor refactor → detection consolidation → image-builder wiring
- Existing `pulumi-deploy.ts` and `aws-deploy.ts` are preserved (deprecated) for `buildMethod: "codebuild"` backward compatibility
- All adapters wrap existing infrastructure code (Pulumi templates, CloudFormation templates) rather than replacing it

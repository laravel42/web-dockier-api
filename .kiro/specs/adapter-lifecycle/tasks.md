# Tasks: Adapter Lifecycle (Destroy)

## Overview

Extend the adapter pattern to cover destroy operations. Each adapter now implements provider-specific teardown logic, and the destroy orchestrator delegates to them.

## Tasks

- [x] 1. Add destroy to the adapter interface
  - [x] 1.1 Add `DestroyContext` and `DestroyResult` types to `deploy/processor/adapters/types.ts`
  - [x] 1.2 Add optional `destroy?()` method to `DeployAdapter` interface
  - [x] 1.3 Verify compilation

- [x] 2. Implement destroy in GCP adapters
  - [x] 2.1 Implement `destroy()` in `gcp-cloudrun.ts` — Pulumi state destroy + AR cleanup + no-state Cloud Run API fallback
  - [x] 2.2 Implement `destroy()` in `gcp-compute.ts` — Pulumi state destroy
  - [x] 2.3 Implement `destroy()` in `gcp-storage.ts` — Pulumi state destroy + no-state GCS/CDN API fallback
  - [x] 2.4 Verify compilation

- [x] 3. Implement destroy in AWS adapters
  - [x] 3.1 Implement `destroy()` in `aws-ecs.ts` — CloudFormation stack delete + ECR cleanup
  - [x] 3.2 Implement `destroy()` in `aws-ec2.ts` — CloudFormation stack delete + ECR cleanup
  - [x] 3.3 Implement `destroy()` in `aws-s3.ts` — CloudFormation stack delete + S3 bucket cleanup
  - [x] 3.4 Verify compilation

- [x] 4. Refactor destroy orchestrator to use adapters
  - [x] 4.1 Update `deploy/processor/destroy.ts` to resolve adapter and delegate
  - [x] 4.2 Keep fallback logic for edge cases (unknown provider, missing adapter)
  - [x] 4.3 Verify compilation

- [x] 5. Final verification
  - [x] 5.1 Full TypeScript compilation check — zero new errors ✓

## Deferred

- Template deploy migration to adapter pattern — deferred to a future branch when AWS template support is needed. The current `template-deploy.ts` works correctly for GCP templates.

## Notes

- The `destroy()` method is optional on the interface — adapters that don't implement it fall back to a generic "marked as destroyed" response
- The destroy orchestrator went from ~300 lines of monolithic logic to ~50 lines that delegate to adapters
- Each adapter handles its own provider-specific teardown (Pulumi state, API cleanup, CloudFormation, ECR, S3)

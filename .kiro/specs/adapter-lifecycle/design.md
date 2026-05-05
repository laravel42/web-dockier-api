# Design: Adapter Lifecycle (Template Deploy + Destroy)

## Overview

This extends the adapter pattern to cover the full deployment lifecycle: deploy, and destroy. Template deploys are migrated from a standalone function to the adapter dispatch, and each adapter gains a `destroy()` method for provider-specific teardown.

## Design Decisions

### 1. `destroy()` is optional on the interface

Not all adapters may have destroy logic immediately. Making it optional with a fallback to the existing orchestrator allows incremental migration. The interface uses an optional method:

```typescript
destroy?(ctx: DestroyContext): Promise<DestroyResult>;
```

### 2. Template deploys reuse existing adapters

Rather than creating separate "template" adapters, the existing adapters handle template deploys. The key difference is that template deploys skip repo clone, analysis, and Docker build — they pull a pre-built image and go straight to `pushImage()` → `provisionInfrastructure()` → `runPostDeploy()`.

The processor handles the template-specific setup (pull image, generate Pulumi program) and then dispatches to the same adapter.

### 3. DestroyContext is separate from AdapterContext

Destroy operations don't have a repo, a detected stack, or a running Docker build. They need different context: the saved Pulumi state, the tofu script, and the deployment record. A separate `DestroyContext` type keeps this clean.

## Architecture

### Destroy Flow (new)

```
destroyDeployment endpoint
  → destroy() orchestrator
    → resolve adapter via getAdapter(provider, strategy)
    → if adapter.destroy exists: adapter.destroy(ctx)
    → else: fallback to existing logic (Pulumi state / GCP API / AWS CFN)
```

### Template Deploy Flow (new)

```
DeployEvent (templateId set)
  → processor handler
    → pull Docker image
    → generate Pulumi program (if not provided)
    → resolve adapter via getAdapter(provider, strategy)
    → adapter.pushImage(ctx, localImage)
    → adapter.provisionInfrastructure(ctx, imageUri)
    → adapter.runPostDeploy(ctx, provision)
```

### Interface Changes

```typescript
// New types
interface DestroyContext {
  deploymentId: string;
  repoName: string;
  appName: string;
  region: string;
  providerCredentials: { apiKey: string; apiSecret: string };
  tofuScript: string;
  deployStrategy: string;
  appendLog: (line: string) => Promise<void>;
}

interface DestroyResult {
  success: boolean;
  message: string;
  errors: string[];
}

// Extended adapter interface
interface DeployAdapter {
  // ... existing methods ...
  destroy?(ctx: DestroyContext): Promise<DestroyResult>;
}
```

## File Changes

| Action | File | Reason |
|--------|------|--------|
| Update | `deploy/processor/adapters/types.ts` | Add DestroyContext, DestroyResult, optional destroy() |
| Update | `deploy/processor/adapters/gcp-cloudrun.ts` | Implement destroy() |
| Update | `deploy/processor/adapters/gcp-compute.ts` | Implement destroy() |
| Update | `deploy/processor/adapters/gcp-storage.ts` | Implement destroy() |
| Update | `deploy/processor/adapters/aws-ecs.ts` | Implement destroy() |
| Update | `deploy/processor/adapters/aws-ec2.ts` | Implement destroy() |
| Update | `deploy/processor/adapters/aws-s3.ts` | Implement destroy() |
| Update | `deploy/processor/destroy.ts` | Use adapter.destroy() with fallback |
| Update | `deploy/processor/index.ts` | Migrate template deploy to adapter dispatch |
| Delete | `deploy/processor/template-deploy.ts` | Logic moved to processor + adapters |

# Design: Deploy Pipeline Context Refactoring

## Overview

Replace the ad-hoc parameter threading in `executePipeline` with a mutable `PipelineContext` class that stages populate incrementally. The orchestrator becomes a thin sequence of named stage calls.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ executePipeline(event: PipelineInput)                    │
│                                                         │
│   ctx = new PipelineContext(event, logger, runCmd)       │
│                                                         │
│   stageProviderCredentials(ctx)  → ctx.provider, ...    │
│   stageClone(ctx)                → ctx.repoDir, ...     │
│   stageLoadProjectContext(ctx)   → ctx.envVars, ...     │
│   stageAnalyze(ctx)              → ctx.repoConfig       │
│   stageBuild(ctx)                → ctx.actualImage      │
│   stageProvision(ctx)            → ctx.adapter, ...     │
│   stagePostDeploy(ctx)                                  │
│   stageNetworkRules(ctx)                                │
│   stageFinalize(ctx)                                    │
│   stageRestoreProcesses(ctx)                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
backend/src/services/deploy/domain/
├── pipeline-context.ts      ← NEW: PipelineContext class
├── pipeline-stages.ts       ← NEW: All stage functions
├── pipeline.ts              ← MODIFIED: Thin orchestrator + exports
├── pipeline-helpers.ts      ← UNCHANGED: appendLog, updateStatus, etc.
├── pipeline-build.ts        ← UNCHANGED: buildImage (called by stageBuild)
├── pipeline-health.ts       ← UNCHANGED: waitForAppReady (called by stageFinalize)
└── pipeline-template.ts     ← UNCHANGED: Template deploy (out of scope)
```

## PipelineContext Class

#[[file:backend/src/services/deploy/domain/pipeline.ts]]

```typescript
// backend/src/services/deploy/domain/pipeline-context.ts

import type { ContextualLogger } from "../../../lib/logging.js";
import type { RepoConfig } from "../../../lib/repo-analyzer/types.js";
import type { RunCmdFn } from "./run-cmd.js";
import type { DeployAdapter } from "./adapters/types.js";
import type { AdapterContext, ProvisionResult } from "./adapters/types.js";
import { deriveRepoName } from "../../../lib/naming.js";
import type { PipelineInput } from "./pipeline.js";

export class PipelineContext {
  // ─── Immutable inputs (set at construction) ───────────────────
  readonly event: PipelineInput;
  readonly deploymentId: string;
  readonly repoName: string;
  readonly shortId: string;
  readonly logger: ContextualLogger;
  readonly runCmd: RunCmdFn;

  // ─── Stage 1: Provider Credentials ────────────────────────────
  provider!: string;
  region!: string;
  credentials!: { api_key: string; api_secret: string };

  // ─── Stage 2: Clone ───────────────────────────────────────────
  repoDir!: string;
  workDir!: string;
  commitHash!: string;

  // ─── Stage 3: Project Context ─────────────────────────────────
  envVars: Array<{ name: string; value: string }> = [];
  deployScript = "";
  knownPlatform = "";

  // ─── Stage 4: Analyze ─────────────────────────────────────────
  repoConfig!: RepoConfig;

  // ─── Stage 5: Build ───────────────────────────────────────────
  actualImage!: string;
  skippedBuild = false;

  // ─── Stage 6: Provision ───────────────────────────────────────
  adapter!: DeployAdapter;
  adapterCtx!: AdapterContext;
  provision!: ProvisionResult;

  // ─── Computed ─────────────────────────────────────────────────
  get deployStrategy(): string {
    return this.event.deployStrategy || "managed";
  }

  get isStaticDeploy(): boolean {
    return this.deployStrategy === "static";
  }

  constructor(event: PipelineInput, logger: ContextualLogger, runCmd: RunCmdFn) {
    this.event = event;
    this.deploymentId = event.deploymentId;
    this.repoName = deriveRepoName(event.repo);
    this.shortId = event.deploymentId.slice(0, 8);
    this.logger = logger;
    this.runCmd = runCmd;
  }
}
```

## Stage Functions

Each stage is a focused function in `pipeline-stages.ts`:

```typescript
// backend/src/services/deploy/domain/pipeline-stages.ts

import type { PipelineContext } from "./pipeline-context.js";
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { extractRegionFromScript } from "./gcp-helpers.js";
import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { patchDeployment } from "./deployments.js";
// ... other imports

export async function stageProviderCredentials(ctx: PipelineContext): Promise<void> {
  const creds = await getProviderCredentialsSafe(ctx.event.providerId);
  if (!creds) throw new Error(`Provider not found: ${ctx.event.providerId}`);

  ctx.provider = creds.provider || "cloud";
  ctx.region = creds.region || "us-east-1";

  if (ctx.event.tofuScript) {
    const scriptRegion = extractRegionFromScript(ctx.event.tofuScript);
    if (scriptRegion) ctx.region = scriptRegion;
  }

  ctx.credentials = { api_key: creds.apiKey, api_secret: creds.apiSecret };
}

export async function stageClone(ctx: PipelineContext): Promise<void> {
  // Fetch git connection from DB
  const connRow = await fetchGitConnection(ctx.event.gitConnectionId);
  if (!connRow) throw new Error("Git connection not found");

  const result = await cloneRepo({
    git: {
      provider: connRow.provider || "",
      token: connRow.personal_token || "",
      repo: ctx.event.repo,
      endpoint: connRow.endpoint || "",
    },
    branch: ctx.event.branch,
    shortId: ctx.shortId,
    logger: ctx.logger,
  });

  ctx.repoDir = result.repoDir;
  ctx.workDir = result.workDir;
  ctx.commitHash = result.commitHash;
  await patchDeployment(ctx.deploymentId, { commit_hash: ctx.commitHash });
}

// ... remaining stages follow the same pattern
```

## Orchestrator (Simplified pipeline.ts)

```typescript
export async function executePipeline(event: PipelineInput): Promise<void> {
  const { deploymentId } = event;

  // Idempotency guard
  const currentStatus = await getDeploymentCurrentStatus(deploymentId);
  if (currentStatus === "building" || currentStatus === "deploying") return;

  // Template deploy early exit
  if (event.templateId) {
    const templateConfig = getTemplateConfig(event.templateId);
    if (templateConfig) {
      const providerResult = await fetchProviderForTemplate(event);
      if (providerResult) {
        await executeTemplatePipeline(event, providerResult, templateConfig);
        return;
      }
    }
  }

  // Standard pipeline
  const runCmd = createStreamingRunCmd(deploymentId, appendLog, logTimestamp);
  const logger = createDeployLogger(appendLog, deploymentId);
  const ctx = new PipelineContext(event, logger, runCmd);

  try {
    await updateStatus(deploymentId, "building");
    await appendLog(deploymentId, `[${logTimestamp()}] ▶ Starting deployment pipeline...`);

    await stageProviderCredentials(ctx);
    await appendLog(deploymentId, `[${logTimestamp()}] ℹ Provider: ${ctx.provider} | Region: ${ctx.region}`);
    await appendLog(deploymentId, `[${logTimestamp()}] ℹ Strategy: ${ctx.deployStrategy}`);

    await stageClone(ctx);
    await stageLoadProjectContext(ctx);
    await stageAnalyze(ctx);
    await stageBuild(ctx);

    await updateStatus(deploymentId, "deploying");
    await stageProvision(ctx);
    await stagePostDeploy(ctx);
    await stageNetworkRules(ctx);
    await stageFinalize(ctx);
    await stageRestoreProcesses(ctx);

    await rm(ctx.workDir, { recursive: true, force: true }).catch(() => {});
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    await appendLog(deploymentId, `[${logTimestamp()}] ✗ Deployment failed: ${message}`);
    await updateStatus(deploymentId, "failed");
  }
}
```

## AdapterContext Bridge

The `buildAdapterContext` function is updated to accept `PipelineContext`:

```typescript
export function buildAdapterContext(ctx: PipelineContext): AdapterContext {
  const detectedStack = toDetectedStack(ctx.repoConfig);

  return {
    deploymentId: ctx.deploymentId,
    repoName: ctx.repoName,
    shortId: ctx.shortId,
    region: ctx.region,
    repoDir: ctx.repoDir,
    workDir: ctx.workDir,
    commitHash: ctx.commitHash,
    providerCredentials: { apiKey: ctx.credentials.api_key, apiSecret: ctx.credentials.api_secret },
    event: { /* map ctx.event fields */ },
    detectedStack,
    runCmd: ctx.runCmd,
    appendLog: (line: string) => appendLog(ctx.deploymentId, `[${logTimestamp()}] ${line}`),
    writeFile,
    readFile,
    rm,
    state: { actualImage: ctx.actualImage },
  };
}
```

## Testing Strategy

With `PipelineContext`, testing a stage requires:

```typescript
// Test stageProviderCredentials in isolation
const event = { ...mockPipelineInput, providerId: "test-provider-id" };
const ctx = new PipelineContext(event, mockLogger, mockRunCmd);

// Mock the DB call
vi.mocked(getProviderCredentialsSafe).mockResolvedValue({
  provider: "aws", region: "us-west-2", apiKey: "key", apiSecret: "secret"
});

await stageProviderCredentials(ctx);

expect(ctx.provider).toBe("aws");
expect(ctx.region).toBe("us-west-2");
```

Compare to today where testing requires constructing the full 13-property object that `buildDockerImage` or `pushAndProvision` expects.

## Migration Strategy

Implemented incrementally, each step compiles and passes tests:

1. **Create `pipeline-context.ts`** — Just the class, no consumers yet.
2. **Create `pipeline-stages.ts`** — Move existing helper functions (`fetchProviderCredentials`, `cloneRepository`, `loadProjectContext`) into stage wrappers that use the context.
3. **Update `executePipeline`** — Create context, call stages, keep old code commented/alongside until verified.
4. **Remove old code** — Delete the unused inline helper functions from pipeline.ts.
5. **Update exports** — Ensure `pipeline-template.ts` still has access to shared helpers via explicit exports.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stage ordering bug (reading unset property) | Low | High | Definite assignment assertions crash immediately with clear error |
| Breaking `pipeline-template.ts` | Medium | Medium | Keep shared functions exported; template pipeline is out of scope |
| Subtle behavior change in error paths | Low | High | Each step verified with existing tests; error handling stays in orchestrator |
| Performance regression from class allocation | Very Low | None | One allocation per deploy — negligible vs network/Docker I/O |

# Design: Dokploy Deploy Integration

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (DeployWizard)                                         │
│  Provider → Analysis → Plan → Deploy (live progress)             │
└──────────────────────────────┬──────────────────────────────────┘
                               │ POST /deploy/deployments
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend: Deploy Service Routes                                  │
│  createAndEnqueueDeployment() → pg-boss queue                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ async job
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dokploy Pipeline Worker                                         │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │ Ensure      │  │ Sync Git     │  │ Provision/Reuse  │       │
│  │ Project     │  │ Credentials  │  │ Remote Server    │       │
│  │ (tenant)    │  │ (parallel)   │  │ (parallel)       │       │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘       │
│         │                 │                    │                  │
│         └─────────────────┴────────────────────┘                 │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────┐         │
│  │ Create/Configure Application                        │         │
│  │ (source, build type, env vars)                      │         │
│  └──────────────────────────┬─────────────────────────┘         │
│                             │                                    │
│                             ▼                                    │
│  ┌────────────────────────────────────────────────────┐         │
│  │ Trigger Deploy → Poll Status                        │         │
│  │ On failure: Dokploy AI fix → retry (max 3x)        │         │
│  └────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dokploy Instance (self-hosted)                                  │
│  • Clones repo via git provider                                  │
│  • Builds image (nixpacks/railpack/dockerfile/static)            │
│  • Deploys container to remote server                            │
│  • Manages Traefik routing + TLS                                 │
│  • AI-assisted error diagnosis (pre-configured)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Module Structure

```
backend/src/services/deploy/domain/dokploy/
├── client.ts              # Typed Dokploy API client (HTTP + auth + retries)
├── types.ts               # Request/response types for Dokploy endpoints
├── pipeline.ts            # Orchestrator: coordinates all stages
├── stages/
│   ├── ensure-project.ts  # Create or reuse Dokploy Project for tenant
│   ├── sync-git.ts        # Sync git credentials to Dokploy
│   ├── provision-server.ts # Provision VPS + register in Dokploy
│   ├── configure-app.ts   # Create/configure Dokploy Application
│   ├── trigger-deploy.ts  # Trigger deploy + poll status + Dokploy AI retry
│   └── ai-recovery.ts     # Invoke Dokploy AI for failure recovery
├── mappings.ts            # DB operations for dokploy_* tables
└── __tests__/             # Unit tests
```

## Dokploy API Client Design

```typescript
// backend/src/services/deploy/domain/dokploy/client.ts

interface DokployClientConfig {
  baseUrl: string;   // DOKPLOY_API_URL
  apiToken: string;  // DOKPLOY_API_TOKEN
  timeout?: number;  // default 30s
  retries?: number;  // default 3
}

class DokployClient {
  // Projects
  createProject(name: string, description?: string): Promise<DokployProject>;
  getProject(projectId: string): Promise<DokployProject>;
  listProjects(): Promise<DokployProject[]>;

  // Servers
  createServer(params: CreateServerParams): Promise<DokployServer>;
  setupServer(serverId: string): Promise<void>;
  validateServer(serverId: string): Promise<ServerValidation>;
  getServer(serverId: string): Promise<DokployServer>;

  // Applications
  createApplication(params: CreateAppParams): Promise<DokployApplication>;
  getApplication(applicationId: string): Promise<DokployApplication>;
  updateApplication(params: UpdateAppParams): Promise<void>;
  saveGithubProvider(params: GithubProviderParams): Promise<void>;
  saveGitlabProvider(params: GitlabProviderParams): Promise<void>;
  saveGitProvider(params: CustomGitParams): Promise<void>;
  saveBuildType(params: BuildTypeParams): Promise<void>;
  saveEnvironment(params: EnvironmentParams): Promise<void>;

  // Deployments
  deploy(applicationId: string, title?: string): Promise<void>;
  redeploy(applicationId: string): Promise<void>;
  cancelDeployment(applicationId: string): Promise<void>;

  // AI (Dokploy built-in)
  triggerAIFix(applicationId: string): Promise<AIFixResult>;

  // SSH Keys
  createSSHKey(params: CreateSSHKeyParams): Promise<DokploySSHKey>;
  listSSHKeys(): Promise<DokploySSHKey[]>;
}
```

## Pipeline Orchestration Flow

```typescript
// backend/src/services/deploy/domain/dokploy/pipeline.ts

export async function executeDokployPipeline(event: PipelineInput): Promise<void> {
  const client = createDokployClient();
  const ctx = new DokployPipelineContext(event, client);

  try {
    await updateStatus(event.deploymentId, "building");

    // Stage 1: Ensure Dokploy Project exists for this tenant
    await stage_ensureProject(ctx);

    // Stage 2 & 3: Run in parallel
    await Promise.all([
      stage_syncGitCredentials(ctx),
      stage_provisionServer(ctx),
    ]);

    // Stage 4: Create and configure the application (needs project + git + server)
    await stage_configureApplication(ctx);

    // Stage 5: Deploy with retry loop (uses Dokploy AI on failure)
    await updateStatus(event.deploymentId, "deploying");
    await stage_deployWithRetry(ctx, { maxAttempts: 3 });

    // Success
    await updateStatus(event.deploymentId, "success");
  } catch (error) {
    await updateStatus(event.deploymentId, "failed");
    throw error;
  }
}
```

## Deploy Retry with Dokploy AI Recovery

Dokploy has a built-in AI feature (already configured on the Dockier Dokploy account) that can analyze deployment failure logs and suggest/apply fixes. This is preferred over calling OpenAI directly because Dokploy AI understands its own build system, container configuration, and common deployment errors intimately.

```typescript
// backend/src/services/deploy/domain/dokploy/stages/trigger-deploy.ts

async function stage_deployWithRetry(ctx: DokployPipelineContext, opts: { maxAttempts: number }) {
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    await ctx.log(`Deploy attempt ${attempt}/${opts.maxAttempts}...`);

    // Trigger the deploy
    await ctx.client.deploy(ctx.dokployApplicationId, `Dockier deploy attempt ${attempt}`);

    // Poll until done
    const result = await pollDeploymentStatus(ctx);

    if (result.status === "done") {
      await ctx.log("Deployment successful!");
      return;
    }

    // Failed — invoke Dokploy AI for recovery if we have retries left
    if (attempt < opts.maxAttempts) {
      await ctx.log("Deploy failed. Invoking Dokploy AI to diagnose and fix...");
      const aiResult = await invokeDokployAI(ctx);
      if (aiResult.fixed) {
        await ctx.log(`Dokploy AI applied fix: ${aiResult.description}`);
      } else {
        await ctx.log("Dokploy AI could not determine a fix. Retrying anyway...");
      }
    }
  }

  throw new Error(`Deployment failed after ${opts.maxAttempts} attempts`);
}

// backend/src/services/deploy/domain/dokploy/stages/ai-recovery.ts

async function invokeDokployAI(ctx: DokployPipelineContext): Promise<{ fixed: boolean; description: string }> {
  try {
    // Dokploy AI is built into the platform — we just trigger it via API
    // It reads the deployment logs, diagnoses the issue, and applies a fix
    const result = await ctx.client.triggerAIFix(ctx.dokployApplicationId);
    return { fixed: result.applied, description: result.summary || "Unknown fix" };
  } catch (err) {
    // Non-fatal: Dokploy AI unavailable or errored
    await ctx.log(`Dokploy AI unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { fixed: false, description: "AI unavailable" };
  }
}
```

## Build Type Detection Logic

The system auto-detects the appropriate Dokploy build type based on the repo analysis:

| Condition | Build Type | Config |
|---|---|---|
| Repo has `Dockerfile` | `dockerfile` | `dockerfile: "./Dockerfile"` |
| Static site (React SPA, Vue SPA, no server) | `static` | `publishDirectory: "dist"` or `"build"` |
| Railpack-compatible (Node.js, Ruby, Go, Rust) | `railpack` | (zero config) |
| Default fallback | `nixpacks` | (zero config) |

This detection uses existing `RepoAnalysis` data (already computed in the Analysis step of the wizard).

## Server Provisioning Strategy

The Dokploy pipeline still needs a VPS to deploy to. The server provisioning reuses existing provider credentials but simplifies the flow:

1. Use AWS SDK / GCP API to launch a minimal VPS (same instance types from plans.ts)
2. Wait for SSH availability
3. Register in Dokploy as a Remote Server
4. Run `server.setup` to install Docker + Traefik + build tools
5. Validate with `server.validate`

This replaces the entire CloudFormation/Pulumi infrastructure-as-code approach with a simpler "just give me a VM" pattern. Dokploy handles everything else (Docker, networking, routing, TLS).

## Database Schema

```sql
-- Migration: 0047_dokploy_integration.sql

CREATE TABLE IF NOT EXISTS dokploy_tenant_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dokploy_project_id text NOT NULL,
  dokploy_environment_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS dokploy_servers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id),
  dokploy_server_id text NOT NULL,
  server_ip text NOT NULL,
  instance_id text,  -- AWS instance ID or GCP instance name
  server_status text DEFAULT 'provisioning',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (project_id)
);

CREATE TABLE IF NOT EXISTS dokploy_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dokploy_application_id text NOT NULL,
  dokploy_server_id text REFERENCES dokploy_servers(dokploy_server_id),
  build_type text NOT NULL DEFAULT 'nixpacks',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (project_id)
);
```

## Frontend Changes (Wizard)

The wizard steps become:

```
Step 0: Provider   — Select cloud provider (unchanged)
Step 1: Analysis   — Review detected services (unchanged)
Step 2: Plan       — Select instance size + region (unchanged)
Step 3: Deploy     — Live orchestration progress
```

The Deploy step UI shows a vertical timeline:

```
✓ Project created
✓ Git credentials synced
⟳ Provisioning server... (spinner)
○ Configuring application
○ Deploying
```

On failure + retry:
```
✓ Project created
✓ Git credentials synced
✓ Server provisioned
✓ Application configured
✗ Deploy failed (attempt 1/3)
  → Dokploy AI fix: Added missing NODE_ENV variable
⟳ Retrying deploy... (attempt 2/3)
```

## Feature Flag / Gradual Rollout

```typescript
// backend/src/shared/config.ts
export const DEPLOY_PROVIDER = process.env.DEPLOY_PROVIDER || "native";
// "native" = current CloudFormation/Pulumi pipeline
// "dokploy" = new Dokploy-based pipeline
```

The `createAndEnqueueDeployment` function checks this flag and routes to either the existing `executePipeline` or the new `executeDokployPipeline`.

## Environment Variables

```env
# Dokploy Integration
DOKPLOY_API_URL=https://dokploy.example.com/api
DOKPLOY_API_TOKEN=your-api-token
DOKPLOY_SSH_KEY_ID=ssh-key-id-in-dokploy
DEPLOY_PROVIDER=dokploy
```

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

The Dokploy pipeline needs a VPS to deploy to, and in the production model that VPS is launched **on the deploying tenant's own cloud account** (AWS or GCP). Dockier owns no shared compute. The provision-server stage resolves the tenant's credentials, launches a VM on their account, waits for SSH, then hands the IP to Dokploy.

### End-to-end flow

```
stageProvisionServer(projectId, providerId, plan, client, log)
  │
  ├─ 1. getServer(projectId) — reuse if server_status === "ready"
  │
  ├─ 2. DOKPLOY_DEFAULT_SERVER_IP set?  (testing-only)
  │        └─ yes → registerServerInDokploy({ serverIp: default })  ── done
  │
  ├─ 3. getProviderCredentialsSafe(providerId)  → { provider, region, apiKey, apiSecret }
  │
  ├─ 4. branch on provider:
  │        ├─ "aws" → provisionEc2Instance(creds, plan)  → { ip, instanceId }
  │        └─ "gcp" → provisionGceInstance(creds, plan)  → { ip, instanceId }
  │
  ├─ 5. waitForSsh(ip, port 22, timeout)
  │
  └─ 6. registerServerInDokploy({ serverIp: ip, instanceId, providerId, ... })
             └─ server.create → server.setup → server.validate → upsertServer(status="ready")
```

Steps 5–6 (SSH wait + Dokploy registration) already exist as `registerServerInDokploy()` in `provision-server.ts`. Steps 3–4 (credential resolve + VM launch) are the new work; today the stage throws when no `DOKPLOY_DEFAULT_SERVER_IP` and no existing server exist.

### Credential resolution (per tenant, not backend-global)

Credentials come from the `server_providers` table, resolved by the deployment's `providerId` via `getProviderCredentialsSafe(providerId)` in `backend/src/lib/provider-credentials.ts`. The shape differs by provider:

| Provider | `api_key` | `api_secret` | Notes |
|---|---|---|---|
| `aws` | Access Key ID | Secret Access Key | `region` from the row (default `us-east-1`) |
| `gcp` | Full service-account **JSON** (string) | unused | `project_id` + token minted via `getGcpAccessToken()` / `getGcpProjectId()` |

The pipeline must **not** use backend-global AWS/GCP env credentials for provisioning.

### AWS EC2 provisioning (`provisionEc2Instance`)

Reuses `getEc2()` from `backend/src/lib/aws-sdk.ts` (the `@aws-sdk/client-ec2` dep is already present), constructed with the tenant's resolved credentials + region. Steps:

1. `ImportKeyPairCommand` — import the deploy public key (idempotent by key name; reuse if exists).
2. Security group — find-or-create one opening ingress 22/80/443 and egress all (`CreateSecurityGroupCommand` + `AuthorizeSecurityGroupIngressCommand`).
3. Resolve a recent Ubuntu 22.04+ AMI (`DescribeImagesCommand`, Canonical owner `099720109477`) for the region.
4. `RunInstancesCommand` — launch one instance: instanceType from the plan, the key pair, the SG, `AssociatePublicIpAddress`, 30GB gp3 root volume, tagged `ManagedBy=dockier`.
5. Poll `DescribeInstancesCommand` until `running` + a public IP is assigned; return `{ ip, instanceId }`.

The equivalent resource set exists today only as a Pulumi template string (`pulumi-templates/aws.ts` `buildAwsEc2`) — it is the reference for what this SDK routine must reproduce, but it is not callable as-is.

### GCP Compute Engine provisioning (`provisionGceInstance`)

Reuses `createGcpClient(apiKey)` / `GcpClient` from `backend/src/services/deploy/domain/infra/gcp-client.ts` (auth, token exchange, retries, and delete/find/exists helpers already exist). New methods to add to `GcpClient`:

1. `createInstance(zone, params)` — `POST compute/v1/projects/{project}/zones/{zone}/instances` with an Ubuntu 22.04+ source image, machineType from the plan, an external NAT access config, and the deploy SSH key in metadata (`ssh-keys: root:<pubkey>`).
2. Firewall rule — `POST .../global/firewalls` opening tcp 22/80/443 (find-or-create by name).
3. Poll the returned zonal operation to completion, then read the instance's `networkInterfaces[].accessConfigs[].natIP` for the public IP; return `{ ip, instanceName }`.

Teardown helpers (`deleteInstance`, `deleteFirewall`, `findInstance`) already exist for cleanup.

### SSH reachability poll (`waitForSsh`)

New helper — no equivalent exists today. Poll TCP connect to `ip:22` on an interval (e.g. 5s) until connectable or a timeout (e.g. 3 min). Register in Dokploy only after SSH is reachable so `server.setup` doesn't fail immediately.

### Plan threading (new)

The user-selected plan (instance size + region) is **not** currently on `PipelineInput`. It must be threaded:

```
request body (plan/instanceSize)
  → CreateDeploymentParams
  → createDeploymentRecord (persist)
  → enqueueDeployment → PipelineInput.plan
  → stageProvisionServer(plan) → EC2 instanceType / GCE machineType
```

Region for AWS comes from the `server_providers` row; for GCP, zone/region is derived from the provider row or a sensible default.

### SSH key for provisioned VMs

Two keys are in play: the tenant's public key stored in the `ssh_keys` table (injected into the VM's `authorized_keys`) and Dokploy's key referenced by `DOKPLOY_SSH_KEY_ID` (used by Dokploy to connect after registration). The private half matching `DOKPLOY_SSH_KEY_ID` must be the one Dokploy holds; the corresponding public key must be present on the launched VM. For a first cut, inject the Dokploy-managed public key into the VM metadata/authorized_keys at launch so `server.setup` can connect.

### Reuse vs. build inventory

**Reusable as-is:**
- `getProviderCredentialsSafe(providerId)` — credential resolution (`lib/provider-credentials.ts`).
- `getEc2()`, `getSts()` (`lib/aws-sdk.ts`); `GcpClient`, `createGcpClient`, `getGcpAccessToken`, `getGcpProjectId` + GCE delete/find/exists (`domain/infra/gcp-client.ts`).
- `registerServerInDokploy()` and `upsertServer` / `getServer` / `updateServerStatus` (`dokploy/stages/provision-server.ts`, `dokploy/mappings.ts`). `dokploy_servers` already has `instance_id`, `provider_id`, `server_ip`, `server_status`.
- Tenant SSH key lookup from the `ssh_keys` table (pattern in `adapters/gcp-compute.ts`).

**Must be built:**
- `provisionEc2Instance()` — SDK-based EC2 launcher (SG + key pair + AMI lookup + RunInstances + poll). No callable launcher exists (only the Pulumi template equivalent).
- `provisionGceInstance()` + `GcpClient.createInstance()` + firewall insert + operation polling. Only delete/find helpers exist today.
- `waitForSsh()` port-22 reachability poller.
- Plan threading through `PipelineInput`.
- Wiring in `stageProvisionServer`: replace the current `throw` with resolve-creds → branch aws/gcp → provision → `waitForSsh` → `registerServerInDokploy`.

Dokploy still handles everything above the VM (Docker install via `server.setup`, networking, Traefik routing, TLS), so this remains a "just give me a VM on the user's account" pattern — far simpler than the legacy CloudFormation/Pulumi IaC approach.

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
DOKPLOY_SSH_KEY_ID=ssh-key-id-in-dokploy   # used when registering provisioned VPS as Dokploy remote servers
DEPLOY_PROVIDER=dokploy
# Testing-only: register this pre-provisioned IP instead of launching a VPS on the
# tenant's cloud account. Leave UNSET in production (per-tenant provisioning is the model).
# DOKPLOY_DEFAULT_SERVER_IP=
```

Cloud provisioning credentials are **not** env vars — they are per-tenant records in `server_providers`, resolved by the deployment's `providerId`.

# Requirements: Dokploy Deploy Integration

## Introduction

Dockier's current deploy pipeline uses a custom-built orchestrator that clones repos, builds Docker images locally, pushes to cloud registries, and provisions infrastructure via CloudFormation (AWS) or Pulumi (GCP). This pipeline is complex, fragile, and expensive to maintain.

We're replacing it with **Dokploy** — a self-hosted PaaS that handles the entire build-and-deploy lifecycle. Dockier becomes the orchestration layer that coordinates Dokploy's API to set up projects, servers, applications, git integration, and trigger deployments. Dokploy handles Docker builds, image management, Traefik routing, TLS, and container orchestration on remote servers.

## Glossary

- **Dokploy**: Self-hosted PaaS (alternative to Heroku/Vercel) providing application deployment, Docker Compose stacks, and managed databases via Docker + Traefik.
- **Dokploy Project**: Top-level organizational unit in Dokploy. Maps 1:1 to a Dockier tenant/organization.
- **Dokploy Application**: A deployable service within a Dokploy Project/Environment. Maps 1:1 to a Dockier project.
- **Dokploy Remote Server**: An external server registered in Dokploy for deploying applications (VPS from AWS EC2, GCP Compute Engine, etc.).
- **Build Type**: Dokploy supports `dockerfile`, `nixpacks`, `heroku_buildpacks`, `paketo_buildpacks`, `railpack`, and `static`.
- **Git Provider**: A configured GitHub/GitLab/Bitbucket/Gitea integration in Dokploy that enables source-based deployments.
- **Dockier Tenant**: An organization/team in Dockier — maps to one Dokploy Project.
- **Orchestration Pipeline**: The backend job that coordinates multiple Dokploy API calls to provision and deploy.
- **Dokploy AI**: Dokploy's built-in AI integration for diagnosing and fixing deployment failures, already configured on the Dockier Dokploy account.

## Requirements

### Requirement 1: Dokploy API Client

**ID**: REQ-1  
**Description**: Create a typed HTTP client for Dokploy's tRPC-over-HTTP API that handles authentication, retries, and error mapping.

**Acceptance Criteria**:
- Client authenticates via API token (`Authorization: Bearer <token>`)
- Supports all required Dokploy endpoints: project CRUD, server CRUD, application CRUD, git provider config, build config, environment config, deploy trigger, deployment status
- Retries transient failures (5xx, network errors) up to 3 times with exponential backoff
- Maps Dokploy errors to Dockier-friendly error messages
- Base URL configurable via `DOKPLOY_API_URL` env var
- Token configurable via `DOKPLOY_API_TOKEN` env var
- Provides TypeScript types for all request/response shapes

### Requirement 2: Tenant-to-Project Mapping

**ID**: REQ-2  
**Description**: Each Dockier tenant/organization maps to exactly one Dokploy Project. The system must create-or-reuse the Dokploy Project on first deploy.

**Acceptance Criteria**:
- On deploy, look up existing Dokploy Project by tenant ID (stored in DB mapping table)
- If no mapping exists, create a new Dokploy Project named after the tenant/org
- Store `(tenant_id, dokploy_project_id, dokploy_environment_id)` mapping in a new `dokploy_mappings` table
- Reuse the project for all subsequent deploys from the same tenant
- Handle race conditions (two concurrent deploys from the same tenant)

### Requirement 3: Git Credential Synchronization

**ID**: REQ-3  
**Description**: Sync Dockier's stored Git credentials (GitHub/GitLab tokens) to Dokploy so it can clone repositories.

**Acceptance Criteria**:
- When configuring an application, register the git provider in Dokploy using the token from Dockier's git_connections table
- Support GitHub (via `application.saveGithubProvider`) and GitLab (via `application.saveGitlabProvider`)
- For providers without native Dokploy support, use the custom git provider (`application.saveGitProvider`) with SSH key
- Cache the Dokploy git provider ID per Dockier git_connection to avoid re-registration
- Handle token refresh (re-sync if Dokploy reports auth failure)

### Requirement 4: Remote Server Management

**ID**: REQ-4  
**Description**: Create and manage Dokploy Remote Servers — one per Dockier project (application deployment target).

**Acceptance Criteria**:
- Before deploying, provision a VPS (EC2 or Compute Engine) using existing cloud provider credentials
- Register the VPS as a Dokploy Remote Server (IP, SSH port 22, SSH key)
- Run Dokploy's server setup (`server.setup`) to install Docker and build tools
- Validate server readiness (`server.validate`) before proceeding with deploy
- Store `(project_id, dokploy_server_id, server_ip)` in the mapping table
- Reuse existing server for redeployments of the same project
- Handle server provisioning failures gracefully with clear error messages

### Requirement 5: Application Creation & Configuration

**ID**: REQ-5  
**Description**: Create a Dokploy Application for each Dockier project deployment, configure its source, build type, and environment.

**Acceptance Criteria**:
- Create application via `application.create` with name, environmentId, serverId
- Configure git source via the appropriate `saveGithubProvider` / `saveGitlabProvider` / `saveGitProvider` endpoint
- Configure build type via `application.saveBuildType`:
  - Static sites → `buildType: "static"` with `publishDirectory`
  - Railpack-compatible → `buildType: "railpack"`
  - Default → `buildType: "nixpacks"` (Dokploy's default, zero-config)
  - If repo has Dockerfile → `buildType: "dockerfile"`
- Set environment variables via `application.saveEnvironment`
- Store `(deployment_id, dokploy_application_id)` mapping
- Reuse existing application for redeployments (update config if changed)

### Requirement 6: Deploy Orchestration Pipeline

**ID**: REQ-6  
**Description**: Orchestrate the full deploy flow as an async job, coordinating parallel and sequential Dokploy API calls.

**Acceptance Criteria**:
- Pipeline stages:
  1. **Create/reuse Project** (REQ-2)
  2. **Sync Git credentials** (REQ-3) — can run in parallel with step 3
  3. **Provision/reuse Remote Server** (REQ-4) — can run in parallel with step 2
  4. **Create/configure Application** (REQ-5) — depends on steps 1, 2, 3
  5. **Trigger deploy** via `application.deploy`
  6. **Poll/monitor deployment status** until success or failure
  7. **On failure**: invoke Dokploy AI to diagnose and fix, then retry (up to 3 attempts)
- Each stage logs progress to the deployment record (visible in frontend)
- Failed stages produce clear error messages with context
- Entire pipeline is idempotent — safe to retry from any point
- Timeout: 15 minutes max for the full pipeline

### Requirement 7: AI-Assisted Deploy Recovery (Dokploy AI)

**ID**: REQ-7  
**Description**: When a Dokploy deployment fails, use Dokploy's built-in AI to analyze logs and attempt a fix, then retry. Dokploy has its own AI integration already configured on the Dockier Dokploy account — this is preferred over calling OpenAI directly because it is tightly integrated with Dokploy's build system and understands deployment-specific errors better.

**Acceptance Criteria**:
- On deploy failure, invoke Dokploy's AI-assisted fix feature (already configured on the Dokploy instance)
- Do NOT call OpenAI directly — rely on Dokploy's AI which has better context about its own build/deploy errors
- Dokploy AI analyzes the deployment logs and applies fixes (e.g., missing dependencies, wrong build command, port mismatch)
- After Dokploy AI applies a fix, trigger a redeploy
- Retry up to 3 total attempts (original + 2 AI-assisted retries)
- Log each attempt, what Dokploy AI fixed, and the outcome
- If all retries fail, surface the last error and all attempted fixes to the user
- AI recovery is best-effort and non-fatal — if Dokploy AI is unavailable or cannot fix the issue, report the original error

### Requirement 8: Frontend Wizard Simplification

**ID**: REQ-8  
**Description**: Remove the Build step from the DeployWizard. The Deploy step shows real-time orchestration progress.

**Acceptance Criteria**:
- Wizard steps become: Provider → Analysis → Plan → Deploy
- The Deploy step shows a progress timeline of orchestration stages (project setup, server provision, app config, deploying)
- Real-time log streaming during deploy
- On failure + retry, show which fix was attempted and current retry count
- No more Dockerfile preview, build method selector, or tofu script in the wizard
- The backend accepts the same `createDeployment` call but internally routes to the Dokploy pipeline

### Requirement 9: Database Schema

**ID**: REQ-9  
**Description**: Add database tables and columns to support Dokploy integration state.

**Acceptance Criteria**:
- New table `dokploy_tenant_projects`: maps `tenant_id` → `dokploy_project_id`, `dokploy_environment_id`
- New table `dokploy_servers`: maps `project_id` → `dokploy_server_id`, `server_ip`, `server_status`
- New table `dokploy_applications`: maps `deployment_id` → `dokploy_application_id`, `dokploy_server_id`
- Optionally extend `deployments` table with `dokploy_deployment_id` column
- All new tables include `created_at`, `updated_at` timestamps
- Foreign keys to existing `tenants`, `projects`, `deployments` tables

### Requirement 10: Configuration & Environment

**ID**: REQ-10  
**Description**: New environment variables and configuration for the Dokploy integration.

**Acceptance Criteria**:
- `DOKPLOY_API_URL` — base URL of the Dokploy instance (required for deploy)
- `DOKPLOY_API_TOKEN` — API token for authenticating with Dokploy (required for deploy)
- `DOKPLOY_SSH_KEY_ID` — default SSH key ID registered in Dokploy for server access
- Feature flag: `DEPLOY_PROVIDER=dokploy` (vs legacy `DEPLOY_PROVIDER=native` for gradual rollout)
- Add to `.env.example` with placeholder values
- Document in `AGENTS.md` under secrets section

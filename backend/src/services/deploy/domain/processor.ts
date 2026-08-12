import { randomUUID } from "node:crypto";
import { generateTofuPreview, getDefaultRegion } from "./planning/planner.js";
import { resolveDeployTemplate } from "./planning/templates.js";
import { DeployError } from "./providers.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { emitDeploySuccessNotification, emitDeployFailureNotification } from "./pipeline/helpers.js";
import { markProjectInfraLive } from "./lifecycle/project-teardown.js";
import { clearRepoFaviconFromAnalysisCache } from "../../git-integration/domain/cache.js";
import { logger } from "../../../shared/logger.js";
import { deriveAppName, deriveRepoName, stackNameFor } from "../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../lib/provider-credentials.js";
import { logTimestamp, nowIso } from "../../../shared/utils/time.js";
import type { DeploymentRow, InfraMetadata, ServiceEntry } from "../types.js";
import { serializeInfra } from "../types.js";

type CreateDeploymentInput = {
  tenantId: string;
  providerId: string;
  gitConnectionId: string;
  projectId?: string;
  repo: string;
  branch: string;
  tofuScript?: string;
  techStack?: string[];
  primaryLanguage?: string;
  hasDocker?: boolean;
  deployStrategy?: "vps" | "managed" | "static";
  templateId?: string;
  buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
  registryUrl?: string;
  skipPipeline?: boolean;
  useRepoDockerfile?: boolean;
  services?: ServiceEntry[];
  aiAnalysis?: {
    runtime?: string;
    runtimeVersion?: string;
    buildCommand?: string;
    startCommand?: string;
    port?: number;
    summary?: string;
    envVars?: string[];
  };
};

type ProviderSummary = {
  provider: string;
  region: string | null;
};

function formatLogLine(existing: string, line: string): string {
  return `${existing ? `${existing}\n` : ""}[${logTimestamp()}] ${line}`;
}

// ─── Pure Helpers ──────────────────────────────────────────────────

/**
 * Extract a server IP from an EC2 public DNS hostname.
 *
 * e.g. "http://ec2-1-2-3-4.compute-1.amazonaws.com" → "1.2.3.4"
 * Returns empty string if the URL doesn't match the EC2 pattern.
 */
export function deriveServerIpFromUrl(appUrl: string): string {
  const ec2Match = appUrl.match(/ec2-([\d-]+)\./);
  if (ec2Match) return ec2Match[1].replace(/-/g, ".");
  return "";
}

/**
 * Resolve the compute service type from webhook deployTarget or deployment strategy.
 */
function resolveServiceType(
  deployTarget: string | undefined,
  deployStrategy: string,
): InfraMetadata["service"] {
  const serviceMap: Record<string, InfraMetadata["service"]> = { ec2: "ec2", ecs: "ecs" };
  return serviceMap[deployTarget || ""]
    || (deployStrategy === "managed" ? "ecs" : deployStrategy === "static" ? "s3" : "ec2");
}

/** Input for building infrastructure metadata from a webhook success payload. */
export interface BuildInfraParams {
  repo: string;
  deployStrategy: string;
  region: string;
  serverIp: string;
  deployTarget?: string;
  stackName?: string;
  instanceId?: string;
  containerName?: string;
}

/**
 * Construct the InfraMetadata object for a successful deployment.
 *
 * Pure function — no I/O. All async resolution (provider credentials, etc.)
 * must happen before calling this.
 */
export function buildInfraMetadata(params: BuildInfraParams): InfraMetadata {
  const {
    repo,
    deployStrategy,
    region,
    serverIp,
    deployTarget,
    stackName,
    instanceId,
    containerName,
  } = params;

  const repoName = deriveRepoName(repo);
  const service = resolveServiceType(deployTarget, deployStrategy);

  const infra: InfraMetadata = {
    provider: "aws",
    service,
    region: region || "us-east-1",
    containerName: containerName || repoName,
    stackName: stackName || stackNameFor(repoName),
  };

  if (instanceId) infra.instanceId = instanceId;
  if (serverIp) infra.serverIp = serverIp;
  if (service === "ecs") {
    infra.ecsCluster = repoName;
    infra.ecsTaskFamily = repoName;
  }

  return infra;
}

// ─── Deployment Preview & Record ───────────────────────────────────

export function buildDeploymentPreview(input: CreateDeploymentInput, provider: ProviderSummary) {
  const strategy = input.deployStrategy ?? "managed";
  const template = resolveDeployTemplate({
    provider: provider.provider,
    strategy,
    primaryLanguage: input.primaryLanguage ?? "",
    techStack: input.techStack ?? [],
    requestedTemplateId: input.templateId,
  });

  const region = provider.region || getDefaultRegion(provider.provider);
  const appName = deriveAppName(input.repo);
  const preview = generateTofuPreview({
    provider: provider.provider,
    region,
    appName,
    repo: input.repo,
    branch: input.branch,
    techStack: input.techStack ?? [],
    primaryLanguage: input.primaryLanguage ?? "",
    hasDocker: input.hasDocker ?? false,
    deployStrategy: strategy,
    services: input.services ?? template.defaultServices,
    aiAnalysis: input.aiAnalysis,
  });

  return { template, preview, region };
}

export async function createDeploymentRecord(input: CreateDeploymentInput, provider: ProviderSummary): Promise<DeploymentRow> {
  const createdAt = nowIso();
  const id = randomUUID();
  const { template, preview } = buildDeploymentPreview(input, provider);

  const deploymentPayload: DeploymentRow = {
    id,
    organization_id: input.tenantId,
    provider_id: input.providerId,
    git_connection_id: input.gitConnectionId || null,
    project_id: input.projectId ?? "",
    repo: input.repo,
    branch: input.branch,
    status: "pending",
    logs: formatLogLine("", `Deployment queued using template "${template.label}".\n`),
    tofu_script: input.tofuScript?.trim() || preview.script,
    deploy_strategy: input.deployStrategy ?? "managed",
    // Persist the build method so redeploy/rollback can reuse it. Fall back to
    // the resolved template's default when the caller didn't specify one.
    build_method: input.buildMethod ?? template.buildMethod,
    app_url: "",
    commit_hash: "",
    docker_image: "",
    infra: {},
    created_at: createdAt,
    updated_at: createdAt,
  };

  const { error } = await supabaseAdmin.from("deployments").insert(deploymentPayload);
  if (error) throw new DeployError("Failed to create deployment", "internal", error);

  return deploymentPayload;
}

export async function applyDeploymentWebhookUpdate(
  buildId: string,
  payload: {
    status: "deploying" | "success" | "failed";
    appUrl?: string;
    cfnStatus?: string;
    deployTarget?: string;
    stackName?: string;
    region?: string;
    instanceId?: string;
    serverIp?: string;
    containerName?: string;
  },
) {
  const updates: Partial<DeploymentRow> = { updated_at: nowIso() };
  if (payload.status === "success") {
    updates.status = "success";
    updates.app_url = payload.appUrl ?? "";
  } else if (payload.status === "failed") {
    updates.status = "failed";
  } else {
    updates.status = "deploying";
  }

  const { data: current } = await supabaseAdmin
    .from("deployments")
    .select("logs,organization_id,project_id,repo,branch,commit_hash,deploy_strategy,provider_id")
    .eq("id", buildId)
    .maybeSingle();

  // Build infra metadata on success
  if (payload.status === "success") {
    // Resolve region: prefer payload, fall back to provider credentials
    let region = payload.region || "";
    if (!region && current?.provider_id) {
      const provCreds = await getProviderCredentialsSafe(current.provider_id);
      if (provCreds?.region) region = provCreds.region;
    }

    // Resolve serverIp: prefer payload, fall back to EC2 DNS extraction
    const serverIp = payload.serverIp || (payload.appUrl ? deriveServerIpFromUrl(payload.appUrl) : "");

    const infra = buildInfraMetadata({
      repo: current?.repo || "",
      deployStrategy: current?.deploy_strategy || "vps",
      region,
      serverIp,
      deployTarget: payload.deployTarget,
      stackName: payload.stackName,
      instanceId: payload.instanceId,
      containerName: payload.containerName,
    });

    updates.infra = serializeInfra(infra);
  }

  const lines = [payload.status === "success" ? "Deployment succeeded." : payload.status === "failed" ? "Deployment failed." : "Deployment in progress."];
  if (payload.stackName) lines.push(`stack=${payload.stackName}`);
  if (payload.cfnStatus) lines.push(`providerStatus=${payload.cfnStatus}`);
  if (payload.deployTarget) lines.push(`target=${payload.deployTarget}`);
  updates.logs = formatLogLine(current?.logs ?? "", lines.join(" "));

  await supabaseAdmin.from("deployments").update(updates).eq("id", buildId);

  // Infrastructure is now provisioned — mark the project's infra state live.
  if (payload.status === "success") {
    await markProjectInfraLive(current?.project_id);
    if (current?.repo && current?.branch) {
      await clearRepoFaviconFromAnalysisCache(current.repo, current.branch, logger);
    }
  }

  if (payload.status === "success" && current?.organization_id) {
    emitDeploySuccessNotification({
      tenantId: current.organization_id,
      deploymentId: buildId,
      repo: current.repo,
      branch: current.branch,
      commitHash: current.commit_hash,
      appUrl: payload.appUrl,
    });
  }

  if (payload.status === "failed" && current?.organization_id) {
    emitDeployFailureNotification({
      tenantId: current.organization_id,
      deploymentId: buildId,
      repo: current.repo,
      branch: current.branch,
      reason: payload.cfnStatus ? `Infrastructure error: ${payload.cfnStatus}` : undefined,
      commitHash: current.commit_hash,
      category: "infra",
      phase: payload.deployTarget || "cloudformation",
    });
  }
}

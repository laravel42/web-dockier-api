import { randomUUID } from "node:crypto";
import { generateTofuPreview, getDefaultRegion } from "./planner.js";
import { resolveDeployTemplate } from "./templates.js";
import { DeployError } from "./providers.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { emitDeploySuccessNotification, emitDeployFailureNotification } from "./pipeline-helpers.js";
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

function addLogLine(existing: string, line: string): string {
  return `${existing ? `${existing}\n` : ""}[${logTimestamp()}] ${line}`;
}

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
    logs: addLogLine("", `Deployment queued using template "${template.label}".\n`),
    tofu_script: input.tofuScript?.trim() || preview.script,
    deploy_strategy: input.deployStrategy ?? "managed",
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
    .select("logs,organization_id,repo,branch,commit_hash,deploy_strategy,provider_id")
    .eq("id", buildId)
    .maybeSingle();

  // Build infra metadata on success
  if (payload.status === "success") {
    const repoName = deriveRepoName(current?.repo || "");
    const deployStrategy = current?.deploy_strategy || "vps";

    // Derive region from provider if not in payload
    let region = payload.region || "";
    if (!region && current?.provider_id) {
      const provCreds = await getProviderCredentialsSafe(current.provider_id);
      if (provCreds?.region) region = provCreds.region;
    }

    // Derive serverIp from appUrl if not provided (e.g. http://ec2-1-2-3-4.compute-1.amazonaws.com → 1.2.3.4)
    let serverIp = payload.serverIp || "";
    if (!serverIp && payload.appUrl) {
      const ec2Match = payload.appUrl.match(/ec2-([\d-]+)\./);
      if (ec2Match) serverIp = ec2Match[1].replace(/-/g, ".");
    }

    // Determine service from deployTarget or deployStrategy
    const serviceMap: Record<string, InfraMetadata["service"]> = { ec2: "ec2", ecs: "ecs" };
    const service: InfraMetadata["service"] = serviceMap[payload.deployTarget || ""] || (deployStrategy === "managed" ? "ecs" : deployStrategy === "static" ? "s3" : "ec2");

    const containerName = payload.containerName || repoName;
    const infra: InfraMetadata = {
      provider: "aws",
      service,
      region: region || "us-east-1",
      containerName,
      stackName: payload.stackName || stackNameFor(repoName),
    };
    if (payload.instanceId) infra.instanceId = payload.instanceId;
    if (serverIp) infra.serverIp = serverIp;
    if (service === "ecs") {
      infra.ecsCluster = repoName;
      infra.ecsTaskFamily = repoName;
    }

    updates.infra = serializeInfra(infra);
  }

  const lines = [payload.status === "success" ? "Deployment succeeded." : payload.status === "failed" ? "Deployment failed." : "Deployment in progress."];
  if (payload.stackName) lines.push(`stack=${payload.stackName}`);
  if (payload.cfnStatus) lines.push(`providerStatus=${payload.cfnStatus}`);
  if (payload.deployTarget) lines.push(`target=${payload.deployTarget}`);
  updates.logs = addLogLine(current?.logs ?? "", lines.join(" "));

  await supabaseAdmin.from("deployments").update(updates).eq("id", buildId);

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

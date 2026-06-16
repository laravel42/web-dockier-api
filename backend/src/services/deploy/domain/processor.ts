/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { generateTofuPreview, getDefaultRegion, normalizeAppName } from "./planner.js";
import { resolveDeployTemplate } from "./templates.js";
import { DeployError } from "./providers.js";
import { sendNotification } from "../../notifications/domain/notifications.js";
import { logger } from "../../../shared/logger.js";
import type { ServiceEntry } from "../types.js";

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

function nowIso(): string {
  return new Date().toISOString();
}

function deriveAppName(repo: string): string {
  const repoName = repo.split("/").pop() || "app";
  return normalizeAppName(repoName);
}

function addLogLine(existing: string, line: string): string {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  return `${existing ? `${existing}\n` : ""}[${stamp}] ${line}`;
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

export async function createDeploymentRecord(db: any, input: CreateDeploymentInput, provider: ProviderSummary) {
  const createdAt = nowIso();
  const id = randomUUID();
  const { template, preview } = buildDeploymentPreview(input, provider);

  const deploymentPayload = {
    id,
    organization_id: input.tenantId,
    provider_id: input.providerId,
    git_connection_id: input.gitConnectionId,
    project_id: input.projectId ?? "",
    repo: input.repo,
    branch: input.branch,
    status: "pending",
    logs: addLogLine("", `Deployment queued using template "${template.label}".`),
    tofu_script: input.tofuScript?.trim() || preview.script,
    deploy_strategy: input.deployStrategy ?? "managed",
    created_at: createdAt,
    updated_at: createdAt,
  };

  const { error } = await db.from("deployments").insert(deploymentPayload);
  if (error) throw new DeployError("Failed to create deployment", "internal", error);

  return deploymentPayload;
}

export async function applyDeploymentWebhookUpdate(
  db: any,
  buildId: string,
  payload: { status: "deploying" | "success" | "failed"; appUrl?: string; cfnStatus?: string; deployTarget?: string; stackName?: string },
) {
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (payload.status === "success") {
    updates.status = "success";
    updates.app_url = payload.appUrl ?? "";
  } else if (payload.status === "failed") {
    updates.status = "failed";
  } else {
    updates.status = "deploying";
  }

  const { data: current } = await db
    .from("deployments")
    .select("logs,organization_id,repo,branch")
    .eq("id", buildId)
    .maybeSingle();
  const lines = [payload.status === "success" ? "Deployment succeeded." : payload.status === "failed" ? "Deployment failed." : "Deployment in progress."];
  if (payload.stackName) lines.push(`stack=${payload.stackName}`);
  if (payload.cfnStatus) lines.push(`providerStatus=${payload.cfnStatus}`);
  if (payload.deployTarget) lines.push(`target=${payload.deployTarget}`);
  updates.logs = addLogLine(current?.logs ?? "", lines.join(" "));

  await db.from("deployments").update(updates).eq("id", buildId);

  if (payload.status === "success" && current?.organization_id) {
    const appUrl = payload.appUrl ?? "";
    const message = appUrl
      ? `Deployment of ${current.repo} (${current.branch}) succeeded. App URL: ${appUrl}`
      : `Deployment of ${current.repo} (${current.branch}) succeeded.`;
    void sendNotification({
      tenantId: current.organization_id,
      title: "Deployment succeeded",
      message,
    }).catch((err) => {
      logger.error({ err }, `[deploy] Failed to send deploy webhook notification for ${buildId}`);
    });
  }
}

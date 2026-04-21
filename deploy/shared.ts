import { Topic } from "encore.dev/pubsub";
import { secret } from "encore.dev/config";
import { db as _db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

export const db = _db;

export function getDeployCallbackUrl(): string {
  try { return process.env.DeployCallbackUrl || ""; } catch { return ""; }
}

// ─── Provider Registry ───

/**
 * Supported deploy providers.
 * To add a new provider:
 *  1. Add its key here
 *  2. Create a Pulumi template in pulumi-templates/<provider>.ts
 *  3. Register it in pulumi-templates/index.ts (providerBuilders map)
 *  4. Add default region in endpoints/tofu.ts (DEFAULT_REGIONS)
 *  5. Add resource estimation in endpoints/tofu.ts (RESOURCE_ESTIMATORS)
 *  6. Add URL pattern in processor/helpers.ts (URL_GENERATORS)
 *  7. Add frontend style in frontend/src/data/providers.ts
 */
export type DeployProvider = "aws" | "gcp";

export const SUPPORTED_PROVIDERS: readonly DeployProvider[] = ["aws", "gcp"] as const;

export function isSupportedProvider(value: string): value is DeployProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

// ─── Interfaces ───

export interface ServerProvider {
  id: string;
  provider: DeployProvider;
  label: string;
  apiKey: string;
  apiSecret: string;
  region: string;
  createdAt: string;
}

export interface Deployment {
  id: string;
  providerId: string;
  gitConnectionId: string;
  projectId: string;
  repo: string;
  branch: string;
  status: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderResponse {
  id: string;
  provider: string;
  label: string;
  region: string;
  createdAt: string;
}

export interface DeployEvent {
  deploymentId: string;
  appId: string;
  providerId: string;
  gitConnectionId: string;
  projectId: string;
  repo: string;
  branch: string;
  tofuScript: string;
  techStack: string[];
  primaryLanguage: string;
  registryUrl: string;
  deployStrategy: string;
  buildMethod: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
  templateId?: string;
}

export const deployTopic = new Topic<DeployEvent>("deployments", {
  deliveryGuarantee: "at-least-once",
});

// ─── Shared Constants ───

/** Default regions per provider. Used by tofu generation and deploy processor. */
export const DEFAULT_REGIONS: Record<string, string> = {
  aws: "us-east-1",
  gcp: "us-central1",
};

/** Extract the region baked into a Pulumi script by the wizard. */
export function extractRegionFromScript(tofuScript: string): string | null {
  const match = tofuScript.match(/config\.get\("region"\)\s*\|\|\s*"([^"]+)"/);
  return match ? match[1] : null;
}

// ─── Row Mapper ───

/** Database row shape for deployments. */
export interface DeploymentRow {
  id: string;
  provider_id: string;
  git_connection_id: string;
  project_id: string;
  repo: string;
  branch: string;
  status: string;
  logs: string;
  app_url: string;
  commit_hash: string;
  docker_image: string;
  deploy_strategy: string;
  created_at: Date;
  updated_at: Date;
}

/** Map a database row to a Deployment object. */
export function rowToDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    providerId: row.provider_id,
    gitConnectionId: row.git_connection_id,
    projectId: row.project_id || "",
    repo: row.repo,
    branch: row.branch,
    status: row.status as Deployment["status"],
    logs: row.logs,
    appUrl: row.app_url,
    commitHash: row.commit_hash,
    dockerImage: row.docker_image,
    deployStrategy: row.deploy_strategy || "managed",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

import type { TableRow } from "../../shared/supabase/types.js";

export type ServiceEntry = {
  type: string;
  name: string;
  mode: "vps" | "managed";
};

export type ProviderRow = TableRow<"server_providers">;

export type DeploymentRow = TableRow<"deployments">;

export type DeploymentStatus = "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";

export type PostDeployCommand = {
  command: string;
  enabled: boolean;
  continueOnFailure: boolean;
  timeout?: number;
};

export type WebhookPayload = {
  buildId: string;
  status: "deploying" | "success" | "failed";
  appUrl?: string;
  stackName?: string;
  cfnStatus?: string;
  deployTarget?: string;
  codebuildId?: string;
  region?: string;
  instanceId?: string;
  serverIp?: string;
  containerName?: string;
};

// ─── Infrastructure Metadata ───────────────────────────────────────

/**
 * Structured infrastructure metadata stored in the `infra` JSONB column
 * of the deployments table after a successful deploy.
 *
 * Consumers can branch on `provider` + `service` without probing optional fields.
 */
export type InfraMetadata = {
  /** Cloud provider: aws | gcp */
  provider: "aws" | "gcp";
  /** Compute service used for this deployment */
  service: "ec2" | "ecs" | "s3" | "gce" | "cloud-run" | "gcs";
  /** Cloud region (e.g. "us-east-1", "europe-west1") */
  region: string;
  /** Docker container name on the host */
  containerName: string;

  /** CloudFormation / Pulumi stack name */
  stackName?: string;

  // ── EC2 / GCE (VPS) ──
  instanceId?: string;
  serverIp?: string;

  // ── ECS (managed) ──
  ecsCluster?: string;
  ecsTaskFamily?: string;

  // ── Cloud Run (managed) ──
  cloudRunService?: string;

  // ── GCP common ──
  gcpProjectId?: string;
};

/**
 * Map from adapter IDs to the InfraMetadata `service` field.
 */
export const ADAPTER_TO_SERVICE: Record<string, InfraMetadata["service"]> = {
  "aws-ec2": "ec2",
  "aws-ecs": "ecs",
  "aws-s3": "s3",
  "gcp-compute": "gce",
  "gcp-cloudrun": "cloud-run",
  "gcp-storage": "gcs",
};

// ─── Infra Serialization Helpers ───────────────────────────────────

/**
 * Serialize InfraMetadata for storage in the `infra` JSONB column.
 *
 * Localizes the Record<string, unknown> cast to one place so callers
 * pass typed InfraMetadata and never deal with the raw DB type.
 */
export function serializeInfra(infra: InfraMetadata): Record<string, unknown> {
  return infra as unknown as Record<string, unknown>;
}

/**
 * Parse the raw `infra` JSONB column back into typed InfraMetadata.
 *
 * Returns null if the column is empty/null or missing required fields.
 * Callers should fall back to legacy resolution when this returns null.
 */
export function parseInfra(raw: Record<string, unknown> | null | undefined): InfraMetadata | null {
  if (!raw) return null;
  if (!raw.provider || !raw.service || !raw.region || !raw.containerName) return null;
  return raw as unknown as InfraMetadata;
}

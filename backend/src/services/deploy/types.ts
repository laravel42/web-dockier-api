import type { Database } from "../../shared/supabase/types.js";

export type ServiceEntry = {
  type: string;
  name: string;
  mode: "vps" | "managed";
};

export type ProviderRow = Database["public"]["Tables"]["server_providers"]["Row"];

export type DeploymentRow = Database["public"]["Tables"]["deployments"]["Row"];

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
};

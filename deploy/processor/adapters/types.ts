import type { DeployEvent } from "../../shared";
import type { DetectedStack } from "../../repo-analyzer/types";
import type { RunCmdFn } from "../run-cmd";

/**
 * Mutable state bag shared across adapter method calls for a single deployment.
 *
 * Adapters populate fields during earlier pipeline stages (pushImage, injectEnvVars)
 * and consume them in later stages (provisionInfrastructure, runPostDeploy).
 * This replaces the previous pattern of storing state in adapter instance variables
 * or casting ctx to `any`.
 */
export interface AdapterState {
  // ── AWS state (populated by pushImage, consumed by provisionInfrastructure) ──
  awsAccountId?: string;
  awsCredentials?: { accessKeyId: string; secretAccessKey: string };

  // ── GCP state (populated by pushImage, consumed by provision/postDeploy) ──
  gcpAccessToken?: string;
  arImageUri?: string;

  // ── Env vars (populated by injectEnvVars, consumed by provisionInfrastructure) ──
  pendingEnvVars?: Array<{ name: string; value: string }>;

  // ── Pulumi workspace (populated by provisionInfrastructure, consumed by runPostDeploy) ──
  pulumiDir?: string;
  providerEnv?: Record<string, string>;

  // ── VPS deploy key (populated by provisionInfrastructure, consumed by runPostDeploy) ──
  deployKeyPath?: string;

  // ── Actual image name (may differ from the original if cached) ──
  actualImage?: string;
}

/** Context shared across all adapter method calls for a single deployment */
export interface AdapterContext {
  deploymentId: string;
  repoName: string;
  shortId: string;
  region: string;
  repoDir: string;
  workDir: string;
  commitHash: string;
  providerCredentials: { apiKey: string; apiSecret: string };
  event: DeployEvent;
  detectedStack: DetectedStack;
  runCmd: RunCmdFn;
  appendLog: (line: string) => Promise<void>;
  writeFile: (path: string, data: string, enc: string) => Promise<void>;
  readFile: (path: string, enc: string) => Promise<string>;
  rm: (path: string, opts: { recursive: boolean; force: boolean }) => Promise<void>;

  /** Mutable state shared across adapter pipeline stages. */
  state: AdapterState;
}

/** Result from pushImage */
export interface PushImageResult {
  /** Remote image URI after push (e.g., ECR URI or AR URI) */
  remoteImageUri: string;
  /** Whether the build was skipped (cached or static) */
  skipped: boolean;
}

/** Result from provisionInfrastructure */
export interface ProvisionResult {
  /** Application URL extracted from infrastructure outputs */
  appUrl: string;
  /** Server IP (for VPS deploys that need post-deploy steps) */
  serverIp?: string;
  /** Additional outputs from the infrastructure provider */
  outputs: Record<string, string>;
}

/** Context for destroy operations */
export interface DestroyContext {
  deploymentId: string;
  repoName: string;
  appName: string;
  region: string;
  providerCredentials: { apiKey: string; apiSecret: string };
  /** The full tofu_script column value (Pulumi program + optional state after STATE marker) */
  tofuScript: string;
  deployStrategy: string;
  appendLog: (line: string) => Promise<void>;
}

/** Result from a destroy operation */
export interface DestroyResult {
  success: boolean;
  message: string;
  errors: string[];
}

/** The interface all provider adapters implement */
export interface DeployAdapter {
  /** Unique identifier for this adapter (e.g., "gcp-cloudrun") */
  readonly id: string;

  /** Whether this adapter handles the given provider + strategy */
  supports(provider: string, deployStrategy: string): boolean;

  /** Build and push the Docker image to the provider's registry.
   *  Static adapters return { skipped: true }. */
  pushImage(ctx: AdapterContext, localImage: string): Promise<PushImageResult>;

  /** Provision cloud infrastructure (Pulumi or CloudFormation) */
  provisionInfrastructure(ctx: AdapterContext, imageUri: string): Promise<ProvisionResult>;

  /** Inject environment variables into the running application.
   *  Called before provisionInfrastructure for providers that bake env vars
   *  into the infrastructure definition (Pulumi config, CFN parameters). */
  injectEnvVars(ctx: AdapterContext, envVars: Array<{ name: string; value: string }>): Promise<void>;

  /** Run post-deploy steps (SCP image transfer, static file upload, migrations).
   *  Called after provisionInfrastructure completes. */
  runPostDeploy(ctx: AdapterContext, provision: ProvisionResult): Promise<void>;

  /** Destroy cloud resources provisioned by this adapter.
   *  Optional — if not implemented, the destroy orchestrator falls back to generic logic. */
  destroy?(ctx: DestroyContext): Promise<DestroyResult>;
}

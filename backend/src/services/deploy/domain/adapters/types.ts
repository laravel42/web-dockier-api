import type { DetectedStack } from "../../../../lib/repo-analyzer/types.js";
import type { RunCmdFn } from "../run-cmd.js";

/**
 * Deploy event payload — the data needed to trigger a deployment.
 * Replaces the Encore pub/sub DeployEvent type.
 */
export interface DeployEvent {
  deploymentId: string;
  appId: string;
  providerId: string;
  gitConnectionId: string;
  projectId?: string;
  repo: string;
  branch: string;
  tofuScript: string;
  techStack?: string[];
  primaryLanguage?: string;
  hasDocker?: boolean;
  deployStrategy: string;
  templateId?: string;
  buildMethod?: string;
  registryUrl?: string;
  envVars?: Array<{ name: string; value: string }>;
  postDeployCommands?: Array<{ command: string; enabled: boolean; continueOnFailure?: boolean }>;
  services?: Array<{ type: string; name: string; mode: string }>;
}

/**
 * Mutable state bag shared across adapter method calls for a single deployment.
 */
export interface AdapterState {
  // ── AWS state ──
  awsAccountId?: string;
  awsCredentials?: { accessKeyId: string; secretAccessKey: string };

  // ── GCP state ──
  gcpAccessToken?: string;
  arImageUri?: string;

  // ── Env vars ──
  pendingEnvVars?: Array<{ name: string; value: string }>;

  // ── Pulumi workspace ──
  pulumiDir?: string;
  providerEnv?: Record<string, string>;

  // ── VPS deploy key ──
  deployKeyPath?: string;

  // ── Actual image name ──
  actualImage?: string;

  // ── Machine type fallback ──
  machineTypeFallback?: string;
  originalMachineType?: string;
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

  /** Build and push the Docker image to the provider's registry. */
  pushImage(ctx: AdapterContext, localImage: string): Promise<PushImageResult>;

  /** Provision cloud infrastructure (Pulumi or CloudFormation) */
  provisionInfrastructure(ctx: AdapterContext, imageUri: string): Promise<ProvisionResult>;

  /** Inject environment variables into the running application. */
  injectEnvVars(ctx: AdapterContext, envVars: Array<{ name: string; value: string }>): Promise<void>;

  /** Run post-deploy steps (SCP image transfer, static file upload, migrations). */
  runPostDeploy(ctx: AdapterContext, provision: ProvisionResult): Promise<void>;

  /** Destroy cloud resources provisioned by this adapter. */
  destroy?(ctx: DestroyContext): Promise<DestroyResult>;
}

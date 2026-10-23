import type { DetectedStack } from "../../../../lib/repo-analyzer/types.js";
import type { RunCmdFn } from "../run-cmd.js";
import type { ProviderCredential } from "../../../../lib/provider-credentials.js";

/**
 * Deploy event payload — the data needed to trigger a deployment.
 */
export interface DeployEvent {
  deploymentId: string;
  tenantId: string;
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
  /**
   * The stack name this deployment must act on.
   *
   * Resolved once by the pipeline as `priorInfra.stackName || stackNameFor(repoName)`,
   * so a project keeps updating the stack it already owns. Required, not optional:
   * an adapter that re-derives the name from `repoName` silently orphans live
   * infrastructure the moment the name changes (a repo rename is enough), and that
   * failure is invisible — the deploy reports success while the old CDN
   * distribution keeps serving the domain and billing.
   */
  stackName: string;
  /**
   * The static-site bucket a previous deploy of this project created, when there
   * was one. Same reasoning as `stackName`: the name is derived from the repo, so
   * recomputing it after a rename uploads to a brand-new bucket and abandons the
   * one the CDN origin points at. Absent on a first deploy.
   */
  priorStaticBucket?: string;
  shortId: string;
  region: string;
  repoDir: string;
  workDir: string;
  commitHash: string;
  credential: ProviderCredential;
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
  /**
   * The stack to destroy, already resolved from the deployment's persisted
   * `infra.stackName` by `resolveRowStack`. Required so an adapter cannot
   * re-derive it: teardown resolved the right name, and recomputing it from
   * `appName` discarded that answer and deleted a stack that may not exist,
   * leaving the real one — bucket, CDN distribution and all — running.
   */
  stackName: string;
  /** Persisted static-site bucket, when the deployment recorded one. */
  staticBucket?: string;
  region: string;
  credential: ProviderCredential;
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

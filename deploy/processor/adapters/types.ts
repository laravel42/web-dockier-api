import type { DeployEvent } from "../../shared";
import type { DetectedStack } from "../../repo-analyzer/types";
import type { RunCmdFn } from "../run-cmd";

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
}

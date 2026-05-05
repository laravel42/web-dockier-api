import type { DeployAdapter } from "./types";
import { GcpCloudRunAdapter } from "./gcp-cloudrun";
import { GcpComputeAdapter } from "./gcp-compute";
import { GcpStorageAdapter } from "./gcp-storage";
import { AwsEcsAdapter } from "./aws-ecs";
import { AwsEc2Adapter } from "./aws-ec2";
import { AwsS3Adapter } from "./aws-s3";

const adapters: DeployAdapter[] = [
  new GcpCloudRunAdapter(),
  new GcpComputeAdapter(),
  new GcpStorageAdapter(),
  new AwsEcsAdapter(),
  new AwsEc2Adapter(),
  new AwsS3Adapter(),
];

/** Strategy normalization: maps user-facing strategy names to internal names */
const STRATEGY_MAP: Record<string, string> = {
  managed: "managed",
  vps: "vps",
  static: "static",
};

/**
 * Look up the adapter for a given provider + deploy strategy.
 * Throws a descriptive error if no adapter is registered.
 */
export function getAdapter(provider: string, deployStrategy: string): DeployAdapter {
  const strategy = STRATEGY_MAP[deployStrategy] || deployStrategy;
  const adapter = adapters.find((a) => a.supports(provider, strategy));
  if (!adapter) {
    throw new Error(
      `No deploy adapter registered for provider="${provider}" strategy="${strategy}". ` +
        `Supported combinations: ${adapters.map((a) => a.id).join(", ")}`,
    );
  }
  return adapter;
}

/** Register a new adapter (for extensibility) */
export function registerAdapter(adapter: DeployAdapter): void {
  adapters.push(adapter);
}

/** List all registered adapter IDs (for diagnostics) */
export function listAdapterIds(): string[] {
  return adapters.map((a) => a.id);
}

export type {
  DeployAdapter,
  AdapterContext,
  PushImageResult,
  ProvisionResult,
  AdapterResult,
  DetectedStackInfo,
} from "./types";

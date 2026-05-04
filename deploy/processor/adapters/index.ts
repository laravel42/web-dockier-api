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

/**
 * Look up the adapter for a given provider + deploy strategy.
 * Throws a descriptive error if no adapter is registered.
 */
export function getAdapter(provider: string, deployStrategy: string): DeployAdapter {
  const adapter = adapters.find((a) => a.supports(provider, deployStrategy));
  if (!adapter) {
    throw new Error(
      `No deploy adapter registered for provider="${provider}" strategy="${deployStrategy}". ` +
        `Supported combinations: ${adapters.map((a) => a.id).join(", ")}`,
    );
  }
  return adapter;
}

export type {
  DeployAdapter,
  AdapterContext,
  AdapterState,
  PushImageResult,
  ProvisionResult,
  DestroyContext,
  DestroyResult,
} from "./types";

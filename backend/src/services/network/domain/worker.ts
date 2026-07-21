/**
 * Network Config-Apply Handler Registration
 *
 * Registers the network-apply handler with the shared config-apply worker.
 * Called during service startup.
 */

import {
  registerConfigApplyHandler,
  type ConfigApplyJobInput,
} from "../../../shared/workers/config-apply.js";
import { applyNetworkRules } from "./applier.js";

/**
 * Determines if a failure is retryable. Soft failures (no deploy target yet)
 * should not be retried — the config will be applied on next deployment.
 */
function isRetryableFailure(message: string): boolean {
  return !message.includes("will be applied on next deployment");
}

/**
 * Register network-owned job handler with the shared worker.
 * Must be called before the worker starts processing jobs.
 */
export function registerNetworkHandlers(): void {
  registerConfigApplyHandler("network-apply", async (input: ConfigApplyJobInput) => {
    const result = await applyNetworkRules({ tenantId: input.tenantId, projectId: input.projectId });
    if (!result.success && isRetryableFailure(result.message)) {
      throw new Error(`Network apply failed for project ${input.projectId}: ${result.message}`);
    }
  });
}

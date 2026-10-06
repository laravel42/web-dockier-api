/**
 * Domains Config-Apply Handler Registration
 *
 * Registers domain-specific handlers (domain-apply, certificate-issue)
 * with the shared config-apply worker. Called during service startup.
 *
 * Also re-exports enqueue functions for use by the domains routes.
 */

import {
  registerConfigApplyHandler,
  type ConfigApplyJobInput,
} from "../../../shared/workers/config-apply.js";
import { applyDomainConfig, issueCertificate } from "./applier.js";

export {
  registerConfigApplyWorker,
  enqueueDomainApply,
  enqueueNetworkApply,
  enqueueCertificateIssue,
} from "../../../shared/workers/config-apply.js";

export type {
  ConfigApplyJobType,
  ConfigApplyJobInput,
} from "../../../shared/workers/config-apply.js";

/**
 * Determines if a failure is retryable.
 *
 * Prefers the structured flag the static paths now set, because a permanent
 * failure — a missing migration, a denied IAM action — can never succeed on
 * retry, and burning pg-boss attempts on it only delays the real diagnosis.
 *
 * Falls back to the legacy substring rule when the flag is absent. That
 * fallback is load-bearing, not vestigial: the VPS and Dokploy paths never set
 * the flag, and the VPS path signals a soft failure ("no deploy target yet")
 * through exactly this string.
 */
function isRetryableFailure(result: { message: string; retryable?: boolean }): boolean {
  if (result.retryable !== undefined) return result.retryable;
  return !result.message.includes("will be applied on next deployment");
}

/**
 * Register domain-owned job handlers with the shared worker.
 * Must be called before the worker starts processing jobs.
 */
export function registerDomainHandlers(): void {
  registerConfigApplyHandler("domain-apply", async (input: ConfigApplyJobInput) => {
    const result = await applyDomainConfig({ tenantId: input.tenantId, projectId: input.projectId });
    if (!result.success && isRetryableFailure(result)) {
      throw new Error(`Domain apply failed for project ${input.projectId}: ${result.message}`);
    }
  });

  registerConfigApplyHandler("certificate-issue", async (input: ConfigApplyJobInput) => {
    if (!input.certificateId || !input.domainName) {
      throw new Error("certificate-issue job missing certificateId or domainName");
    }
    const result = await issueCertificate({
      tenantId: input.tenantId,
      projectId: input.projectId,
      certificateId: input.certificateId,
      domainName: input.domainName,
    });
    if (!result.success) {
      throw new Error(`Certificate issue failed for ${input.domainName}: ${result.message}`);
    }
  });
}

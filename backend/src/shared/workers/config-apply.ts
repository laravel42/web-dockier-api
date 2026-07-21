/**
 * Config Apply Worker
 *
 * Handles background application of domain and network configuration
 * to deployed servers via pg-boss queue.
 *
 * Replaces the fire-and-forget `void fn().catch(() => {})` pattern
 * with crash-safe, retryable background processing.
 *
 * Job types:
 * - "domain-apply": Re-generates and applies nginx domain config
 * - "network-apply": Re-generates and applies nginx network rules
 * - "certificate-issue": Triggers Let's Encrypt certificate issuance
 *
 * Uses singletonKey to deduplicate rapid successive mutations on the
 * same project — only the last enqueued job runs.
 */

import { createWorker, CONFIG_APPLY_QUEUE } from "../queue.js";
import { applyDomainConfig, issueCertificate } from "../../services/domains/domain/applier.js";
import { applyNetworkRules } from "../../services/network/domain/applier.js";

export type ConfigApplyJobType = "domain-apply" | "network-apply" | "certificate-issue";

export interface ConfigApplyJobInput {
  type: ConfigApplyJobType;
  tenantId: string;
  projectId: string;
  /** Only for certificate-issue jobs */
  certificateId?: string;
  /** Only for certificate-issue jobs */
  domainName?: string;
}

/**
 * Determines if a failure is retryable. Soft failures (no deploy target yet)
 * should not be retried — the config will be applied on next deployment.
 */
function isRetryableFailure(message: string): boolean {
  return !message.includes("will be applied on next deployment");
}

async function processConfigApplyJob(input: ConfigApplyJobInput): Promise<void> {
  const { type, tenantId, projectId } = input;

  switch (type) {
    case "domain-apply": {
      const result = await applyDomainConfig({ tenantId, projectId });
      if (!result.success && isRetryableFailure(result.message)) {
        throw new Error(`Domain apply failed for project ${projectId}: ${result.message}`);
      }
      break;
    }

    case "network-apply": {
      const result = await applyNetworkRules({ tenantId, projectId });
      if (!result.success && isRetryableFailure(result.message)) {
        throw new Error(`Network apply failed for project ${projectId}: ${result.message}`);
      }
      break;
    }

    case "certificate-issue": {
      if (!input.certificateId || !input.domainName) {
        throw new Error("certificate-issue job missing certificateId or domainName");
      }
      const result = await issueCertificate({
        tenantId,
        projectId,
        certificateId: input.certificateId,
        domainName: input.domainName,
      });
      if (!result.success) {
        throw new Error(`Certificate issue failed for ${input.domainName}: ${result.message}`);
      }
      break;
    }

    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

// ─── Worker Instance ───────────────────────────────────────────────

const configApplyWorker = createWorker<ConfigApplyJobInput>(
  CONFIG_APPLY_QUEUE,
  processConfigApplyJob,
  {
    retryLimit: 3,
    expireInSeconds: 300, // 5 min — config applies should be fast
    pollingIntervalSeconds: 3,
  },
);

export const registerConfigApplyWorker = configApplyWorker.register;

/**
 * Enqueue a domain config apply job.
 *
 * Uses a singletonKey per project+type to deduplicate rapid mutations.
 * If multiple domain changes happen within the polling interval, only
 * one apply runs (with the latest state from the DB).
 */
export async function enqueueDomainApply(tenantId: string, projectId: string): Promise<void> {
  await configApplyWorker.enqueue(
    { type: "domain-apply", tenantId, projectId },
    `domain-apply:${projectId}`,
  );
}

/**
 * Enqueue a network rules apply job.
 */
export async function enqueueNetworkApply(tenantId: string, projectId: string): Promise<void> {
  await configApplyWorker.enqueue(
    { type: "network-apply", tenantId, projectId },
    `network-apply:${projectId}`,
  );
}

/**
 * Enqueue a certificate issuance job.
 */
export async function enqueueCertificateIssue(params: {
  tenantId: string;
  projectId: string;
  certificateId: string;
  domainName: string;
}): Promise<void> {
  await configApplyWorker.enqueue(
    { type: "certificate-issue", ...params },
    `cert-issue:${params.certificateId}`,
  );
}

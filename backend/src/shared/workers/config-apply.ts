/**
 * Config Apply Worker
 *
 * Handles background application of domain and network configuration
 * to deployed servers via pg-boss queue.
 *
 * Uses a Registry Pattern so that service-specific handlers are registered
 * at startup — keeping this shared module decoupled from service logic.
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

export type ConfigApplyJobType = "domain-apply" | "network-apply" | "certificate-issue";

export interface ConfigApplyJobInput {
  type: ConfigApplyJobType;
  tenantId: string;
  projectId: string;
  /** Only for certificate-issue jobs */
  certificateId?: string;
  /** Only for certificate-issue jobs */
  domainName?: string;
  /** Request ID from the originating HTTP request — used for log correlation. */
  correlationId?: string;
}

// ─── Handler Registry ──────────────────────────────────────────────

export type ConfigApplyHandler = (input: ConfigApplyJobInput) => Promise<void>;

const registry = new Map<ConfigApplyJobType, ConfigApplyHandler>();

/**
 * Register a handler for a specific config-apply job type.
 * Call this during service initialization (before the worker starts processing).
 */
export function registerConfigApplyHandler(type: ConfigApplyJobType, handler: ConfigApplyHandler): void {
  registry.set(type, handler);
}

// ─── Job Processor ─────────────────────────────────────────────────

async function processConfigApplyJob(input: ConfigApplyJobInput): Promise<void> {
  const { type } = input;
  const handler = registry.get(type);
  if (!handler) {
    throw new Error(`No handler registered for job type: ${type}`);
  }
  await handler(input);
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
export async function enqueueDomainApply(tenantId: string, projectId: string, correlationId?: string): Promise<void> {
  await configApplyWorker.enqueue(
    { type: "domain-apply", tenantId, projectId, correlationId },
    `domain-apply:${projectId}`,
  );
}

/**
 * Enqueue a network rules apply job.
 */
export async function enqueueNetworkApply(tenantId: string, projectId: string, correlationId?: string): Promise<void> {
  await configApplyWorker.enqueue(
    { type: "network-apply", tenantId, projectId, correlationId },
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
  correlationId?: string;
}): Promise<void> {
  await configApplyWorker.enqueue(
    { type: "certificate-issue", ...params },
    `cert-issue:${params.certificateId}`,
  );
}

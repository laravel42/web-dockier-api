/**
 * Re-exports from the shared config-apply worker.
 *
 * The config-apply worker was moved to shared/workers/config-apply.ts
 * because it serves both the domains and network services.
 * This file preserves backward compatibility for existing imports.
 */

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

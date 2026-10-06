/**
 * The job layer's retry decision.
 *
 * pg-boss retries by catching a thrown error, so "do not retry" means "do not
 * throw". A permanent failure — a missing migration, a denied IAM action — must
 * not burn attempts: each one re-runs the same provider calls and delays the
 * real diagnosis by the retry backoff.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type Handler = (input: { tenantId: string; projectId: string }) => Promise<void>;

const handlers = new Map<string, Handler>();

vi.mock("../../../../shared/workers/config-apply.js", () => ({
  registerConfigApplyHandler: (type: string, fn: Handler) => {
    handlers.set(type, fn);
  },
  registerConfigApplyWorker: vi.fn(),
  enqueueDomainApply: vi.fn(),
  enqueueNetworkApply: vi.fn(),
  enqueueCertificateIssue: vi.fn(),
}));

const applyDomainConfig = vi.fn();
const issueCertificate = vi.fn();

vi.mock("../applier.js", () => ({
  applyDomainConfig: (...args: unknown[]) => applyDomainConfig(...args),
  issueCertificate: (...args: unknown[]) => issueCertificate(...args),
}));

const { registerDomainHandlers } = await import("../worker.js");

const input = { tenantId: "t1", projectId: "proj-1" };

beforeEach(() => {
  handlers.clear();
  applyDomainConfig.mockReset();
  registerDomainHandlers();
});

describe("domain-apply retry decision", () => {
  it("does not throw for a structurally permanent failure", async () => {
    // The incident's schema-drift case. Retrying cannot help, so pg-boss must
    // not be handed an error to retry on.
    applyDomainConfig.mockResolvedValue({
      success: false,
      retryable: false,
      message:
        "A database change that custom domains depend on has not been applied to this environment.",
    });

    await expect(handlers.get("domain-apply")!(input)).resolves.toBeUndefined();
  });

  it("throws for a structurally transient failure so the job is retried", async () => {
    applyDomainConfig.mockResolvedValue({
      success: false,
      retryable: true,
      message: "The site is already being updated. This will be retried shortly.",
    });

    await expect(handlers.get("domain-apply")!(input)).rejects.toThrow(/Domain apply failed/);
  });

  it("keeps the legacy substring rule when no flag is present", async () => {
    // The VPS path never sets `retryable` and signals a soft failure through
    // exactly this string. The fallback is load-bearing, not vestigial.
    applyDomainConfig.mockResolvedValue({
      success: false,
      message: "No deploy target yet — the config will be applied on next deployment.",
    });

    await expect(handlers.get("domain-apply")!(input)).resolves.toBeUndefined();
  });

  it("throws for an unflagged failure that is not the soft-failure string", async () => {
    applyDomainConfig.mockResolvedValue({ success: false, message: "nginx reload failed" });

    await expect(handlers.get("domain-apply")!(input)).rejects.toThrow(/nginx reload failed/);
  });

  it("does nothing on success", async () => {
    applyDomainConfig.mockResolvedValue({ success: true, message: "applied" });

    await expect(handlers.get("domain-apply")!(input)).resolves.toBeUndefined();
  });

  it("prefers the flag over the legacy string when both point opposite ways", async () => {
    // A static failure that happens to contain the VPS phrase must still be
    // governed by the classifier, not by a substring coincidence.
    applyDomainConfig.mockResolvedValue({
      success: false,
      retryable: true,
      message: "something that will be applied on next deployment",
    });

    await expect(handlers.get("domain-apply")!(input)).rejects.toThrow(/Domain apply failed/);
  });
});

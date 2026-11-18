/**
 * Deploys in the project's activity. The event types existed and the UI had labels
 * for them, but nothing recorded them, so Activity showed no deploys at all.
 *
 * - Started: in createAndEnqueueDeployment, which every trigger goes through.
 * - Completed / failed: in the notification helpers every pipeline calls at the end.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const record = vi.hoisted(() => vi.fn());
vi.mock("../../../../shared/service-clients/activity.js", () => ({ safeRecordActivity: record }));

vi.mock("../../../../shared/config.js", () => ({ env: { DEPLOY_PROVIDER: "dokploy", DOKPLOY_DEFAULT_SERVER_IP: "1.2.3.4" } }));
vi.mock("../providers.js", () => ({
  DeployError: class extends Error {},
  getProviderForTenant: vi.fn(async () => ({ provider: "aws", region: "us-east-1" })),
}));
vi.mock("../processor.js", () => ({ createDeploymentRecord: vi.fn(async () => ({ id: "dep-1", tofu_script: "", deploy_strategy: "vps" })) }));
vi.mock("../worker.js", () => ({ enqueueDeployment: vi.fn(async () => {}) }));
vi.mock("../mappers.js", () => ({ rowToDeployment: (r: { id: string }) => ({ id: r.id }) }));
vi.mock("../../../../lib/provider-credentials.js", () => ({ getProviderCredentialsSafe: vi.fn(), hasUsableCredential: vi.fn() }));
vi.mock("../../../../shared/events.js", () => ({ emit: vi.fn() }));

/** The deployment row the helpers read the project from. */
const row = vi.hoisted(() => ({ data: { project_id: "proj-1" } as { project_id: string | null } | null }));
vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row.data, error: null }) };
      return chain;
    },
  },
}));

const { createAndEnqueueDeployment } = await import("../deployments.js");
const { emitDeploySuccessNotification, emitDeployFailureNotification } = await import("../pipeline/helpers.js");

const base = { tenantId: "org-1", providerId: "prov-1", gitConnectionId: "conn-1", repo: "acme/app", branch: "main" };

beforeEach(() => {
  record.mockReset();
  row.data = { project_id: "proj-1" };
});

describe("deploy activity", () => {
  it("records who started a deploy of the project", async () => {
    await createAndEnqueueDeployment({ ...base, projectId: "proj-1", userId: "u1" });
    expect(record).toHaveBeenCalledWith({
      tenantId: "org-1", projectId: "proj-1", userId: "u1", eventType: "deploy_started",
      description: "Deployment of acme/app (main) started", metadata: { deployId: "dep-1" },
    });
  });

  it("records nothing for a record-only deploy or one with no project", async () => {
    await createAndEnqueueDeployment({ ...base, projectId: "proj-1", skipPipeline: true });
    await createAndEnqueueDeployment({ ...base });
    expect(record).not.toHaveBeenCalled();
  });

  it("records a completed deploy on the deployment's project", async () => {
    emitDeploySuccessNotification({ tenantId: "org-1", deploymentId: "dep-1", repo: "acme/app", branch: "main" });
    await vi.waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "proj-1", eventType: "deploy_completed", metadata: { deployId: "dep-1" },
    })));
  });

  it("records a failed deploy with a short title, not the whole reason", async () => {
    emitDeployFailureNotification({
      tenantId: "org-1", deploymentId: "dep-1", repo: "acme/app", branch: "main",
      reason: "npm ERR! a very long build log line", category: "build",
    });
    await vi.waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "deploy_failed", description: "Build failed for acme/app (main)",
    })));
  });

  it("skips a deploy that has no project", async () => {
    row.data = { project_id: null };
    emitDeploySuccessNotification({ tenantId: "org-1", deploymentId: "dep-1", repo: "acme/app", branch: "main" });
    await new Promise((r) => setTimeout(r, 20));
    expect(record).not.toHaveBeenCalled();
  });
});

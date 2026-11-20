/**
 * A deployment's projectId and gitConnectionId come from the request body. Only
 * the provider used to be checked, so another tenant's project id made the
 * pipeline reconfigure THEIR Dokploy app with this repo, and another tenant's
 * connection id cloned with their token.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../../shared/config.js", () => ({ env: { DEPLOY_PROVIDER: "dokploy", DOKPLOY_DEFAULT_SERVER_IP: "1.2.3.4" } }));
vi.mock("../providers.js", () => ({
  DeployError: class DeployError extends Error {
    constructor(message: string, public code: string) { super(message); }
  },
  getProviderForTenant: vi.fn(async () => ({ provider: "aws", region: "us-east-1" })),
}));
const createRecord = vi.hoisted(() => vi.fn(async () => ({ id: "dep-1", tofu_script: "", deploy_strategy: "vps" })));
vi.mock("../processor.js", () => ({ createDeploymentRecord: createRecord }));
vi.mock("../worker.js", () => ({ enqueueDeployment: vi.fn(async () => {}) }));
vi.mock("../mappers.js", () => ({ rowToDeployment: (r: { id: string }) => ({ id: r.id }) }));
vi.mock("../../../../lib/provider-credentials.js", () => ({ getProviderCredentialsSafe: vi.fn(), hasUsableCredential: vi.fn() }));
vi.mock("../../../../shared/service-clients/activity.js", () => ({ safeRecordActivity: vi.fn() }));

/** Rows that exist, by table: [id, organization_id]. A lookup matches only on both. */
const rows: Record<string, Array<[string, string]>> = {
  projects: [["proj-mine", "org-1"], ["proj-theirs", "org-2"]],
  git_connections: [["conn-mine", "org-1"], ["conn-theirs", "org-2"]],
};
vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (col: string, value: string) => { filters[col] = value; return chain; },
        maybeSingle: async () => ({
          data: (rows[table] ?? []).some(([id, org]) => id === filters.id && org === filters.organization_id) ? { id: filters.id } : null,
          error: null,
        }),
      };
      return chain;
    },
  },
}));

const { createAndEnqueueDeployment } = await import("../deployments.js");
const base = { tenantId: "org-1", providerId: "prov-1", repo: "acme/app", branch: "main" };

beforeEach(() => createRecord.mockClear());

describe("createAndEnqueueDeployment ownership", () => {
  it("deploys the tenant's own project with its own connection", async () => {
    await createAndEnqueueDeployment({ ...base, projectId: "proj-mine", gitConnectionId: "conn-mine" });
    expect(createRecord).toHaveBeenCalledOnce();
  });

  it("refuses another tenant's project before creating anything", async () => {
    await expect(createAndEnqueueDeployment({ ...base, projectId: "proj-theirs", gitConnectionId: "conn-mine" }))
      .rejects.toMatchObject({ code: "not_found", message: "Project not found" });
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("refuses another tenant's git connection", async () => {
    await expect(createAndEnqueueDeployment({ ...base, projectId: "proj-mine", gitConnectionId: "conn-theirs" }))
      .rejects.toMatchObject({ code: "not_found", message: "Git connection not found" });
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("allows a deploy with no project and no connection (a public template)", async () => {
    await createAndEnqueueDeployment({ ...base, gitConnectionId: "" });
    expect(createRecord).toHaveBeenCalledOnce();
  });
});

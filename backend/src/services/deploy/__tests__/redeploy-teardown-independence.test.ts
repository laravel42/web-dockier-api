/**
 * Redeploy/rollback teardown-independence — design Property 7.
 *
 * For any deployment record (including legacy `destroyed`), redeploy and
 * rollback resolve a valid deploy config and enqueue a new deployment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

const TENANT = "a1b2c3d4-1234-4abc-8def-111111111111";

// Supabase mock: getSourceDeployment does .from("deployments").select("*").eq().single();
// rollback also does .from("deployments").update().eq() for the commit pin.
let sourceRow: Record<string, unknown> | null = null;
const updateSpy = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: sourceRow, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        updateSpy(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

const mockCreateAndEnqueue = vi.fn();
vi.mock("../domain/deployments.js", () => ({
  createAndEnqueueDeployment: (...args: unknown[]) => mockCreateAndEnqueue(...args),
}));

const mockGetCreds = vi.fn();
vi.mock("../../../lib/provider-credentials.js", () => ({
  getProviderCredentialsSafe: (...args: unknown[]) => mockGetCreds(...args),
}));

const { redeployLatest, rollbackToDeployment } = await import("../domain/redeploy.js");

function makeSource(status: string, commitHash = "abc123", buildMethod: string | null = null) {
  return {
    id: "dep-1",
    organization_id: TENANT,
    provider_id: "prov-1",
    git_connection_id: "conn-1",
    project_id: "proj-1",
    repo: "acme/my-app",
    build_method: buildMethod,
    branch: "main",
    deploy_strategy: "managed",
    commit_hash: commitHash,
    status,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAndEnqueue.mockResolvedValue({ id: "new-dep", repo: "acme/my-app", branch: "main" });
});

describe("Property 7: redeploy is teardown-independent", () => {
  // Includes "destroyed" — previously blocked, now allowed.
  const statuses = ["success", "failed", "cancelled", "destroyed"];

  for (const status of statuses) {
    it(`redeploys from a ${status} deployment`, async () => {
      sourceRow = makeSource(status);

      const result = await redeployLatest("dep-1", TENANT);

      expect(mockCreateAndEnqueue).toHaveBeenCalledOnce();
      expect(mockCreateAndEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ repo: "acme/my-app", branch: "main", deployStrategy: "managed" }),
      );
      expect(result.id).toBe("new-dep");
    });

    it(`rolls back from a ${status} deployment (with commit hash)`, async () => {
      sourceRow = makeSource(status, "deadbeef");

      const result = await rollbackToDeployment("dep-1", TENANT);

      expect(mockCreateAndEnqueue).toHaveBeenCalledOnce();
      // Pins the source commit onto the new deployment.
      expect(updateSpy).toHaveBeenCalledWith({ commit_hash: "deadbeef" });
      expect(result.commitHash).toBe("deadbeef");
    });
  }
});

describe("rollback still requires a commit hash", () => {
  it("rejects rollback when the source has no commit hash", async () => {
    sourceRow = makeSource("failed", "");
    await expect(rollbackToDeployment("dep-1", TENANT)).rejects.toThrow("no recorded commit hash");
    expect(mockCreateAndEnqueue).not.toHaveBeenCalled();
  });
});

describe("build method preservation", () => {
  it("reuses the persisted build_method on redeploy", async () => {
    sourceRow = makeSource("success", "abc123", "codebuild");

    await redeployLatest("dep-1", TENANT);

    expect(mockCreateAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ buildMethod: "codebuild" }),
    );
    // build_method was present → no provider lookup needed
    expect(mockGetCreds).not.toHaveBeenCalled();
  });

  it("reuses the persisted build_method on rollback", async () => {
    sourceRow = makeSource("success", "deadbeef", "nixpacks");

    await rollbackToDeployment("dep-1", TENANT);

    expect(mockCreateAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ buildMethod: "nixpacks" }),
    );
  });

  it("falls back to codebuild for a legacy AWS deployment without a stored build_method", async () => {
    sourceRow = makeSource("success", "abc123", null);
    mockGetCreds.mockResolvedValue({ provider: "aws", region: "us-east-1", apiKey: "k", apiSecret: "s" });

    await redeployLatest("dep-1", TENANT);

    expect(mockCreateAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ buildMethod: "codebuild" }),
    );
  });

  it("leaves build method unset for a legacy non-AWS deployment (pipeline default)", async () => {
    sourceRow = makeSource("success", "abc123", null);
    mockGetCreds.mockResolvedValue({ provider: "gcp", region: "us-central1", apiKey: "k", apiSecret: "s" });

    await redeployLatest("dep-1", TENANT);

    expect(mockCreateAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ buildMethod: undefined }),
    );
  });
});

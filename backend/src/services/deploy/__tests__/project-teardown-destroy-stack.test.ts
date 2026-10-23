/**
 * destroyStack tests — design Property 1 (teardown never mutates deployment status).
 *
 * destroyStack must invoke the provider adapter's destroy() and MUST NOT write
 * to the deployments table (in particular, never set status to "destroyed").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";
import type { ResolvedStack } from "../domain/lifecycle/project-teardown.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

// Track every supabase table access so we can assert no deployment writes occur.
const fromCalls: string[] = [];
const updateSpy = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      fromCalls.push(table);
      return {
        update: (...args: unknown[]) => {
          updateSpy(table, ...args);
          return { eq: vi.fn().mockResolvedValue({ error: null }) };
        },
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    },
  },
}));

const mockGetCreds = vi.fn();
vi.mock("../../../lib/provider-credentials.js", () => ({
  getProviderCredentialsSafe: (...args: unknown[]) => mockGetCreds(...args),
  toAwsCredentials: (credential: { accessKeyId: string; secretAccessKey: string }, region?: string) => {
    const base = { accessKeyId: credential.accessKeyId, secretAccessKey: credential.secretAccessKey };
    return region === undefined ? base : { ...base, region };
  },
  toGcpServiceAccountKey: (credential: { serviceAccountKey: string }) => credential.serviceAccountKey,
}));

const mockDestroy = vi.fn();
const mockGetAdapter = vi.fn();
vi.mock("../domain/adapters/index.js", () => ({
  getAdapter: (...args: unknown[]) => mockGetAdapter(...args),
}));

const { destroyStack } = await import("../domain/lifecycle/project-teardown.js");

function stack(overrides: Partial<ResolvedStack> = {}): ResolvedStack {
  return {
    provider: "aws",
    deployStrategy: "managed",
    stackName: "image-builder-app-my-app",
    region: "us-east-1",
    providerId: "prov-1",
    repo: "acme/my-app",
    tofuScript: "",
    sampleDeploymentId: "dep-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fromCalls.length = 0;
  mockGetCreds.mockResolvedValue({ provider: "aws", region: "us-east-1", credential: { kind: "aws", accessKeyId: "k", secretAccessKey: "s" } });
  mockGetAdapter.mockReturnValue({ id: "aws-ecs", destroy: mockDestroy });
});

describe("destroyStack — Property 1: never mutates deployment status", () => {
  it("does not write to the deployments table on success", async () => {
    mockDestroy.mockResolvedValue({ success: true, message: "done", errors: [] });

    const result = await destroyStack(stack());

    expect(result.success).toBe(true);
    expect(mockDestroy).toHaveBeenCalledOnce();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(fromCalls).not.toContain("deployments");
  });

  it("does not write to the deployments table on adapter failure", async () => {
    mockDestroy.mockResolvedValue({ success: false, message: "partial", errors: ["x failed"] });

    const result = await destroyStack(stack());

    expect(result.success).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(fromCalls).not.toContain("deployments");
  });

  it("does not write to the deployments table when the adapter throws", async () => {
    mockDestroy.mockRejectedValue(new Error("boom"));

    const result = await destroyStack(stack());

    expect(result.success).toBe(false);
    expect(result.message).toContain("boom");
    expect(updateSpy).not.toHaveBeenCalled();
    expect(fromCalls).not.toContain("deployments");
  });
});

describe("destroyStack — failure modes", () => {
  it("fails cleanly when credentials are missing", async () => {
    mockGetCreds.mockResolvedValue(null);
    const result = await destroyStack(stack());
    expect(result.success).toBe(false);
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it("fails cleanly when the adapter has no destroy()", async () => {
    mockGetAdapter.mockReturnValue({ id: "aws-ecs" }); // no destroy
    const result = await destroyStack(stack());
    expect(result.success).toBe(false);
    expect(result.message).toContain("does not support destroy");
  });

  it("fails cleanly when no adapter is registered", async () => {
    mockGetAdapter.mockImplementation(() => { throw new Error("No deploy adapter registered"); });
    const result = await destroyStack(stack());
    expect(result.success).toBe(false);
    expect(result.message).toContain("No deploy adapter registered");
  });
});

// ─── Resolved identity passthrough ─────────────────────────────────
//
// resolveRowStack prefers the deployment's persisted infra.stackName, which is
// the only value that still matches reality once the repo has been renamed —
// stackNameFor() is a pure function of the repo name. destroyStack must hand
// that resolved name to the adapter instead of letting it re-derive one: the
// adapter would then delete a stack that does not exist and report success,
// while the real stack kept its bucket and CDN distribution running and billing.

describe("destroyStack — hands the resolved identity to the adapter", () => {
  it("passes the resolved stackName through, not one derived from the repo", async () => {
    mockDestroy.mockResolvedValue({ success: true, message: "ok", errors: [] });

    // Persisted name and current repo disagree, as after a repo rename.
    await destroyStack(stack({ stackName: "image-builder-app-old-name", repo: "acme/renamed-app" }));

    const ctx = mockDestroy.mock.calls[0][0];
    expect(ctx.stackName).toBe("image-builder-app-old-name");
    expect(ctx.stackName).not.toContain("renamed-app");
  });

  it("passes the persisted static bucket through when the deployment recorded one", async () => {
    mockDestroy.mockResolvedValue({ success: true, message: "ok", errors: [] });

    await destroyStack(stack({ deployStrategy: "static", staticBucket: "dockier-123-old-name-static" }));

    expect(mockDestroy.mock.calls[0][0].staticBucket).toBe("dockier-123-old-name-static");
  });

  it("leaves staticBucket undefined when the deployment recorded none, so the adapter derives it", async () => {
    mockDestroy.mockResolvedValue({ success: true, message: "ok", errors: [] });

    await destroyStack(stack({ deployStrategy: "static" }));

    expect(mockDestroy.mock.calls[0][0].staticBucket).toBeUndefined();
  });
});

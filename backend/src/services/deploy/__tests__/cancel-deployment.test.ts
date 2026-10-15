/**
 * cancelDeployment — local cancel + best-effort remote build cancel.
 *
 * The bug these tests pin: cancelling a deployment flipped the Dockier row to
 * "cancelled" but never told Dokploy, so the build kept running on the server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";

// ─── Mocks ─────────────────────────────────────────────────────────

const envOverrides: Record<string, unknown> = { DEPLOY_PROVIDER: "dokploy" };
vi.mock("../../../shared/config.js", () => ({
  env: new Proxy({} as Record<string, unknown>, {
    get: (_t, key: string) => ({ ...createTestEnv(), ...envOverrides })[key],
  }),
}));

const TENANT_ID = "tenant-1";
const DEPLOYMENT_ID = "deploy-1";

/**
 * Rows the `.single()` reads return, in order: the initial fetch, then (only
 * when the optimistic update matched nothing) the re-fetch of the live row.
 */
let singleRows: Array<Record<string, unknown> | null> = [];
/** Result of the cancellable-status update; null means the race was lost. */
let updatedRow: Record<string, unknown> | null = null;
const logLines: string[] = [];

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        select: () => chain,
        update: () => chain,
        eq: () => chain,
        in: () => chain,
        single: async () => ({ data: singleRows.length > 1 ? singleRows.shift() : singleRows[0], error: null }),
        maybeSingle: async () => ({ data: updatedRow, error: null }),
      };
      return chain;
    },
    rpc: async (_fn: string, args: { p_line: string }) => {
      logLines.push(args.p_line);
      return { error: null };
    },
  },
}));

const mockGetApplication = vi.fn();
vi.mock("../domain/dokploy/mappings.js", () => ({
  getApplication: (...args: unknown[]) => mockGetApplication(...args),
}));

const mockCancelDeployment = vi.fn();
const mockCreateClient = vi.fn((_config?: { timeout?: number; maxRetries?: number }) => ({
  cancelDeployment: mockCancelDeployment,
}));
vi.mock("../domain/dokploy/client.js", () => ({
  createDokployClient: (config?: { timeout?: number; maxRetries?: number }) => mockCreateClient(config),
}));

const { cancelDeployment } = await import("../domain/deployments.js");

// ─── Fixtures ──────────────────────────────────────────────────────

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPLOYMENT_ID,
    organization_id: TENANT_ID,
    project_id: "project-1",
    status: "building",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logLines.length = 0;
  envOverrides.DEPLOY_PROVIDER = "dokploy";
  singleRows = [row()];
  updatedRow = row({ status: "cancelled" });
  mockGetApplication.mockResolvedValue({ dokployApplicationId: "app-1" });
  mockCancelDeployment.mockResolvedValue(undefined);
});

// ─── Tests ─────────────────────────────────────────────────────────

describe("cancelDeployment", () => {
  it("asks Dokploy to stop the build for the mapped application", async () => {
    const result = await cancelDeployment(DEPLOYMENT_ID, TENANT_ID);

    expect(mockGetApplication).toHaveBeenCalledWith("project-1");
    expect(mockCancelDeployment).toHaveBeenCalledTimes(1);
    expect(mockCancelDeployment).toHaveBeenCalledWith("app-1");
    expect(result.status).toBe("cancelled");
    expect(logLines.some((l) => /stop the running build/i.test(l))).toBe(true);
  });

  it("bounds the remote call so an unreachable Dokploy cannot hang the Cancel request", async () => {
    await cancelDeployment(DEPLOYMENT_ID, TENANT_ID);

    // The default client is 4 attempts × 30s (~127s) — far too long to sit on
    // the user's Cancel request, which is exactly when Dokploy is often down.
    const [config] = mockCreateClient.mock.calls[0];
    expect(config?.maxRetries).toBe(0);
    expect(config?.timeout).toBeLessThanOrEqual(10_000);
  });

  it("falls back to the deployment id as the mapping key when there is no project", async () => {
    singleRows = [row({ project_id: null })];

    await cancelDeployment(DEPLOYMENT_ID, TENANT_ID);

    expect(mockGetApplication).toHaveBeenCalledWith(DEPLOYMENT_ID);
    expect(mockCancelDeployment).toHaveBeenCalledWith("app-1");
  });

  it("cancels locally only on the native provider", async () => {
    envOverrides.DEPLOY_PROVIDER = "native";

    const result = await cancelDeployment(DEPLOYMENT_ID, TENANT_ID);

    expect(result.status).toBe("cancelled");
    expect(mockGetApplication).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("cancels locally when no Dokploy application was configured yet", async () => {
    mockGetApplication.mockResolvedValue(null);

    const result = await cancelDeployment(DEPLOYMENT_ID, TENANT_ID);

    expect(result.status).toBe("cancelled");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("still cancels and warns the user when the Dokploy call fails", async () => {
    mockCancelDeployment.mockRejectedValue(new Error("connect ETIMEDOUT"));

    const result = await cancelDeployment(DEPLOYMENT_ID, TENANT_ID);

    expect(result.status).toBe("cancelled");
    // The user is told the remote build may still be running.
    expect(logLines.some((l) => /may still be running/i.test(l))).toBe(true);
  });

  it("makes no remote call when the optimistic-locking race is lost", async () => {
    updatedRow = null; // update matched nothing — status moved on
    singleRows = [row(), row({ status: "success" })]; // initial read, then re-fetch

    const result = await cancelDeployment(DEPLOYMENT_ID, TENANT_ID);

    expect(result.status).toBe("success");
    expect(mockCancelDeployment).not.toHaveBeenCalled();
  });

  it("rejects a non-cancellable status without touching Dokploy", async () => {
    singleRows = [row({ status: "success" })];

    await expect(cancelDeployment(DEPLOYMENT_ID, TENANT_ID)).rejects.toThrow(/Cannot cancel/);
    expect(mockCancelDeployment).not.toHaveBeenCalled();
  });
});

/**
 * GET /code-analysis/findings/open-total feeds the dashboard's Findings KPI.
 * Pinned: scoped to the caller's tenant, behind scan:view, and a failed count is
 * an error rather than a 0 that reads as "No issues detected".
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_TENANT_ID,
  authHeader,
  createTestEnv,
  setupPermissionMocks as setupPerms,
} from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() },
  },
}));

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("code-analysis");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

const get = () =>
  app.inject({ method: "GET", url: "/code-analysis/findings/open-total", headers: { authorization: authHeader() } });

describe("GET /code-analysis/findings/open-total", () => {
  it("returns the tenant's open findings", async () => {
    setupPerms(mockFrom, { permissions: [PERMISSIONS.SCAN_VIEW] });
    mockRpc.mockResolvedValue({ data: "733", error: null });

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ total: 733 });
    expect(mockRpc).toHaveBeenCalledWith("open_findings_total", { p_organization_id: TEST_TENANT_ID });
  });

  it("requires scan:view", async () => {
    setupPerms(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });
    expect((await get()).statusCode).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("fails instead of reporting zero when the count fails", async () => {
    setupPerms(mockFrom, { permissions: [PERMISSIONS.SCAN_VIEW] });
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom", code: "XX000" } });
    expect((await get()).statusCode).toBe(500);
  });
});

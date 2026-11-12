/**
 * GET /code-analysis/scans/latest: one request for the Security Scans list page.
 * Pinned: the tenant comes from the token (never the query), ids are validated and
 * de-duplicated, and an empty or oversized list is refused.
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
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() },
  },
}));

const mockLatest = vi.fn();
vi.mock("../domain/scans.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listLatestScansByProject: (...args: unknown[]) => mockLatest(...args),
}));

const P1 = "a1b2c3d4-1111-4111-8111-111111111111";
const P2 = "a1b2c3d4-2222-4222-8222-222222222222";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("code-analysis");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
  setupPerms(mockFrom, { permissions: [PERMISSIONS.SCAN_VIEW] });
});

const get = (qs: string) =>
  app.inject({ method: "GET", url: `/code-analysis/scans/latest${qs}`, headers: { authorization: authHeader() } });

describe("GET /code-analysis/scans/latest", () => {
  it("scopes to the caller's tenant and de-duplicates ids", async () => {
    mockLatest.mockResolvedValue([{ projectId: P1, scanCount: 0, latest: null, latestCompleted: null }]);

    const res = await get(`?projectIds=${P1},${P2},${P1}`);

    expect(res.statusCode).toBe(200);
    expect(mockLatest).toHaveBeenCalledWith(TEST_TENANT_ID, [P1, P2]);
    expect(res.json().projects[0]).toEqual({ projectId: P1, scanCount: 0, latest: null, latestCompleted: null });
  });

  it("refuses a missing, malformed or oversized id list", async () => {
    expect((await get("")).statusCode).toBe(400);
    expect((await get("?projectIds=")).statusCode).toBe(400);
    expect((await get("?projectIds=not-a-uuid")).statusCode).toBe(400);
    const tooMany = Array.from({ length: 101 }, (_, i) => `a1b2c3d4-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect((await get(`?projectIds=${tooMany.join(",")}`)).statusCode).toBe(400);
    expect(mockLatest).not.toHaveBeenCalled();
  });
});

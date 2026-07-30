/**
 * Integration tests for permission resolution.
 *
 * Tests the resolvePermissions flow (cache, singleflight, timeout, DB queries)
 * by building a minimal Fastify app with auth + authorization plugins and
 * injecting requests with controlled Supabase mock responses.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createTestEnv, signTestToken, TEST_USER_ID, TEST_TENANT_ID, TEST_EMAIL, TEST_ROLE_ID } from "./test-helpers.js";
import { PERMISSIONS } from "../permissions/constants.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../config.js", () => ({
  env: createTestEnv(),
}));

const mockFrom = vi.fn();
vi.mock("../supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Test App Setup ────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  const sensible = await import("@fastify/sensible");
  const { authPlugin } = await import("../auth/auth.js");
  const { authorizationPlugin, clearPermissionCache } = await import("../permissions/authorization.js");

  app = Fastify();
  await app.register(sensible.default);
  await app.register(authPlugin);
  await app.register(authorizationPlugin);

  // Test route that requires PROJECT_VIEW permission
  app.get("/test-permission", {
    preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
  }, async (request) => {
    return { userId: request.resolvedAuth!.userId, permissions: request.resolvedAuth!.permissions };
  });

  // Test route that requires owner
  app.get("/test-owner", {
    preHandler: app.requireOwner,
  }, async (request) => {
    return { isOwner: request.resolvedAuth!.isOwner };
  });

  await app.ready();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../permissions/authorization.js");
  clearPermissionCache();
});

afterAll(async () => {
  await app.close();
});

// ─── Helpers ───────────────────────────────────────────────────────

function authHeader(opts?: { userId?: string; tenantId?: string; email?: string }) {
  return `Bearer ${signTestToken(opts)}`;
}

/**
 * Configure the mockFrom to simulate the 3-query permission resolution:
 * 1. organization_memberships → membership row
 * 2. roles → role row
 * 3. role_permissions → permission list
 */
function setupPermissionDb(opts: {
  membership?: { role_id: string; is_owner: boolean; status: string } | null;
  role?: { id: string; system_key: string | null } | null;
  permissions?: string[];
  membershipError?: unknown;
  roleError?: unknown;
  permError?: unknown;
} = {}) {
  const membership = opts.membership === undefined
    ? { role_id: TEST_ROLE_ID, is_owner: false, status: "active" }
    : opts.membership;
  const role = opts.role === undefined
    ? { id: TEST_ROLE_ID, system_key: "admin" }
    : opts.role;
  const permissions = opts.permissions ?? [PERMISSIONS.PROJECT_VIEW];

  mockFrom.mockImplementation((table: string) => {
    if (table === "organization_memberships") {
      return buildChain(opts.membershipError ?? null, membership);
    }
    if (table === "roles") {
      return buildChain(opts.roleError ?? null, role);
    }
    if (table === "role_permissions") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: permissions.map((p) => ({ permission_id: p })),
            error: opts.permError ?? null,
          }),
        }),
      };
    }
    return buildChain(null, null);
  });
}

function buildChain(error: unknown, data: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "is", "in", "maybeSingle"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["maybeSingle"] = vi.fn().mockResolvedValue({ data, error });
  return chain;
}

// ─── Permission Resolution Tests ───────────────────────────────────

describe("resolvePermissions — basic flow", () => {
  it("resolves permissions and grants access when user has required permission", async () => {
    setupPermissionDb({ permissions: [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.DEPLOY_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe(TEST_USER_ID);
    expect(body.permissions).toContain(PERMISSIONS.PROJECT_VIEW);
  });

  it("returns 403 when user lacks required permission", async () => {
    setupPermissionDb({ permissions: [PERMISSIONS.DEPLOY_VIEW] }); // no PROJECT_VIEW

    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when user has no active membership", async () => {
    setupPermissionDb({ membership: null });

    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when membership query errors", async () => {
    setupPermissionDb({ membershipError: { message: "DB error", code: "PGRST500" } });

    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when membership has no role_id", async () => {
    setupPermissionDb({
      membership: { role_id: "", is_owner: false, status: "active" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when role is not found", async () => {
    setupPermissionDb({ role: null });

    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when role query errors", async () => {
    setupPermissionDb({ roleError: { message: "DB error" } });

    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/test-permission",
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── Owner Tests ───────────────────────────────────────────────────

describe("resolvePermissions — requireOwner", () => {
  it("grants access when user is owner", async () => {
    setupPermissionDb({
      membership: { role_id: TEST_ROLE_ID, is_owner: true, status: "active" },
      permissions: [PERMISSIONS.PROJECT_VIEW],
    });

    const res = await app.inject({
      method: "GET",
      url: "/test-owner",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().isOwner).toBe(true);
  });

  it("returns 403 when user is not owner", async () => {
    setupPermissionDb({
      membership: { role_id: TEST_ROLE_ID, is_owner: false, status: "active" },
      permissions: [PERMISSIONS.PROJECT_VIEW],
    });

    const res = await app.inject({
      method: "GET",
      url: "/test-owner",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ─── Cache Tests ───────────────────────────────────────────────────

describe("resolvePermissions — caching", () => {
  it("caches resolved permissions across multiple requests", async () => {
    setupPermissionDb({ permissions: [PERMISSIONS.PROJECT_VIEW] });

    // First request — triggers DB queries
    const res1 = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });
    expect(res1.statusCode).toBe(200);

    // Count how many times mockFrom was called for the first request
    const callsAfterFirst = mockFrom.mock.calls.length;

    // Second request — should use cache
    const res2 = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });
    expect(res2.statusCode).toBe(200);

    // No additional DB calls for the second request
    expect(mockFrom.mock.calls.length).toBe(callsAfterFirst);
  });

  it("different users do not share cache", async () => {
    setupPermissionDb({ permissions: [PERMISSIONS.PROJECT_VIEW] });

    const res1 = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader({ userId: "user-aaa-111" }) },
    });
    expect(res1.statusCode).toBe(200);

    const callsAfterFirst = mockFrom.mock.calls.length;

    // Different user — should NOT use the first user's cache
    const res2 = await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader({ userId: "user-bbb-222" }) },
    });
    expect(res2.statusCode).toBe(200);

    // Additional DB calls were made for the second user
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("cache is cleared by clearPermissionCache", async () => {
    setupPermissionDb({ permissions: [PERMISSIONS.PROJECT_VIEW] });

    // Warm the cache
    await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    const callsAfterFirst = mockFrom.mock.calls.length;

    // Clear cache
    const { clearPermissionCache } = await import("../permissions/authorization.js");
    clearPermissionCache();

    // Next request should hit DB again
    await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("invalidatePermissionCache clears specific user", async () => {
    setupPermissionDb({ permissions: [PERMISSIONS.PROJECT_VIEW] });

    // Warm the cache
    await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    const callsAfterFirst = mockFrom.mock.calls.length;

    // Invalidate only this user
    const { invalidatePermissionCache } = await import("../permissions/authorization.js");
    invalidatePermissionCache(TEST_USER_ID, TEST_TENANT_ID);

    // Next request should hit DB again
    await app.inject({
      method: "GET",
      url: "/test-permission",
      headers: { authorization: authHeader() },
    });

    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

// ─── Singleflight Tests ────────────────────────────────────────────

describe("resolvePermissions — singleflight", () => {
  it("concurrent requests for same user make only one DB round-trip", async () => {
    // Use a delayed mock to simulate slow DB
    let resolveQuery: ((value: unknown) => void) | null = null;
    const delayedPromise = new Promise((resolve) => { resolveQuery = resolve; });

    mockFrom.mockImplementation((table: string) => {
      if (table === "organization_memberships") {
        const chain: Record<string, unknown> = {};
        const methods = ["select", "eq", "is", "in"];
        for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
        chain["maybeSingle"] = vi.fn().mockReturnValue(
          delayedPromise.then(() => ({
            data: { role_id: TEST_ROLE_ID, is_owner: false, status: "active" },
            error: null,
          })),
        );
        return chain;
      }
      if (table === "roles") {
        return buildChain(null, { id: TEST_ROLE_ID, system_key: "admin" });
      }
      if (table === "role_permissions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ permission_id: PERMISSIONS.PROJECT_VIEW }],
              error: null,
            }),
          }),
        };
      }
      return buildChain(null, null);
    });

    // Fire 5 concurrent requests for the same user
    const requests = Array.from({ length: 5 }, () =>
      app.inject({
        method: "GET",
        url: "/test-permission",
        headers: { authorization: authHeader() },
      }),
    );

    // Let the DB query resolve
    resolveQuery!(undefined);

    const results = await Promise.all(requests);

    // All should succeed
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    // Only ONE membership query was made (singleflight collapsed the rest)
    const membershipCalls = mockFrom.mock.calls.filter(([table]) => table === "organization_memberships");
    expect(membershipCalls.length).toBe(1);
  });
});

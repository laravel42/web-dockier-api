/**
 * Auth Routes Integration Tests
 *
 * Tests the auth route handlers via Fastify's inject() method.
 * Mocks Supabase at the module level so we test actual route logic,
 * schema validation, and permission enforcement without a real DB.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_EMAIL,
  TEST_ROLE_ID,
  OTHER_TENANT_ID,
  authHeader,
  ADMIN_MEMBERSHIP,
  OWNER_MEMBERSHIP,
  MEMBER_ROLE,
  createTestEnv,
  setupPermissionMocks as setupPerms,
} from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

// ─── Mocks ─────────────────────────────────────────────────────────

// Mock environment before anything else
vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv(),
}));

// Mock Supabase client
const mockFrom = vi.fn();
const mockAuth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  admin: { getUserById: vi.fn() },
};

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: mockAuth,
  },
}));

// Mock domain modules to isolate route-level behavior
const mockPerformDemoLogin = vi.fn();
const mockPerformPasswordLogin = vi.fn();
const mockClassifyAuthError = vi.fn();
const mockVerifyOtpAndProvision = vi.fn();

vi.mock("../domain/registration.js", () => ({
  performDemoLogin: (...args: unknown[]) => mockPerformDemoLogin(...args),
  performPasswordLogin: (...args: unknown[]) => mockPerformPasswordLogin(...args),
  classifyAuthError: (...args: unknown[]) => mockClassifyAuthError(...args),
  verifyOtpAndProvision: (...args: unknown[]) => mockVerifyOtpAndProvision(...args),
}));

const mockListMembershipsForUser = vi.fn();
const mockGetAuthenticatedUser = vi.fn();
const mockAddMemberToTenant = vi.fn();
const mockRemoveMemberFromTenant = vi.fn();
const mockListTenantMemberships = vi.fn();

vi.mock("../domain/membership.js", () => ({
  listMembershipsForUser: (...args: unknown[]) => mockListMembershipsForUser(...args),
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
  addMemberToTenant: (...args: unknown[]) => mockAddMemberToTenant(...args),
  removeMemberFromTenant: (...args: unknown[]) => mockRemoveMemberFromTenant(...args),
  listTenantMemberships: (...args: unknown[]) => mockListTenantMemberships(...args),
}));

const mockCreateTenant = vi.fn();
const mockSwitchTenant = vi.fn();
const mockTransferOwnership = vi.fn();

vi.mock("../domain/tenant.js", () => ({
  createTenant: (...args: unknown[]) => mockCreateTenant(...args),
  switchTenant: (...args: unknown[]) => mockSwitchTenant(...args),
  transferOwnership: (...args: unknown[]) => mockTransferOwnership(...args),
}));

// ─── App Setup ─────────────────────────────────────────────────────

let app: FastifyInstance;

/**
 * Helper to set up the permission resolution chain for the mock Supabase.
 * Simulates: membership lookup → role lookup → role_permissions lookup.
 */
function setupPermissionMocks(opts: {
  membership?: Record<string, unknown> | null;
  role?: Record<string, unknown> | null;
  permissions?: string[];
}) {
  setupPerms(mockFrom, {
    ...opts,
    permissions: opts.permissions ?? Object.values(PERMISSIONS),
  });
}

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("auth");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

// ─── Tests ─────────────────────────────────────────────────────────

describe("POST /auth/demo-login", () => {
  it("returns session and memberships in non-production", async () => {
    const mockSession = {
      session: { token: "test-token", userId: TEST_USER_ID, tenantId: TEST_TENANT_ID },
      memberships: [{ id: TEST_USER_ID, tenantId: TEST_TENANT_ID, tenantName: "Test Org", tenantSlug: "test-org", roleName: "Admin", isOwner: true }],
    };
    mockPerformDemoLogin.mockResolvedValue(mockSession);

    const res = await app.inject({ method: "POST", url: "/auth/demo-login" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session).toBeDefined();
    expect(body.memberships).toBeDefined();
    expect(mockPerformDemoLogin).toHaveBeenCalledOnce();
  });
});

describe("POST /auth/passwordless/start", () => {
  it("returns success for valid email", async () => {
    mockAuth.signInWithOtp.mockResolvedValue({ error: null });

    const res = await app.inject({
      method: "POST",
      url: "/auth/passwordless/start",
      payload: { email: "user@example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it("returns 400 for invalid email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/passwordless/start",
      payload: { email: "not-an-email" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 429 when rate limited by Supabase", async () => {
    mockAuth.signInWithOtp.mockResolvedValue({ error: { message: "rate limit exceeded" } });
    mockClassifyAuthError.mockReturnValue({ status: "rate_limit", userMessage: "Too many attempts" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/passwordless/start",
      payload: { email: "user@example.com" },
    });

    expect(res.statusCode).toBe(429);
  });
});

describe("POST /auth/passwordless/verify", () => {
  it("returns session on valid OTP", async () => {
    const mockResult = {
      session: { token: "jwt-token", userId: TEST_USER_ID, tenantId: TEST_TENANT_ID },
      memberships: [],
    };
    mockVerifyOtpAndProvision.mockResolvedValue(mockResult);

    const res = await app.inject({
      method: "POST",
      url: "/auth/passwordless/verify",
      payload: { email: "user@example.com", token: "123456", type: "email" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.token).toBe("jwt-token");
  });

  it("returns 400 for missing token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/passwordless/verify",
      payload: { email: "user@example.com" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("returns 401 without auth header", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: "Bearer invalid.token.here" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns user info with valid token", async () => {
    const mockUser = {
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      name: "Test User",
      tenantId: TEST_TENANT_ID,
      roleId: TEST_ROLE_ID,
      roleName: "Admin",
      systemKey: "admin",
      isOwner: false,
      permissions: [PERMISSIONS.PROJECT_VIEW],
      memberships: [{ id: TEST_USER_ID, tenantId: TEST_TENANT_ID, tenantName: "Test Org", tenantSlug: "test-org", roleName: "Admin", isOwner: false }],
      twoFactorEnabled: false,
    };
    mockGetAuthenticatedUser.mockResolvedValue(mockUser);

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith(TEST_USER_ID, TEST_TENANT_ID);
  });
});

describe("GET /auth/memberships", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/memberships" });
    expect(res.statusCode).toBe(401);
  });

  it("returns memberships for authenticated user", async () => {
    mockListMembershipsForUser.mockResolvedValue([
      { id: TEST_USER_ID, tenantId: TEST_TENANT_ID, tenantName: "Org 1", tenantSlug: "org-1", roleName: "Admin", isOwner: true },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/auth/memberships",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().memberships).toHaveLength(1);
  });
});

describe("POST /auth/tenants", () => {
  it("creates a new tenant", async () => {
    const newTenantId = "e5f6a7b8-5678-4ef0-abcd-aaaaaaaaaaaa";
    mockCreateTenant.mockResolvedValue({
      tenantId: newTenantId,
      slug: "my-org",
      session: { token: "new-token", userId: TEST_USER_ID, tenantId: newTenantId },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/tenants",
      headers: { authorization: authHeader() },
      payload: { name: "My Organization" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe("my-org");
    expect(mockCreateTenant).toHaveBeenCalledWith({
      name: "My Organization",
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
    });
  });

  it("rejects short names", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/tenants",
      headers: { authorization: authHeader() },
      payload: { name: "X" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /auth/tenants/:tenantId/switch", () => {
  it("issues new JWT for target tenant", async () => {
    mockSwitchTenant.mockResolvedValue({
      token: "switched-token",
      userId: TEST_USER_ID,
      tenantId: OTHER_TENANT_ID,
    });

    const res = await app.inject({
      method: "POST",
      url: `/auth/tenants/${OTHER_TENANT_ID}/switch`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(mockSwitchTenant).toHaveBeenCalledWith({
      tenantId: OTHER_TENANT_ID,
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
    });
  });
});

describe("GET /auth/tenants/:tenantId/memberships", () => {
  it("returns 403 when user is in a different tenant", async () => {
    // Token is for TEST_TENANT_ID, but requesting OTHER_TENANT_ID
    setupPermissionMocks({});

    const res = await app.inject({
      method: "GET",
      url: `/auth/tenants/${OTHER_TENANT_ID}/memberships`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns memberships when user has USER_VIEW permission in same tenant", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.USER_VIEW] });
    mockListTenantMemberships.mockResolvedValue([
      { id: TEST_USER_ID, userId: TEST_USER_ID, email: TEST_EMAIL, name: "Test", roleName: "Admin", isOwner: false },
    ]);

    const res = await app.inject({
      method: "GET",
      url: `/auth/tenants/${TEST_TENANT_ID}/memberships`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().memberships).toHaveLength(1);
  });
});

describe("POST /auth/tenants/:tenantId/memberships", () => {
  it("returns 403 without USER_MANAGE permission", async () => {
    // Give only USER_VIEW — not USER_MANAGE
    setupPermissionMocks({ permissions: [PERMISSIONS.USER_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: `/auth/tenants/${TEST_TENANT_ID}/memberships`,
      headers: { authorization: authHeader() },
      payload: { email: "new@user.com", roleId: MEMBER_ROLE.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it("adds member with USER_MANAGE permission", async () => {
    setupPermissionMocks({ permissions: Object.values(PERMISSIONS) });
    mockAddMemberToTenant.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "POST",
      url: `/auth/tenants/${TEST_TENANT_ID}/memberships`,
      headers: { authorization: authHeader() },
      payload: { email: "new@user.com", roleId: MEMBER_ROLE.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockAddMemberToTenant).toHaveBeenCalledOnce();
  });
});

describe("DELETE /auth/tenants/:tenantId/memberships/:userId", () => {
  it("returns 403 for different tenant", async () => {
    setupPermissionMocks({});

    const targetUserId = "f1a2b3c4-1234-4abc-8def-ffffffffffff";
    const res = await app.inject({
      method: "DELETE",
      url: `/auth/tenants/${OTHER_TENANT_ID}/memberships/${targetUserId}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("POST /auth/tenants/:tenantId/transfer-ownership", () => {
  it("returns 403 when user is not owner", async () => {
    // Setup as non-owner
    setupPermissionMocks({ membership: ADMIN_MEMBERSHIP });

    const targetUserId = "f1a2b3c4-1234-4abc-8def-ffffffffffff";
    const res = await app.inject({
      method: "POST",
      url: `/auth/tenants/${TEST_TENANT_ID}/transfer-ownership`,
      headers: { authorization: authHeader() },
      payload: { targetUserId },
    });

    expect(res.statusCode).toBe(403);
  });

  it("transfers ownership when user is owner", async () => {
    setupPermissionMocks({ membership: OWNER_MEMBERSHIP });
    mockTransferOwnership.mockResolvedValue(undefined);

    const targetUserId = "f1a2b3c4-1234-4abc-8def-ffffffffffff";
    const res = await app.inject({
      method: "POST",
      url: `/auth/tenants/${TEST_TENANT_ID}/transfer-ownership`,
      headers: { authorization: authHeader() },
      payload: { targetUserId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockTransferOwnership).toHaveBeenCalledWith({
      tenantId: TEST_TENANT_ID,
      currentOwnerId: TEST_USER_ID,
      targetUserId,
    });
  });
});

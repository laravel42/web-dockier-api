/**
 * Users Routes Integration Tests
 *
 * Tests the users route handlers via Fastify's inject() method.
 * Mocks domain modules to isolate route-level behavior.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_ROLE_ID,
  TEST_EMAIL,
  authHeader,
  createTestEnv,
  setupPermissionMocks,
} from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv(),
}));

const mockFrom = vi.fn();

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockCreateUser = vi.fn();
const mockGetUser = vi.fn();
const mockListUsers = vi.fn();
const mockUpdateUser = vi.fn();
const mockRemoveUser = vi.fn();

vi.mock("../domain/users.js", () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  getUser: (...args: unknown[]) => mockGetUser(...args),
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  removeUser: (...args: unknown[]) => mockRemoveUser(...args),
}));

// ─── App Setup ─────────────────────────────────────────────────────

let app: FastifyInstance;

const OTHER_USER_ID = "d4e5f6a7-4567-4def-bcde-444444444444";

const MOCK_USER = {
  id: OTHER_USER_ID,
  email: "dev@dockier.dev",
  name: "Dev User",
  avatarUrl: null,
  country: "US",
  language: "en",
  timezone: "America/New_York",
  tenantId: TEST_TENANT_ID,
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("users");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

// ─── Tests ─────────────────────────────────────────────────────────

describe("POST /users", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/users",
      payload: { email: "new@user.com", name: "New User" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 without USER_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: { authorization: authHeader() },
      payload: { email: "new@user.com", name: "New User" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for invalid email", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_MANAGE] });

    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: { authorization: authHeader() },
      payload: { email: "not-valid", name: "New User" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for empty name", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_MANAGE] });

    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: { authorization: authHeader() },
      payload: { email: "new@user.com", name: "" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("creates user with USER_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_MANAGE] });
    mockCreateUser.mockResolvedValue(MOCK_USER);

    const res = await app.inject({
      method: "POST",
      url: "/users",
      headers: { authorization: authHeader() },
      payload: { email: "dev@dockier.dev", name: "Dev User" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe("dev@dockier.dev");
    expect(mockCreateUser).toHaveBeenCalledOnce();
    expect(mockCreateUser.mock.calls[0][0]).toMatchObject({
      tenantId: TEST_TENANT_ID,
      email: "dev@dockier.dev",
      name: "Dev User",
    });
  });
});

describe("GET /users/:userId", () => {
  it("returns 403 without USER_VIEW permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: `/users/${OTHER_USER_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for non-UUID userId", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: "/users/not-a-uuid",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns user by ID", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_VIEW] });
    mockGetUser.mockResolvedValue(MOCK_USER);

    const res = await app.inject({
      method: "GET",
      url: `/users/${OTHER_USER_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(OTHER_USER_ID);
    expect(mockGetUser).toHaveBeenCalledWith(OTHER_USER_ID, TEST_TENANT_ID);
  });
});

describe("GET /users", () => {
  it("returns paginated user list", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_VIEW] });
    mockListUsers.mockResolvedValue({
      users: [{ ...MOCK_USER, roleId: TEST_ROLE_ID, roleName: "Admin", isOwner: false }],
      pagination: { total: 1, limit: 20, offset: 0 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/users",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.users).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    expect(mockListUsers).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TEST_TENANT_ID,
    }));
  });

  it("passes search query param", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_VIEW] });
    mockListUsers.mockResolvedValue({ users: [], pagination: { total: 0, limit: 20, offset: 0 } });

    const res = await app.inject({
      method: "GET",
      url: "/users?search=dev",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(mockListUsers.mock.calls[0][0].search).toBe("dev");
  });
});

describe("PUT /users/:userId", () => {
  it("returns 403 without USER_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_VIEW] });

    const res = await app.inject({
      method: "PUT",
      url: `/users/${OTHER_USER_ID}`,
      headers: { authorization: authHeader() },
      payload: { name: "Updated Name" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for empty body", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_MANAGE] });

    const res = await app.inject({
      method: "PUT",
      url: `/users/${OTHER_USER_ID}`,
      headers: { authorization: authHeader() },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("updates user with valid fields", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_MANAGE] });
    mockUpdateUser.mockResolvedValue({ ...MOCK_USER, name: "Updated Name" });

    const res = await app.inject({
      method: "PUT",
      url: `/users/${OTHER_USER_ID}`,
      headers: { authorization: authHeader() },
      payload: { name: "Updated Name" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Updated Name");
    expect(mockUpdateUser).toHaveBeenCalledOnce();
    expect(mockUpdateUser.mock.calls[0][0]).toMatchObject({
      userId: OTHER_USER_ID,
      tenantId: TEST_TENANT_ID,
      name: "Updated Name",
    });
  });
});

describe("DELETE /users/:userId", () => {
  it("returns 403 without USER_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_VIEW] });

    const res = await app.inject({
      method: "DELETE",
      url: `/users/${OTHER_USER_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("removes user with USER_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.USER_MANAGE] });
    mockRemoveUser.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "DELETE",
      url: `/users/${OTHER_USER_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockRemoveUser).toHaveBeenCalledOnce();
    expect(mockRemoveUser.mock.calls[0][0]).toMatchObject({
      userId: OTHER_USER_ID,
      tenantId: TEST_TENANT_ID,
      actorUserId: TEST_USER_ID,
    });
  });
});

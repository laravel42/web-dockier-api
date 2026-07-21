/**
 * Roles Routes Integration Tests
 *
 * Tests the roles route handlers via Fastify's inject() method.
 * Mocks domain modules to isolate route-level behavior.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_ROLE_ID,
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

const mockListRoles = vi.fn();
const mockGetRole = vi.fn();
const mockCreateRole = vi.fn();
const mockUpdateRole = vi.fn();
const mockDeleteRole = vi.fn();

vi.mock("../domain/roles.js", () => ({
  listRoles: (...args: unknown[]) => mockListRoles(...args),
  getRole: (...args: unknown[]) => mockGetRole(...args),
  createRole: (...args: unknown[]) => mockCreateRole(...args),
  updateRole: (...args: unknown[]) => mockUpdateRole(...args),
  deleteRole: (...args: unknown[]) => mockDeleteRole(...args),
}));

// ─── App Setup ─────────────────────────────────────────────────────

let app: FastifyInstance;

const MOCK_ROLE = {
  id: TEST_ROLE_ID,
  name: "Developer",
  description: "Can view and deploy",
  systemKey: null,
  isSystem: false,
  isEditable: true,
  isDeletable: true,
  permissions: [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.DEPLOY_VIEW],
};

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("roles");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

// ─── Tests ─────────────────────────────────────────────────────────

describe("GET /roles", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/roles" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 without ROLE_VIEW permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: "/roles",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns roles with ROLE_VIEW permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_VIEW] });
    mockListRoles.mockResolvedValue({ roles: [MOCK_ROLE] });

    const res = await app.inject({
      method: "GET",
      url: "/roles",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().roles).toHaveLength(1);
    expect(res.json().roles[0].name).toBe("Developer");
    expect(mockListRoles).toHaveBeenCalledWith(TEST_TENANT_ID);
  });
});

describe("GET /roles/:roleId", () => {
  it("returns 400 for non-UUID roleId", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: "/roles/not-a-uuid",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns role by ID", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_VIEW] });
    mockGetRole.mockResolvedValue(MOCK_ROLE);

    const res = await app.inject({
      method: "GET",
      url: `/roles/${TEST_ROLE_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(TEST_ROLE_ID);
    expect(mockGetRole).toHaveBeenCalledWith(TEST_ROLE_ID, TEST_TENANT_ID);
  });
});

describe("POST /roles", () => {
  it("returns 403 without ROLE_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { authorization: authHeader() },
      payload: { name: "Tester", permissions: [] },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for short name", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_MANAGE] });

    const res = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { authorization: authHeader() },
      payload: { name: "X", permissions: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("creates role with ROLE_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_MANAGE] });
    mockCreateRole.mockResolvedValue(MOCK_ROLE);

    const res = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { authorization: authHeader() },
      payload: { name: "Developer", description: "Can view and deploy", permissions: [PERMISSIONS.PROJECT_VIEW] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Developer");
    expect(mockCreateRole).toHaveBeenCalledOnce();
    expect(mockCreateRole.mock.calls[0][0]).toMatchObject({
      tenantId: TEST_TENANT_ID,
      name: "Developer",
    });
  });
});

describe("PUT /roles/:roleId", () => {
  it("returns 400 for non-UUID roleId", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_MANAGE] });

    const res = await app.inject({
      method: "PUT",
      url: "/roles/invalid-id",
      headers: { authorization: authHeader() },
      payload: { name: "Updated" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("updates role with valid params", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_MANAGE] });
    mockUpdateRole.mockResolvedValue({ ...MOCK_ROLE, name: "Senior Dev" });

    const res = await app.inject({
      method: "PUT",
      url: `/roles/${TEST_ROLE_ID}`,
      headers: { authorization: authHeader() },
      payload: { name: "Senior Dev", permissions: [PERMISSIONS.DEPLOY_CREATE] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Senior Dev");
    expect(mockUpdateRole).toHaveBeenCalledOnce();
  });
});

describe("DELETE /roles/:roleId", () => {
  it("returns 403 without ROLE_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_VIEW] });

    const res = await app.inject({
      method: "DELETE",
      url: `/roles/${TEST_ROLE_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("deletes role with ROLE_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_MANAGE] });
    mockDeleteRole.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "DELETE",
      url: `/roles/${TEST_ROLE_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockDeleteRole).toHaveBeenCalledWith(TEST_ROLE_ID, TEST_TENANT_ID, expect.any(Object));
  });
});

describe("GET /permissions", () => {
  it("returns all permission definitions", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.ROLE_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: "/permissions",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.permissions.length).toBeGreaterThan(0);
    expect(body.permissions[0]).toHaveProperty("key");
    expect(body.permissions[0]).toHaveProperty("resource");
    expect(body.permissions[0]).toHaveProperty("action");
    expect(body.permissions[0]).toHaveProperty("description");
  });
});

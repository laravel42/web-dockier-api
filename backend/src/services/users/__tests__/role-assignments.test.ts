/**
 * Role Assignment Helpers — Unit Tests
 *
 * Tests validateRoleAssignment, assignRoleToUser, and updateUserRole
 * in isolation by mocking Supabase at the module level.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_ROLE_ID,
  createTestEnv,
} from "../../../shared/__tests__/test-helpers.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv(),
}));

const mockFrom = vi.fn();

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { admin: {} },
  },
}));

// ─── Import after mocks ────────────────────────────────────────────

const { validateRoleAssignment, assignRoleToUser, updateUserRole } = await import("../domain/role-assignments.js");
const { UsersError } = await import("../domain/users.js");

// ─── Test ResolvedAuth ─────────────────────────────────────────────

const adminAuth = {
  userId: TEST_USER_ID,
  email: "admin@test.com",
  tenantId: TEST_TENANT_ID,
  roleId: TEST_ROLE_ID,
  systemKey: "admin",
  permissions: [],
  isOwner: false,
  hierarchyLevel: 1, // admin level — can manage member (level 2) but not owner (level 0)
};

const memberAuth = {
  userId: "member-user-id",
  email: "member@test.com",
  tenantId: TEST_TENANT_ID,
  roleId: "member-role-id",
  systemKey: "member",
  permissions: [],
  isOwner: false,
  hierarchyLevel: 2, // member level — can only manage viewer (level 3+)
};

// ─── Helpers ───────────────────────────────────────────────────────

function mockRolesTable(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

function mockMembershipsTable(opts: {
  insertResult?: { error: unknown };
  selectResult?: { data: unknown; error: unknown };
  updateResult?: { error: unknown };
}) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: opts.insertResult?.error ?? null }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(opts.selectResult ?? { data: null, error: null }),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateRoleAssignment", () => {
  it("returns role when valid and actor can manage it", async () => {
    const roleRow = { id: TEST_ROLE_ID, system_key: "member" };
    mockFrom.mockImplementation((table: string) => {
      if (table === "roles") return mockRolesTable({ data: roleRow, error: null });
      return {};
    });

    const result = await validateRoleAssignment(TEST_ROLE_ID, TEST_TENANT_ID, adminAuth);
    expect(result).toEqual(roleRow);
  });

  it("throws bad_request when role not found", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "roles") return mockRolesTable({ data: null, error: null });
      return {};
    });

    await expect(validateRoleAssignment("nonexistent-id", TEST_TENANT_ID, adminAuth))
      .rejects.toThrow("Role not found");
  });

  it("throws internal when DB query fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "roles") return mockRolesTable({ data: null, error: { message: "timeout", code: "XX000" } });
      return {};
    });

    await expect(validateRoleAssignment(TEST_ROLE_ID, TEST_TENANT_ID, adminAuth))
      .rejects.toThrow("Failed to look up role");
  });

  it("throws forbidden when actor cannot manage the target role", async () => {
    // member trying to assign admin role (higher level)
    const adminRoleRow = { id: "admin-role-id", system_key: "admin" };
    mockFrom.mockImplementation((table: string) => {
      if (table === "roles") return mockRolesTable({ data: adminRoleRow, error: null });
      return {};
    });

    await expect(validateRoleAssignment("admin-role-id", TEST_TENANT_ID, memberAuth))
      .rejects.toThrow("Cannot assign a role at or above your own level");
  });
});

describe("assignRoleToUser", () => {
  it("inserts a membership row on success", async () => {
    const roleRow = { id: TEST_ROLE_ID, system_key: "member" };
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "roles") return mockRolesTable({ data: roleRow, error: null });
      if (table === "organization_memberships") {
        return { insert: insertMock };
      }
      return {};
    });

    await assignRoleToUser(TEST_USER_ID, TEST_TENANT_ID, TEST_ROLE_ID, adminAuth);
    expect(insertMock).toHaveBeenCalledWith({
      organization_id: TEST_TENANT_ID,
      user_id: TEST_USER_ID,
      role_id: TEST_ROLE_ID,
      is_owner: false,
      status: "active",
    });
  });

  it("throws bad_request on duplicate membership (23505)", async () => {
    const roleRow = { id: TEST_ROLE_ID, system_key: "member" };
    mockFrom.mockImplementation((table: string) => {
      if (table === "roles") return mockRolesTable({ data: roleRow, error: null });
      if (table === "organization_memberships") {
        return { insert: vi.fn().mockResolvedValue({ error: { message: "duplicate", code: "23505" } }) };
      }
      return {};
    });

    await expect(assignRoleToUser(TEST_USER_ID, TEST_TENANT_ID, TEST_ROLE_ID, adminAuth))
      .rejects.toThrow("User is already a member of this organization");
  });

  it("throws internal on non-duplicate insert error", async () => {
    const roleRow = { id: TEST_ROLE_ID, system_key: "member" };
    mockFrom.mockImplementation((table: string) => {
      if (table === "roles") return mockRolesTable({ data: roleRow, error: null });
      if (table === "organization_memberships") {
        return { insert: vi.fn().mockResolvedValue({ error: { message: "connection", code: "XX000" } }) };
      }
      return {};
    });

    await expect(assignRoleToUser(TEST_USER_ID, TEST_TENANT_ID, TEST_ROLE_ID, adminAuth))
      .rejects.toThrow("Failed to create membership");
  });
});

describe("updateUserRole", () => {
  it("creates membership when no active membership exists", async () => {
    const roleRow = { id: TEST_ROLE_ID, system_key: "member" };
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "organization_memberships") {
        // First call: maybeSingle (lookup) → null
        // Second call: insert (assign)
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: insertMock,
        };
        return chain;
      }
      if (table === "roles") return mockRolesTable({ data: roleRow, error: null });
      return {};
    });

    await updateUserRole(TEST_USER_ID, TEST_TENANT_ID, TEST_ROLE_ID, adminAuth);
    expect(insertMock).toHaveBeenCalled();
  });

  it("throws forbidden when target is the organization owner", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "organization_memberships") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_owner: true, role_id: TEST_ROLE_ID, roles: { system_key: "admin" } },
            error: null,
          }),
        };
      }
      return {};
    });

    await expect(updateUserRole(TEST_USER_ID, TEST_TENANT_ID, "new-role-id", adminAuth))
      .rejects.toThrow("Cannot change the role of the organization owner");
  });

  it("throws forbidden when actor cannot manage target's current role", async () => {
    // Member trying to change an admin's role
    mockFrom.mockImplementation((table: string) => {
      if (table === "organization_memberships") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_owner: false, role_id: "admin-role-id", roles: { system_key: "admin" } },
            error: null,
          }),
        };
      }
      return {};
    });

    await expect(updateUserRole(TEST_USER_ID, TEST_TENANT_ID, "viewer-role-id", memberAuth))
      .rejects.toThrow("Cannot change the role of a user at or above your own level");
  });

  it("updates membership role_id on success", async () => {
    const newRoleId = "e5f6a7b8-5678-4ef0-abcd-555555555555";
    const newRoleRow = { id: newRoleId, system_key: "viewer" };
    const updateMock = vi.fn().mockReturnThis();
    let callCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "organization_memberships") {
        callCount++;
        if (callCount === 1) {
          // First call: membership lookup
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_owner: false, role_id: TEST_ROLE_ID, roles: { system_key: "member" } },
              error: null,
            }),
          };
        }
        // Subsequent: update call
        return {
          update: updateMock,
          eq: vi.fn().mockReturnThis(),
        };
      }
      if (table === "roles") return mockRolesTable({ data: newRoleRow, error: null });
      return {};
    });

    // Admin changing member's role to viewer — should succeed
    await updateUserRole(TEST_USER_ID, TEST_TENANT_ID, newRoleId, adminAuth);
    expect(updateMock).toHaveBeenCalledWith({ role_id: newRoleId });
  });
});

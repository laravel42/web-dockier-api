/**
 * Unit tests for authorization helpers.
 *
 * Tests the pure permission-checking functions exported from the
 * authorization module. These run on every authenticated request
 * (after cache resolution), so correctness is critical.
 */

import { describe, it, expect, vi } from "vitest";
import { createTestEnv } from "./test-helpers.js";

vi.mock("../config.js", () => ({
  env: createTestEnv(),
}));

vi.mock("../supabase/client.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import {
  hasPermissions,
  canAssignPermissions,
  canManageRole,
  type ResolvedAuth,
} from "../permissions/authorization.js";
import { PERMISSIONS, CRITICAL_PERMISSIONS, type PermissionKey } from "../permissions/constants.js";

// ─── Fixtures ──────────────────────────────────────────────────────

function makeResolved(overrides: Partial<ResolvedAuth> = {}): ResolvedAuth {
  return {
    userId: "user-1",
    email: "test@example.com",
    tenantId: "tenant-1",
    roleId: "role-1",
    systemKey: "admin",
    permissions: [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_MANAGE, PERMISSIONS.DEPLOY_VIEW],
    isOwner: false,
    hierarchyLevel: 0,
    ...overrides,
  };
}

// ─── hasPermissions ────────────────────────────────────────────────

describe("hasPermissions", () => {
  it("returns true when user has all required permissions", () => {
    const resolved = makeResolved({ permissions: [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.DEPLOY_VIEW] });
    expect(hasPermissions(resolved, [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.DEPLOY_VIEW])).toBe(true);
  });

  it("returns true when user has more permissions than required", () => {
    const resolved = makeResolved({
      permissions: [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_MANAGE, PERMISSIONS.DEPLOY_VIEW, PERMISSIONS.DEPLOY_CREATE],
    });
    expect(hasPermissions(resolved, [PERMISSIONS.PROJECT_VIEW])).toBe(true);
  });

  it("returns false when user is missing one required permission", () => {
    const resolved = makeResolved({ permissions: [PERMISSIONS.PROJECT_VIEW] });
    expect(hasPermissions(resolved, [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.DEPLOY_CREATE])).toBe(false);
  });

  it("returns false when user has no permissions", () => {
    const resolved = makeResolved({ permissions: [] });
    expect(hasPermissions(resolved, [PERMISSIONS.PROJECT_VIEW])).toBe(false);
  });

  it("returns true for empty required array", () => {
    const resolved = makeResolved({ permissions: [] });
    expect(hasPermissions(resolved, [])).toBe(true);
  });

  it("requires ALL permissions (AND logic, not OR)", () => {
    const resolved = makeResolved({ permissions: [PERMISSIONS.PROJECT_VIEW] });
    expect(hasPermissions(resolved, [PERMISSIONS.PROJECT_VIEW, PERMISSIONS.PROJECT_MANAGE])).toBe(false);
  });
});

// ─── canAssignPermissions ──────────────────────────────────────────

describe("canAssignPermissions", () => {
  it("allows assigning non-critical permissions regardless of actor permissions", () => {
    const actor = makeResolved({ permissions: [PERMISSIONS.PROJECT_VIEW] });
    expect(canAssignPermissions(actor, [PERMISSIONS.DEPLOY_VIEW, PERMISSIONS.SCAN_VIEW])).toBe(true);
  });

  it("allows assigning critical permissions when actor has them", () => {
    const actor = makeResolved({
      permissions: [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.BILLING_MANAGE, PERMISSIONS.ORGANIZATION_DELETE],
    });
    expect(canAssignPermissions(actor, [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.BILLING_MANAGE])).toBe(true);
  });

  it("blocks assigning critical permissions the actor does not possess", () => {
    const actor = makeResolved({ permissions: [PERMISSIONS.PROJECT_VIEW] });
    expect(canAssignPermissions(actor, [PERMISSIONS.ORGANIZATION_DELETE])).toBe(false);
  });

  it("blocks when actor is missing even one critical permission in the set", () => {
    const actor = makeResolved({
      permissions: [PERMISSIONS.ROLE_MANAGE], // has ROLE_MANAGE but not BILLING_MANAGE
    });
    expect(canAssignPermissions(actor, [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.BILLING_MANAGE])).toBe(false);
  });

  it("allows empty permission set", () => {
    const actor = makeResolved({ permissions: [] });
    expect(canAssignPermissions(actor, [])).toBe(true);
  });

  it("allows mixed critical and non-critical when actor has the critical ones", () => {
    const actor = makeResolved({
      permissions: [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.PROJECT_VIEW],
    });
    // ROLE_MANAGE is critical, PROJECT_CREATE is not
    expect(canAssignPermissions(actor, [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.PROJECT_CREATE])).toBe(true);
  });

  it("all CRITICAL_PERMISSIONS are checked", () => {
    // Actor has no permissions — any critical permission should be blocked
    const actor = makeResolved({ permissions: [] });
    for (const perm of CRITICAL_PERMISSIONS) {
      expect(canAssignPermissions(actor, [perm])).toBe(false);
    }
  });
});

// ─── canManageRole ─────────────────────────────────────────────────

describe("canManageRole", () => {
  it("admin (level 0) can manage member (level 1)", () => {
    const actor = makeResolved({ systemKey: "admin", hierarchyLevel: 0 });
    expect(canManageRole(actor, "member")).toBe(true);
  });

  it("admin (level 0) can manage admin (same level)", () => {
    const actor = makeResolved({ systemKey: "admin", hierarchyLevel: 0 });
    expect(canManageRole(actor, "admin")).toBe(true);
  });

  it("member (level 1) cannot manage admin (level 0)", () => {
    const actor = makeResolved({ systemKey: "member", hierarchyLevel: 1 });
    expect(canManageRole(actor, "admin")).toBe(false);
  });

  it("member (level 1) can manage member (same level)", () => {
    const actor = makeResolved({ systemKey: "member", hierarchyLevel: 1 });
    expect(canManageRole(actor, "member")).toBe(true);
  });

  it("admin can manage custom roles (null systemKey = Infinity level)", () => {
    const actor = makeResolved({ systemKey: "admin", hierarchyLevel: 0 });
    expect(canManageRole(actor, null)).toBe(true);
  });

  it("member can manage custom roles (null systemKey = Infinity level)", () => {
    const actor = makeResolved({ systemKey: "member", hierarchyLevel: 1 });
    expect(canManageRole(actor, null)).toBe(true);
  });

  it("custom role (Infinity) cannot manage admin (level 0)", () => {
    const actor = makeResolved({ systemKey: null, hierarchyLevel: Infinity });
    expect(canManageRole(actor, "admin")).toBe(false);
  });

  it("custom role (Infinity) cannot manage member (level 1)", () => {
    const actor = makeResolved({ systemKey: null, hierarchyLevel: Infinity });
    expect(canManageRole(actor, "member")).toBe(false);
  });

  it("custom role can manage other custom roles (Infinity <= Infinity)", () => {
    const actor = makeResolved({ systemKey: null, hierarchyLevel: Infinity });
    expect(canManageRole(actor, null)).toBe(true);
  });

  it("unknown systemKey target treated as lowest priority (Infinity)", () => {
    const actor = makeResolved({ hierarchyLevel: 0 });
    expect(canManageRole(actor, "some-unknown-key")).toBe(true);
  });
});

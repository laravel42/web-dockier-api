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
  canManageRole,
  type ResolvedAuth,
} from "../permissions/authorization.js";
import { PERMISSIONS, ASSIGNABLE_PERMISSIONS, OWNER_ONLY_PERMISSIONS, ALL_PERMISSIONS } from "../permissions/constants.js";

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

// ─── assignable permissions ────────────────────────────────────────
describe("ASSIGNABLE_PERMISSIONS", () => {
  it("leaves out the owner-only keys, which a role cannot grant", () => {
    for (const key of OWNER_ONLY_PERMISSIONS) expect(ASSIGNABLE_PERMISSIONS).not.toContain(key);
    expect(ASSIGNABLE_PERMISSIONS).toContain(PERMISSIONS.ROLE_MANAGE);
    expect(ASSIGNABLE_PERMISSIONS.length).toBe(ALL_PERMISSIONS.length - OWNER_ONLY_PERMISSIONS.length);
  });
});

// ─── canManageRole ─────────────────────────────────────────────────

describe("canManageRole", () => {
  it("admin (level 0) can manage member (level 1)", () => {
    const actor = makeResolved({ systemKey: "admin", hierarchyLevel: 0 });
    expect(canManageRole(actor, { systemKey: "member", permissions: [] })).toBe(true);
  });

  it("admin (level 0) can manage admin (same level)", () => {
    const actor = makeResolved({ systemKey: "admin", hierarchyLevel: 0 });
    expect(canManageRole(actor, { systemKey: "admin", permissions: [] })).toBe(true);
  });

  it("member (level 1) cannot manage admin (level 0)", () => {
    const actor = makeResolved({ systemKey: "member", hierarchyLevel: 1 });
    expect(canManageRole(actor, { systemKey: "admin", permissions: [] })).toBe(false);
  });

  it("member (level 1) can manage member (same level)", () => {
    const actor = makeResolved({ systemKey: "member", hierarchyLevel: 1 });
    expect(canManageRole(actor, { systemKey: "member", permissions: [] })).toBe(true);
  });

  it("admin can manage custom roles (null systemKey = Infinity level)", () => {
    const actor = makeResolved({ systemKey: "admin", hierarchyLevel: 0 });
    expect(canManageRole(actor, { systemKey: null, permissions: [] })).toBe(true);
  });

  it("member can manage custom roles (null systemKey = Infinity level)", () => {
    const actor = makeResolved({ systemKey: "member", hierarchyLevel: 1 });
    expect(canManageRole(actor, { systemKey: null, permissions: [] })).toBe(true);
  });

  it("custom role (Infinity) cannot manage admin (level 0)", () => {
    const actor = makeResolved({ systemKey: null, hierarchyLevel: Infinity });
    expect(canManageRole(actor, { systemKey: "admin", permissions: [] })).toBe(false);
  });

  it("custom role (Infinity) cannot manage member (level 1)", () => {
    const actor = makeResolved({ systemKey: null, hierarchyLevel: Infinity });
    expect(canManageRole(actor, { systemKey: "member", permissions: [] })).toBe(false);
  });

  it("custom role can manage other custom roles (Infinity <= Infinity)", () => {
    const actor = makeResolved({ systemKey: null, hierarchyLevel: Infinity });
    expect(canManageRole(actor, { systemKey: null, permissions: [] })).toBe(true);
  });

  it("custom role with user:manage cannot manage a custom role holding a permission it lacks", () => {
    const actor = makeResolved({ systemKey: null, hierarchyLevel: Infinity, permissions: [PERMISSIONS.USER_MANAGE] });
    expect(canManageRole(actor, { systemKey: null, permissions: [PERMISSIONS.USER_MANAGE, PERMISSIONS.BILLING_MANAGE] })).toBe(false);
    expect(canManageRole(actor, { systemKey: null, permissions: [PERMISSIONS.USER_MANAGE] })).toBe(true);
  });
  it("admin cannot manage a custom role holding a permission the admin lacks", () => {
    const actor = makeResolved({ systemKey: "admin", hierarchyLevel: 0, permissions: [PERMISSIONS.PROJECT_VIEW] });
    expect(canManageRole(actor, { systemKey: null, permissions: [PERMISSIONS.BILLING_MANAGE] })).toBe(false);
  });
  it("the owner can manage any role", () => {
    const actor = makeResolved({ isOwner: true, permissions: [] });
    expect(canManageRole(actor, { systemKey: null, permissions: [PERMISSIONS.BILLING_MANAGE] })).toBe(true);
  });
  it("unknown systemKey target treated as lowest priority (Infinity)", () => {
    const actor = makeResolved({ hierarchyLevel: 0 });
    expect(canManageRole(actor, { systemKey: "some-unknown-key", permissions: [] })).toBe(true);
  });
});

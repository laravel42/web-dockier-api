/**
 * Default Role Templates — Unit Tests
 *
 * Covers template lookup and the hierarchy levels that the privilege-escalation
 * gate depends on. `canManageRole` (permissions/authorization.ts:232) is the
 * consumer: it computes `getHierarchyLevel(targetSystemKey)` and allows the
 * action only when `actor.hierarchyLevel <= targetLevel`. The escalation cases
 * below replicate exactly that comparison, so they stay honest about the real
 * call semantics without pulling in authorization.ts's Supabase dependency.
 *
 * These tests pin EXISTING behaviour.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROLE_TEMPLATES,
  SYSTEM_ROLE_KEYS,
  getRoleTemplate,
  getHierarchyLevel,
  type SystemRoleKey,
} from "../role-templates.js";

describe("SYSTEM_ROLE_KEYS", () => {
  it("exposes exactly the admin and member keys", () => {
    expect(SYSTEM_ROLE_KEYS).toEqual({ ADMIN: "admin", MEMBER: "member" });
  });

  it("has one template per system key", () => {
    expect(DEFAULT_ROLE_TEMPLATES.map((t) => t.systemKey)).toEqual(["admin", "member"]);
  });
});

describe("getRoleTemplate", () => {
  it.each(Object.values(SYSTEM_ROLE_KEYS))("returns the template for %s", (key) => {
    const template = getRoleTemplate(key);
    expect(template?.systemKey).toBe(key);
    expect(template?.isSystem).toBe(true);
  });

  it("returns a template whose permissions are non-empty", () => {
    expect(getRoleTemplate(SYSTEM_ROLE_KEYS.ADMIN)?.permissions.length).toBeGreaterThan(0);
    expect(getRoleTemplate(SYSTEM_ROLE_KEYS.MEMBER)?.permissions.length).toBeGreaterThan(0);
  });

  it("grants admin a strict superset of member's permissions", () => {
    const admin = getRoleTemplate(SYSTEM_ROLE_KEYS.ADMIN)!;
    const member = getRoleTemplate(SYSTEM_ROLE_KEYS.MEMBER)!;
    for (const permission of member.permissions) {
      expect(admin.permissions).toContain(permission);
    }
    expect(admin.permissions.length).toBeGreaterThan(member.permissions.length);
  });

  it("returns undefined for an unknown key", () => {
    expect(getRoleTemplate("owner" as SystemRoleKey)).toBeUndefined();
  });

  it("marks admin as non-deletable and member as deletable", () => {
    expect(getRoleTemplate(SYSTEM_ROLE_KEYS.ADMIN)?.isDeletable).toBe(false);
    expect(getRoleTemplate(SYSTEM_ROLE_KEYS.MEMBER)?.isDeletable).toBe(true);
  });
});

describe("getHierarchyLevel", () => {
  it("returns 0 for admin (most powerful)", () => {
    expect(getHierarchyLevel(SYSTEM_ROLE_KEYS.ADMIN)).toBe(0);
  });

  it("returns 1 for member", () => {
    expect(getHierarchyLevel(SYSTEM_ROLE_KEYS.MEMBER)).toBe(1);
  });

  it("returns Infinity for null (custom role with no system key)", () => {
    expect(getHierarchyLevel(null)).toBe(Infinity);
  });

  it("returns Infinity for an empty string", () => {
    expect(getHierarchyLevel("")).toBe(Infinity);
  });

  it("returns Infinity for an unknown key", () => {
    expect(getHierarchyLevel("super-admin")).toBe(Infinity);
  });

  it("orders admin strictly above member", () => {
    expect(getHierarchyLevel("admin")).toBeLessThan(getHierarchyLevel("member"));
  });

  it("orders every system role above unknown keys", () => {
    for (const key of Object.values(SYSTEM_ROLE_KEYS)) {
      expect(getHierarchyLevel(key)).toBeLessThan(getHierarchyLevel("custom"));
    }
  });
});

describe("privilege-escalation gate (canManageRole's comparison)", () => {
  /** The exact predicate from permissions/authorization.ts:232-235. */
  const canManage = (actorLevel: number, targetSystemKey: string | null): boolean =>
    actorLevel <= getHierarchyLevel(targetSystemKey);

  it("lets admin manage member (lower level)", () => {
    expect(canManage(getHierarchyLevel("admin"), "member")).toBe(true);
  });

  it("lets admin manage admin — equal levels are allowed, not refused", () => {
    expect(canManage(getHierarchyLevel("admin"), "admin")).toBe(true);
  });

  it("refuses member managing admin (higher level)", () => {
    expect(canManage(getHierarchyLevel("member"), "admin")).toBe(false);
  });

  it("refuses a custom role (Infinity) managing any system role", () => {
    expect(canManage(Infinity, "admin")).toBe(false);
    expect(canManage(Infinity, "member")).toBe(false);
  });

  it("lets any role manage a custom role, since Infinity is the weakest level", () => {
    expect(canManage(getHierarchyLevel("admin"), null)).toBe(true);
    expect(canManage(getHierarchyLevel("member"), null)).toBe(true);
    expect(canManage(Infinity, null)).toBe(true);
  });
});

describe("assignment gate (membership.ts's strict comparison)", () => {
  /**
   * services/auth/domain/membership.ts:152-155 uses a STRICTER form than
   * canManageRole: it refuses only when `targetLevel < actorLevel`, i.e. the
   * target is more powerful. Equal levels pass, matching canManageRole.
   */
  const canAssign = (actorLevel: number, targetSystemKey: string | null): boolean =>
    !(getHierarchyLevel(targetSystemKey) < actorLevel);

  it("refuses assigning admin as a member", () => {
    expect(canAssign(getHierarchyLevel("member"), "admin")).toBe(false);
  });

  it("allows assigning an equal-level role", () => {
    expect(canAssign(getHierarchyLevel("admin"), "admin")).toBe(true);
    expect(canAssign(getHierarchyLevel("member"), "member")).toBe(true);
  });

  it("allows an admin to assign anything", () => {
    expect(canAssign(getHierarchyLevel("admin"), "member")).toBe(true);
    expect(canAssign(getHierarchyLevel("admin"), null)).toBe(true);
  });
});

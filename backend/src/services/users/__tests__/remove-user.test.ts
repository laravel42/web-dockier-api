/**
 * removeUser must take a person out of ONE organization. Memberships cascade
 * from auth.users, so deleting the account is only safe when none is left.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TEST_TENANT_ID, TEST_USER_ID, TEST_ROLE_ID, createTestEnv } from "../../../shared/__tests__/test-helpers.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));
const mockFrom = vi.fn();
const deleteUser = vi.fn(async () => ({ error: null }));
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args), auth: { admin: { deleteUser } } },
}));
const { removeUser } = await import("../domain/users.js");

const TARGET = "22222222-2222-4222-8222-222222222222";
const actor = {
  userId: TEST_USER_ID, email: "a@test.com", tenantId: TEST_TENANT_ID, roleId: TEST_ROLE_ID,
  systemKey: "admin", permissions: [], isOwner: true, hierarchyLevel: 0,
};

/** A thenable query chain: every builder method returns itself; awaiting it or maybeSingle() yields `result`. */
function chain(result: { data: unknown; error: null }, calls: string[] = []) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "delete", "update", "limit"]) {
    c[m] = vi.fn((...args: unknown[]) => { calls.push(`${m}:${JSON.stringify(args)}`); return c; });
  }
  c.maybeSingle = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

function setup(remaining: Array<{ organization_id: string; status: string }>) {
  const usersCalls: string[] = [];
  let membershipCall = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "organization_memberships") {
      membershipCall += 1;
      // 1: target lookup, 2: delete, 3: remaining memberships
      if (membershipCall === 1) return chain({ data: { is_owner: false, roles: { system_key: "member" } }, error: null });
      if (membershipCall === 2) return chain({ data: null, error: null });
      return chain({ data: remaining, error: null });
    }
    if (table === "users") return chain({ data: null, error: null }, usersCalls);
    return chain({ data: null, error: null });
  });
  return usersCalls;
}

beforeEach(() => vi.clearAllMocks());

describe("removeUser", () => {
  it("keeps the account of someone who is still a member elsewhere", async () => {
    const usersCalls = setup([{ organization_id: "other-org", status: "active" }]);
    await removeUser({ userId: TARGET, tenantId: TEST_TENANT_ID, actorUserId: TEST_USER_ID, resolvedAuth: actor });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(usersCalls.some((c) => c.startsWith("delete"))).toBe(false);
    expect(usersCalls.find((c) => c.startsWith("update"))).toContain('"organization_id":"other-org"');
  });

  it("keeps the account when the only other membership is not active", async () => {
    setup([{ organization_id: "other-org", status: "invited" }]);
    await removeUser({ userId: TARGET, tenantId: TEST_TENANT_ID, actorUserId: TEST_USER_ID, resolvedAuth: actor });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the account once no membership is left", async () => {
    setup([]);
    await removeUser({ userId: TARGET, tenantId: TEST_TENANT_ID, actorUserId: TEST_USER_ID, resolvedAuth: actor });
    expect(deleteUser).toHaveBeenCalledWith(TARGET);
  });
});

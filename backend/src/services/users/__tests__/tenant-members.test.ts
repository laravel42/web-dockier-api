/** getUser / updateUser / listUsers decide tenant membership by membership rows, not users.organization_id. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TEST_TENANT_ID, TEST_USER_ID, createTestEnv } from "../../../shared/__tests__/test-helpers.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const userRow = {
  id: TEST_USER_ID,
  email: "a@test.com",
  name: "A",
  avatar_url: null,
  country: "",
  language: "en",
  timezone: "UTC",
  organization_id: OTHER_ORG, // last-signed-in org differs from the tenant being asked about
  created_at: "2024-01-01T00:00:00",
};

let membershipRow: unknown = null;
let legacyRow: unknown = null;
const mockRpc = vi.fn();

function table(name: string) {
  const result = () => {
    if (name === "organization_memberships") return { data: membershipRow, error: null };
    return { data: legacyRow ?? userRow, error: null };
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "update"]) chain[m] = () => chain;
  chain.maybeSingle = async () =>
    name === "users" ? { data: legacyRow, error: null } : result();
  chain.single = async () => ({ data: userRow, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return chain;
}

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (t: string) => table(t), rpc: (...a: unknown[]) => mockRpc(...a), auth: { admin: {} } },
}));

const { getUser, listUsers } = await import("../domain/users.js");

beforeEach(() => {
  membershipRow = null;
  legacyRow = null;
  mockRpc.mockReset();
});

describe("tenant membership", () => {
  it("getUser rejects someone with no membership and another organization_id", async () => {
    await expect(getUser(TEST_USER_ID, TEST_TENANT_ID)).rejects.toThrow("User not found");
  });

  it("getUser allows a multi-org member whose organization_id points elsewhere", async () => {
    membershipRow = { id: "m1" };
    const user = await getUser(TEST_USER_ID, TEST_TENANT_ID);
    expect(user.tenantId).toBe(TEST_TENANT_ID);
  });

  it("listUsers reads the page through the RPC and takes the total from total_count", async () => {
    mockRpc.mockResolvedValue({ data: [{ ...userRow, total_count: 7 }], error: null });
    const res = await listUsers({ tenantId: TEST_TENANT_ID, search: "a", limit: 10, offset: 0 });
    expect(mockRpc).toHaveBeenCalledWith(
      "list_tenant_users",
      expect.objectContaining({ p_tenant: TEST_TENANT_ID, p_search: "a" }),
    );
    expect(res.total).toBe(7);
    expect(res.users[0]?.tenantId).toBe(TEST_TENANT_ID);
  });
});

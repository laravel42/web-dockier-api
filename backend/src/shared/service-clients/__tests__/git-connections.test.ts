import { describe, expect, it, vi } from "vitest";

const filters: Array<[string, string]> = [];
vi.mock("../../supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: (col: string, value: string) => { filters.push([col, value]); return chain; },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  },
}));
vi.mock("../../logger.js", () => ({ logger: { warn: vi.fn() } }));
const { getGitConnectionCredentials } = await import("../git-connections.js");

describe("getGitConnectionCredentials", () => {
  it("looks the connection up within the tenant only", async () => {
    await getGitConnectionCredentials("conn-1", "org-1");
    expect(filters).toEqual([["id", "conn-1"], ["organization_id", "org-1"]]);
  });

  it("returns nothing without a tenant", async () => {
    filters.length = 0;
    await expect(getGitConnectionCredentials("conn-1", "")).resolves.toBeNull();
    expect(filters).toEqual([]);
  });
});

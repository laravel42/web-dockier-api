import { describe, expect, it, vi } from "vitest";

const filters: Array<[string, string]> = [];
vi.mock("../../supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: (col: string, value: string) => { filters.push([col, value]); return chain; },
        maybeSingle: async () => ({ data: { settings: { deployScript: "npm run migrate" }, platform: "laravel" }, error: null }),
      };
      return chain;
    },
  },
}));
vi.mock("../../logger.js", () => ({ logger: { warn: vi.fn() } }));
const { getProjectDeployConfig } = await import("../projects.js");

describe("getProjectDeployConfig", () => {
  it("looks the project up within the tenant only", async () => {
    const config = await getProjectDeployConfig("proj-1", "org-1");
    expect(config).toMatchObject({ platform: "laravel", deployScript: "npm run migrate" });
    expect(filters).toEqual([["id", "proj-1"], ["organization_id", "org-1"]]);
  });

  it("returns nothing, without querying, when the tenant or project is missing", async () => {
    filters.length = 0;
    await expect(getProjectDeployConfig("proj-1", "")).resolves.toBeNull();
    await expect(getProjectDeployConfig("", "org-1")).resolves.toBeNull();
    expect(filters).toEqual([]);
  });
});

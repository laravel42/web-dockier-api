/**
 * deleteProvider / updateProvider check ownership first, then write by id. The write
 * carries the tenant too, so dropping or reordering the check cannot reach another
 * tenant's rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv({ ENV_ENCRYPTION_KEY: "c".repeat(64) }) }));
vi.mock("../../../../lib/provider-credentials.js", () => ({ hasUsableCredential: () => true, buildProviderCredential: vi.fn() }));

const writes: Array<{ table: string; op: string; filters: Array<[string, unknown]> }> = [];
const providerRow = { id: "prov-1", organization_id: "org-1", provider: "aws", label: "L", region: "us-east-1", created_at: "x", credentials: {}, credentials_encrypted: null };
vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const entry = { table, op: "select", filters: [] as Array<[string, unknown]> };
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => { entry.op = "update"; writes.push(entry); return chain; },
        delete: () => { entry.op = "delete"; writes.push(entry); return chain; },
        eq: (col: string, value: unknown) => { entry.filters.push([col, value]); return chain; },
        single: async () => ({ data: providerRow, error: null }),
        maybeSingle: async () => ({ data: providerRow, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [providerRow], error: null }),
      };
      return chain;
    },
  },
}));

const { deleteProvider, updateProvider } = await import("../providers.js");

beforeEach(() => { writes.length = 0; });

describe("provider writes are tenant-scoped", () => {
  it("deleteProvider deletes the deployments and the provider within the tenant", async () => {
    await deleteProvider("prov-1", "org-1");
    const deletes = writes.filter((w) => w.op === "delete");
    expect(deletes.map((d) => d.table)).toEqual(["deployments", "server_providers"]);
    for (const d of deletes) expect(d.filters).toContainEqual(["organization_id", "org-1"]);
  });

  it("updateProvider updates within the tenant", async () => {
    await updateProvider({ providerId: "prov-1", tenantId: "org-1", label: "New" });
    const update = writes.find((w) => w.op === "update")!;
    expect(update.table).toBe("server_providers");
    expect(update.filters).toContainEqual(["organization_id", "org-1"]);
  });
});

/**
 * listRoles reads every role_permissions row. Fetched in one request, roles ×
 * permissions passed PostgREST's 1000-row cap at ~34 full roles, and the roles
 * past the cut were listed with permissions missing.
 */
import { describe, it, expect, vi } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

const ROLES = Array.from({ length: 40 }, (_, i) => ({
  id: `role-${String(i).padStart(2, "0")}`, name: `Role ${i}`, description: "", system_key: null,
  is_system: false, is_editable: true, is_deletable: true,
}));
const PERMS = Array.from({ length: 30 }, (_, i) => `perm:${String(i).padStart(2, "0")}`);
const ROWS = ROLES.flatMap((r) => PERMS.map((p) => ({ role_id: r.id, permission_id: p }))); // 1200 rows

function chain(result: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order"]) c[m] = () => c;
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok);
  // Like PostgREST: a range is honoured up to 1000 rows per response.
  c.range = (from: number, to: number) => Promise.resolve({ data: ROWS.slice(from, Math.min(to + 1, from + 1000)), error: null });
  return c;
}

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => chain(() => (table === "roles" ? { data: ROLES, error: null } : { data: ROWS.slice(0, 1000), error: null })),
  },
}));

const { listRoles } = await import("../domain/roles.js");

describe("listRoles", () => {
  it("gives every role all of its permissions past the 1000-row cap", async () => {
    const { roles } = await listRoles("org-1");

    expect(roles).toHaveLength(40);
    expect(roles.at(-1)?.permissions).toHaveLength(30);
    expect(roles.every((r) => r.permissions.length === 30)).toBe(true);
  });
});

/**
 * System custom rules are shared by every organization (organization_id = '').
 * Toggling one used to UPDATE that shared row, so one organization's admin turned
 * the rule off or on for everyone. The toggle is now a per-organization override.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SYSTEM_RULE = { id: "row-sys", organization_id: "", type: "custom", rule_id: "custom.secrets.aws-key" };
const OWN_RULE = { id: "row-own", organization_id: "org-a", type: "custom", rule_id: "custom.mine" };

let fetched: Record<string, unknown> = SYSTEM_RULE;
const updates: Array<{ table: string; payload: unknown }> = [];

const listRows = (org: string) =>
  org === ""
    ? [{ ...SYSTEM_RULE, severity: "ERROR", message: "AWS key", pattern: "AKIA", extensions: [], enabled: true, yaml_content: null, created_at: "t" }]
    : [];

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => {
        let org = "";
        const q = {
          eq: (col: string, v: string) => { if (col === "organization_id") org = v; return q; },
          order: () => Promise.resolve({ data: listRows(org), error: null }),
          single: () => Promise.resolve({ data: fetched, error: null }),
        };
        return q;
      },
      update: (payload: unknown) => {
        updates.push({ table, payload });
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));
vi.mock("../seed-custom-rules.js", () => ({ seedCustomRules: vi.fn(async () => {}) }));
vi.mock("../scans.js", () => ({
  CodeAnalysisError: class extends Error {
    constructor(message: string, public code: string) { super(message); }
  },
}));

const overrides = vi.hoisted(() => ({ list: vi.fn(), upsert: vi.fn() }));
vi.mock("../rule-overrides.js", () => ({
  listRuleOverrides: overrides.list,
  upsertRuleOverride: overrides.upsert,
}));

const { updateCustomRule, listCustomRules } = await import("../custom-rules.js");

beforeEach(() => {
  updates.length = 0;
  overrides.list.mockReset().mockResolvedValue([]);
  overrides.upsert.mockReset().mockResolvedValue(undefined);
  fetched = SYSTEM_RULE;
});

describe("system custom rules are toggled per organization", () => {
  it("writes an override for the organization and leaves the shared row alone", async () => {
    await updateCustomRule({ ruleDbId: "row-sys", tenantId: "org-a", enabled: false });
    expect(overrides.upsert).toHaveBeenCalledWith({
      tenantId: "org-a", tool: "custom", ruleId: "custom.secrets.aws-key", enabled: false,
    });
    expect(updates).toEqual([]);
  });

  it("lists a system rule as this organization's override says, defaulting to the shared value", async () => {
    overrides.list.mockResolvedValue([{ id: "o1", ruleId: "custom.secrets.aws-key", enabled: false }]);
    const [rule] = await listCustomRules({ tenantId: "org-a" });
    expect(overrides.list).toHaveBeenCalledWith("org-a", "custom");
    expect(rule).toMatchObject({ isSystem: true, enabled: false });

    overrides.list.mockResolvedValue([]); // another organization, no override
    const [other] = await listCustomRules({ tenantId: "org-b" });
    expect(other).toMatchObject({ isSystem: true, enabled: true });
  });

  it("still updates the organization's own rule in place", async () => {
    fetched = OWN_RULE;
    await updateCustomRule({ ruleDbId: "row-own", tenantId: "org-a", enabled: false });
    expect(updates).toEqual([{ table: "custom_rules", payload: { enabled: false } }]);
    expect(overrides.upsert).not.toHaveBeenCalled();
  });
});

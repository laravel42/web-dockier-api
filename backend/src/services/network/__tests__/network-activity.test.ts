/**
 * Basic Auth rules and redirects in the project's activity. The UI had labels for
 * security rules but nothing recorded them; redirects had no event type at all.
 * A delete returns what it removed, so the line can name it.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, createTestEnv, setupPermissionMocks } from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));
const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a), auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() } },
}));
const record = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/service-clients/activity.js", () => ({ safeRecordActivity: record }));
vi.mock("../../../shared/workers/config-apply.js", () => ({ enqueueNetworkApply: vi.fn(async () => {}) }));
const network = vi.hoisted(() => ({
  createSecurityRule: vi.fn(), deleteSecurityRule: vi.fn(), createRedirectRule: vi.fn(), deleteRedirectRule: vi.fn(),
  addSecurityRuleCredential: vi.fn(), deleteSecurityRuleCredential: vi.fn(),
}));
vi.mock("../domain/network.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...network }));

const PROJECT = "c9d0e1f2-9012-4234-abcd-999999999999";
const RULE = "aaaaaaaa-1111-4111-8111-111111111111";

let app: FastifyInstance;
beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("network");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
  setupPermissionMocks(mockFrom, { permissions: Object.values(PERMISSIONS) });
  const permissionChain = mockFrom.getMockImplementation()!;
  mockFrom.mockImplementation((table: string) => {
    if (table !== "projects") return permissionChain(table);
    const chain: Record<string, unknown> = { maybeSingle: async () => ({ data: { id: PROJECT, name: "p" }, error: null }) };
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    return chain;
  });
});

const call = (method: "POST" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url: `/projects/${PROJECT}/network/${url}`, headers: { authorization: authHeader() }, payload });

const recorded = () => record.mock.calls.map(([e]) => ({ eventType: e.eventType, description: e.description }));

describe("network rules in activity", () => {
  it("records a Basic Auth rule added and removed, naming it and where it applies", async () => {
    network.createSecurityRule.mockResolvedValue({ id: RULE, projectId: PROJECT, name: "Staff", path: "/admin", credentials: [], createdAt: "", updatedAt: "" });
    network.deleteSecurityRule.mockResolvedValue({ name: "Staff", path: null });
    expect((await call("POST", "security-rules", { name: "Staff", path: "/admin" })).statusCode).toBe(200);
    expect((await call("DELETE", `security-rules/${RULE}`)).statusCode).toBe(200);
    expect(recorded()).toEqual([
      { eventType: "security_rule_added", description: 'Added Basic Auth rule "Staff" on /admin' },
      { eventType: "security_rule_removed", description: 'Removed Basic Auth rule "Staff" on the whole site' },
    ]);
  });

  it("records a redirect added and removed", async () => {
    network.createRedirectRule.mockResolvedValue({ id: RULE, projectId: PROJECT, fromPath: "/old", toPath: "/new", type: "permanent", createdAt: "", updatedAt: "" });
    network.deleteRedirectRule.mockResolvedValue({ fromPath: "/old", toPath: "/new" });
    await call("POST", "redirect-rules", { fromPath: "/old", toPath: "/new", type: "permanent" });
    await call("DELETE", `redirect-rules/${RULE}`);
    expect(recorded()).toEqual([
      { eventType: "redirect_added", description: "Added redirect /old → /new" },
      { eventType: "redirect_removed", description: "Removed redirect /old → /new" },
    ]);
  });

  // Who can get in changed; the response still carries only the credential.
  it("records a Basic Auth user added and removed, naming the user and the rule", async () => {
    network.addSecurityRuleCredential.mockResolvedValue({
      credential: { id: RULE, username: "ana", createdAt: "2026-11-18T00:00:00.000Z" }, ruleName: "Staff",
    });
    network.deleteSecurityRuleCredential.mockResolvedValue({ username: "ana", ruleName: "Staff" });
    const added = await call("POST", `security-rules/${RULE}/credentials`, { username: "ana", password: "s3cret-pass" });
    expect(added.json()).toEqual({ id: RULE, username: "ana", createdAt: "2026-11-18T00:00:00.000Z" });
    await call("DELETE", `security-rules/${RULE}/credentials/${RULE}`);
    expect(recorded()).toEqual([
      { eventType: "security_rule_user_added", description: 'Added user "ana" to Basic Auth rule "Staff"' },
      { eventType: "security_rule_user_removed", description: 'Removed user "ana" from Basic Auth rule "Staff"' },
    ]);
  });

  it("records nothing when the delete finds no rule", async () => {
    const { NetworkError } = await import("../domain/network.js");
    network.deleteSecurityRule.mockRejectedValue(new NetworkError("Security rule not found", "not_found"));
    expect((await call("DELETE", `security-rules/${RULE}`)).statusCode).toBe(404);
    expect(record).not.toHaveBeenCalled();
  });
});

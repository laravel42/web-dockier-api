import { describe, expect, it, vi } from "vitest";
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: { from: vi.fn(() => { throw new Error("no DB in this test"); }) } }));
import { createPMIntegration } from "../pm-integrations.js";
import { integrationRequestSchema, integrationCreateIssueSchema } from "../../schemas.js";

describe("createPMIntegration Jira host", () => {
  it.each(["http://acme.atlassian.net", "https://user:pw@acme.atlassian.net", "not a url"])("refuses %s before touching the database", async (host) => {
    await expect(createPMIntegration({ tenantId: "t", provider: "jira", name: "J", config: { host, email: "e", apiToken: "x" } }))
      .rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("integration request schemas", () => {
  it("refuse inline type+config without a stored integration", () => {
    expect(integrationRequestSchema.safeParse({ type: "jira", config: { host: "http://169.254.169.254" } }).success).toBe(false);
    expect(integrationRequestSchema.safeParse({ integrationId: "3f2b8a2e-1c4d-4e5f-9a6b-7c8d9e0f1a2b" }).success).toBe(true);
  });
  it("bounds priority to Linear's 0-4", () => {
    const base = { integrationId: "3f2b8a2e-1c4d-4e5f-9a6b-7c8d9e0f1a2b", teamId: "t", projectId: "p", title: "x" };
    expect(integrationCreateIssueSchema.safeParse({ ...base, priority: 2 }).success).toBe(true);
    expect(integrationCreateIssueSchema.safeParse({ ...base, priority: 9 }).success).toBe(false);
  });
});

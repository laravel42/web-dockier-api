import { afterEach, describe, expect, it, vi } from "vitest";
import { linearProvider } from "../providers/linear.js";
import { jiraProvider } from "../providers/jira.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as { query: string; variables: Record<string, unknown> };
}

describe("Linear", () => {
  it("passes ids as GraphQL variables, so a quote cannot extend the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { data: { team: { projects: { nodes: [] } } } }));
    vi.stubGlobal("fetch", fetchMock);
    const evil = 'x") { id } teamDelete(id: "T") { success } a: team(id: "y';
    await linearProvider.listTeamProjects!({ apiKey: "k" }, evil);
    const { query, variables } = sentBody(fetchMock);
    expect(query).not.toContain("teamDelete");
    expect(variables).toEqual({ teamId: evil });
  });

  it("sends issue fields as one input variable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { data: { issueCreate: { success: true, issue: { id: "1", identifier: "ENG-1", url: "u" } } } }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await linearProvider.createIssue({
      type: "linear", config: { apiKey: "k" }, teamId: 'T"', projectId: "P", title: "t", description: "d", priority: 2, estimateMinutes: 45, assigneeId: "A",
    });
    expect(out.issueKey).toBe("ENG-1");
    const { query, variables } = sentBody(fetchMock);
    expect(query).not.toContain('T"');
    expect(variables.input).toEqual({ teamId: 'T"', projectId: "P", title: "t", description: "d", priority: 2, estimate: 2, assigneeId: "A" });
  });

  it("surfaces a rejected API key instead of an empty team list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, {})));
    await expect(linearProvider.listTeams({ apiKey: "bad" })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("Jira", () => {
  it("refuses a host on an internal address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(jiraProvider.listTeams({ host: "http://169.254.169.254", email: "e", apiToken: "t" })).rejects.toMatchObject({ code: "bad_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a rate limit to service_unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(429, {})));
    await expect(jiraProvider.listTeams({ host: "https://8.8.8.8", email: "e", apiToken: "t" })).rejects.toMatchObject({ code: "service_unavailable" });
  });
});

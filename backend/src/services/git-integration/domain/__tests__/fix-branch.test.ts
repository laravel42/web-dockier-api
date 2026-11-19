import { afterEach, describe, expect, it, vi } from "vitest";
import { commitFixToBranch } from "../ai/fix-branch.js";

const conn = { provider: "github", personal_token: "t", endpoint: null };
const input = { owner: "o", repo: "r", baseBranch: "develop", filePath: "src/a.ts", fixedContent: "x", commitMessage: "m", ruleId: "rule" };
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("commitFixToBranch (GitHub)", () => {
  it("branches from the finding's branch, not the repo default", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/git/ref/heads/")) return json(200, { object: { sha: "abc" } });
      if (url.includes("/contents/")) return json(200, { sha: "f1" });
      return json(201);
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await commitFixToBranch(conn, input);
    expect(out.targetBranch).toBe("develop");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/git/ref/heads/develop"))).toBe(true);
    expect(urls.some((u) => /\/repos\/o\/r$/.test(u))).toBe(false);
  });

  it("deletes the new branch when the commit fails", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/git/ref/heads/")) return json(200, { object: { sha: "abc" } });
      if (url.includes("/contents/") && init?.method === "PUT") return json(409, { message: "conflict" });
      if (url.includes("/contents/")) return json(200, { sha: "f1" });
      return json(init?.method === "DELETE" ? 204 : 201);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(commitFixToBranch(conn, input)).rejects.toThrow("conflict");
    const deleted = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "DELETE");
    expect(String(deleted?.[0])).toMatch(/\/git\/refs\/heads\/dockier\/fix-rule-/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGitHubLinkNext, listRepos, ProviderApiError, type ConnectionLike } from "../providers/provider-client.js";

describe("parseGitHubLinkNext", () => {
  it("returns the next page URL from a GitHub Link header", () => {
    const header =
      '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next", ' +
      '<https://api.github.com/user/repos?per_page=100&page=5>; rel="last"';
    expect(parseGitHubLinkNext(header)).toBe("https://api.github.com/user/repos?per_page=100&page=2");
  });

  it("returns null when there is no next link", () => {
    expect(parseGitHubLinkNext('<https://api.github.com/user/repos?per_page=100&page=1>; rel="last"')).toBeNull();
    expect(parseGitHubLinkNext(null)).toBeNull();
  });
});

// ─── GitLab repo listing (fine-grained token fallback) ─────────────

function gitlabRes(opts: {
  ok: boolean;
  status?: number;
  jsonData?: unknown;
  text?: string;
  nextPage?: string | null;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    statusText: "",
    json: async () => opts.jsonData ?? {},
    text: async () => opts.text ?? "",
    headers: { get: (k: string) => (k === "X-Next-Page" ? (opts.nextPage ?? null) : null) },
  } as unknown as Response;
}

const gitlabConn: ConnectionLike = { provider: "gitlab", personal_token: "tok", endpoint: null };

describe("listRepos (GitLab)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("lists projects via the membership endpoint for a classic token", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/projects?membership=true")) {
        return Promise.resolve(gitlabRes({
          ok: true,
          jsonData: [{ name: "App", path_with_namespace: "grp/app", web_url: "https://gitlab.com/grp/app", default_branch: "dev", visibility: "private" }],
        }));
      }
      return Promise.resolve(gitlabRes({ ok: false, status: 500 }));
    });

    const repos = await listRepos(gitlabConn);

    expect(repos).toEqual([
      { name: "App", fullName: "grp/app", url: "https://gitlab.com/grp/app", defaultBranch: "dev", private: true },
    ]);
    // Never needed the associations fallback.
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("associations"))).toBe(true);
  });

  it("falls back to token associations when the membership endpoint returns 403", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/projects?membership=true")) {
        return Promise.resolve(gitlabRes({ ok: false, status: 403, text: "insufficient_scope" }));
      }
      if (url.includes("/personal_access_tokens/self/associations")) {
        return Promise.resolve(gitlabRes({
          ok: true,
          jsonData: { projects: [{ name: "Svc", path_with_namespace: "grp/svc" }] },
        }));
      }
      return Promise.resolve(gitlabRes({ ok: false, status: 500 }));
    });

    const repos = await listRepos(gitlabConn);

    expect(repos).toEqual([
      // web_url/default_branch/visibility absent → constructed url, "main", private default.
      { name: "Svc", fullName: "grp/svc", url: "https://gitlab.com/grp/svc", defaultBranch: "main", private: true },
    ]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("associations"))).toBe(true);
  });

  it("throws a forbidden ProviderApiError with GitLab's message when both membership (403) and associations fail", async () => {
    const body = JSON.stringify({
      error: "insufficient_granular_scope",
      error_description:
        "Access denied: This operation requires a fine-grained personal access token with the following user permissions: [Project: Read].",
    });
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/projects?membership=true")) {
        return Promise.resolve(gitlabRes({ ok: false, status: 403, text: body }));
      }
      return Promise.resolve(gitlabRes({ ok: false, status: 403, text: body }));
    });

    const err = await listRepos(gitlabConn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderApiError);
    expect((err as InstanceType<typeof ProviderApiError>).code).toBe("forbidden");
    // The provider's own actionable detail is surfaced (not the raw JSON envelope).
    expect((err as Error).message).toContain("[Project: Read]");
    // And an actionable hint naming the required User-boundary grant.
    expect((err as Error).message).toContain("User boundary");
    expect((err as Error).message).toContain("Project: Read");
  });

  it("passes the search term to GitLab and honors perPage/maxPages", async () => {
    fetchMock.mockResolvedValue(gitlabRes({
      ok: true,
      jsonData: [{ name: "Api", path_with_namespace: "grp/api", visibility: "public" }],
    }));

    const repos = await listRepos(gitlabConn, { search: "api", perPage: 20, maxPages: 1 });

    expect(repos).toHaveLength(1);
    expect(repos[0].private).toBe(false); // visibility "public"
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("search=api");
    expect(url).toContain("per_page=20");
    // maxPages: 1 → exactly one request.
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("filters associations results locally by the search term", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/projects?membership=true")) {
        return Promise.resolve(gitlabRes({ ok: false, status: 403, text: "denied" }));
      }
      return Promise.resolve(gitlabRes({
        ok: true,
        jsonData: {
          projects: [
            { name: "Api", path_with_namespace: "grp/api" },
            { name: "Web", path_with_namespace: "grp/web" },
          ],
        },
      }));
    });

    const repos = await listRepos(gitlabConn, { search: "web", maxPages: 1 });

    expect(repos.map((r) => r.fullName)).toEqual(["grp/web"]);
  });

  it("maps a non-403 membership error to the right domain code without the associations fallback", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/projects?membership=true")) {
        return Promise.resolve(gitlabRes({ ok: false, status: 401, text: "unauthorized" }));
      }
      return Promise.resolve(gitlabRes({ ok: false, status: 500 }));
    });

    const err = await listRepos(gitlabConn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderApiError);
    expect((err as InstanceType<typeof ProviderApiError>).code).toBe("unauthorized");
    expect((err as Error).message).toContain("GitLab API error 401");
    // A 401 is not a scope problem — no associations fallback attempted.
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("associations"))).toBe(true);
  });
});

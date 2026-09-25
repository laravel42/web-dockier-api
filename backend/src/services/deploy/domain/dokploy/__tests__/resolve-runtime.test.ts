import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the git boundaries so the resolver runs offline.
const mockGetCreds = vi.fn();
const mockFetchRepoFile = vi.fn();

vi.mock("../../../../../shared/service-clients/git-connections.js", () => ({
  getGitConnectionCredentials: (...a: unknown[]) => mockGetCreds(...a),
}));
vi.mock("../../../../git-integration/domain/providers/provider-client.js", () => ({
  fetchRepoFile: (...a: unknown[]) => mockFetchRepoFile(...a),
}));

const { resolveRuntimeStartCommand } = await import("../stages/resolve-runtime.js");

const log = async () => {};

/** Serialize a package.json for the fetch mock. */
function pkg(opts: { deps?: Record<string, string>; scripts?: Record<string, string> }): string {
  return JSON.stringify({ dependencies: opts.deps ?? {}, scripts: opts.scripts ?? {} });
}

describe("resolveRuntimeStartCommand", () => {
  beforeEach(() => {
    mockGetCreds.mockResolvedValue({ provider: "github", token: "t", endpoint: null });
    mockFetchRepoFile.mockResolvedValue(null);
  });

  afterEach(() => vi.clearAllMocks());

  it("prefers an explicit start command and skips repo fetching entirely", async () => {
    const result = await resolveRuntimeStartCommand({
      gitConnectionId: "g1",
      repo: "acme/app",
      branch: "main",
      explicit: "node server.mjs",
      log,
    });
    expect(result.startCommand).toBe("node server.mjs");
    expect(mockGetCreds).not.toHaveBeenCalled();
    expect(mockFetchRepoFile).not.toHaveBeenCalled();
  });

  it("derives the start command for SSR Astro (@astrojs/node) with no start script", async () => {
    mockFetchRepoFile.mockImplementation(async (_c: unknown, _r: unknown, path: string) =>
      path === "package.json"
        ? pkg({ deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" }, scripts: { build: "astro build" } })
        : null,
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBe("node ./dist/server/entry.mjs");
    expect(result.framework).toBe("astro");
    expect(result.kind).toBe("server");
    expect(result.hasStartScript).toBe(false);
  });

  it("does NOT override when the repo already has a start script", async () => {
    mockFetchRepoFile.mockImplementation(async (_c: unknown, _r: unknown, path: string) =>
      path === "package.json"
        ? pkg({ deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" }, scripts: { build: "astro build", start: "node ./dist/server/entry.mjs" } })
        : null,
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBeUndefined();
    expect(result.kind).toBe("server");
    expect(result.hasStartScript).toBe(true);
  });

  it("does NOT override a low-confidence detection (non-Node server adapter)", async () => {
    mockFetchRepoFile.mockImplementation(async (_c: unknown, _r: unknown, path: string) =>
      path === "package.json"
        ? pkg({ deps: { astro: "^5.0.0", "@astrojs/vercel": "^8.0.0" }, scripts: { build: "astro build" } })
        : null,
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBeUndefined();
  });

  it("returns empty (no throw) when credentials are missing", async () => {
    mockGetCreds.mockResolvedValue(null);
    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result).toEqual({});
  });

  it("returns empty (no throw) when a fetch throws", async () => {
    mockFetchRepoFile.mockRejectedValue(new Error("network"));
    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBeUndefined();
  });
});

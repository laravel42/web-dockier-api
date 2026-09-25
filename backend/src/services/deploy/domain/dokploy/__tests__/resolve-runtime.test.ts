import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the git boundaries so the resolver runs offline. resolve-runtime now
// delegates to analyzeRepoRuntime, which fetches the file tree + file contents
// through the provider client — so we mock both getRepoFileTree and
// fetchRepoFile.
const mockGetCreds = vi.fn();
const mockFetchRepoFile = vi.fn();
const mockGetRepoFileTree = vi.fn();

vi.mock("../../../../../shared/service-clients/git-connections.js", () => ({
  getGitConnectionCredentials: (...a: unknown[]) => mockGetCreds(...a),
}));
vi.mock("../../../../git-integration/domain/providers/provider-client.js", () => ({
  fetchRepoFile: (...a: unknown[]) => mockFetchRepoFile(...a),
  getRepoFileTree: (...a: unknown[]) => mockGetRepoFileTree(...a),
}));

const { resolveRuntimeStartCommand } = await import("../stages/resolve-runtime.js");

const log = async () => {};

/** Serialize a package.json for the fetch mock. */
function pkg(opts: { deps?: Record<string, string>; scripts?: Record<string, string> }): string {
  return JSON.stringify({ dependencies: opts.deps ?? {}, scripts: opts.scripts ?? {} });
}

/**
 * Wire the mocks to serve a virtual repo: `tree` is the file list, `files` maps
 * path → contents.
 */
function serveRepo(tree: string[], files: Record<string, string>) {
  mockGetRepoFileTree.mockResolvedValue(tree);
  mockFetchRepoFile.mockImplementation(async (_c: unknown, _r: unknown, path: string) =>
    Object.prototype.hasOwnProperty.call(files, path) ? files[path] : null,
  );
}

describe("resolveRuntimeStartCommand", () => {
  beforeEach(() => {
    mockGetCreds.mockResolvedValue({ provider: "github", token: "t", endpoint: null });
    mockGetRepoFileTree.mockResolvedValue([]);
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
    expect(mockGetRepoFileTree).not.toHaveBeenCalled();
  });

  it("derives the start command for SSR Astro (@astrojs/node) with no start script", async () => {
    serveRepo(
      ["package.json", "astro.config.mjs"],
      { "package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" }, scripts: { build: "astro build" } }) },
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBe("node ./dist/server/entry.mjs");
    expect(result.framework).toBe("astro");
    expect(result.kind).toBe("server");
    expect(result.hasStartScript).toBe(false);
  });

  it("does NOT override when the repo already has a start script", async () => {
    serveRepo(
      ["package.json"],
      {
        "package.json": pkg({
          deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" },
          scripts: { build: "astro build", start: "node ./dist/server/entry.mjs" },
        }),
      },
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBeUndefined();
    expect(result.kind).toBe("server");
    expect(result.hasStartScript).toBe(true);
  });

  it("detects the node adapter from astro.config when the dep is missing from package.json", async () => {
    serveRepo(
      ["package.json", "astro.config.mjs"],
      {
        "package.json": pkg({ deps: { astro: "^5.0.0" }, scripts: { build: "astro build" } }),
        "astro.config.mjs": "import node from '@astrojs/node';\nexport default defineConfig({ output: 'server', adapter: node({ mode: 'standalone' }) });",
      },
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBe("node ./dist/server/entry.mjs");
    expect(result.kind).toBe("server");
  });

  it("flags a platform adapter and does not inject a start command", async () => {
    serveRepo(
      ["package.json", "astro.config.mjs"],
      {
        "package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/vercel": "^8.0.0" }, scripts: { build: "astro build" } }),
        "astro.config.mjs": "import vercel from '@astrojs/vercel';\nexport default defineConfig({ output: 'server', adapter: vercel() });",
      },
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBeUndefined();
    expect(result.platformAdapter).toBe(true);
  });

  it("does NOT override a static Astro site (no adapter, no server output)", async () => {
    serveRepo(
      ["package.json"],
      { "package.json": pkg({ deps: { astro: "^5.0.0" }, scripts: { build: "astro build" } }) },
    );

    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBeUndefined();
    expect(result.kind).toBe("static");
  });

  it("returns empty (no throw) when credentials are missing", async () => {
    mockGetCreds.mockResolvedValue(null);
    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result).toEqual({});
  });

  it("returns empty (no throw) when the tree fetch throws", async () => {
    mockGetRepoFileTree.mockRejectedValue(new Error("network"));
    const result = await resolveRuntimeStartCommand({ gitConnectionId: "g1", repo: "acme/app", branch: "main", log });
    expect(result.startCommand).toBeUndefined();
  });
});

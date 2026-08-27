import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DokployClient } from "../client.js";
import { DokployError } from "../types.js";

describe("DokployClient", () => {
  let client: DokployClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    client = new DokployClient({
      baseUrl: "https://dokploy.test/api",
      apiToken: "test-token",
      timeout: 5000,
      maxRetries: 2,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // ─── tRPC Response Unwrapping ────────────────────────────────────

  describe("tRPC response unwrapping", () => {
    it("unwraps data from tRPC envelope { result: { data: ... } }", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ result: { data: { projectId: "proj-1", name: "Test" } } }), { status: 200 }),
      );

      const result = await client.createProject({ name: "Test" });

      expect(result).toEqual({ projectId: "proj-1", name: "Test" });
    });

    it("returns raw JSON if no tRPC envelope present", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ projectId: "proj-1", name: "Test" }), { status: 200 }),
      );

      const result = await client.createProject({ name: "Test" });

      expect(result).toEqual({ projectId: "proj-1", name: "Test" });
    });

    it("sends correct Authorization header", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ result: { data: {} } }), { status: 200 }),
      );

      await client.createProject({ name: "Test" });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("sends mutations as POST with JSON body", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ result: { data: { projectId: "p1", name: "X", environments: [] } } }), { status: 200 }),
      );

      await client.createProject({ name: "My Project" });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://dokploy.test/api/project.create",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "My Project" }),
        }),
      );
    });

    it("sends queries as GET with URL-encoded input param", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ result: { data: { projectId: "p1" } } }), { status: 200 }),
      );

      await client.getProject("p1");

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("project.one?input=");
      expect(calledUrl).toContain(encodeURIComponent(JSON.stringify({ projectId: "p1" })));

      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect(opts.method).toBe("GET");
    });
  });

  // ─── Error Classification ────────────────────────────────────────

  describe("error classification", () => {
    it("throws DokployError with status code for 4xx responses (no retry)", async () => {
      fetchMock.mockResolvedValue(
        new Response("Not found", { status: 404, statusText: "Not Found" }),
      );

      await expect(client.getProject("invalid")).rejects.toThrow(DokployError);

      // Only 1 call — no retry on 4xx
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("preserves status code in DokployError", async () => {
      fetchMock.mockResolvedValue(
        new Response("Bad request", { status: 400, statusText: "Bad Request" }),
      );

      try {
        await client.createProject({ name: "" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DokployError);
        expect((err as DokployError).statusCode).toBe(400);
      }

      // Only 1 attempt — no retries for 4xx
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("includes endpoint in DokployError", async () => {
      fetchMock.mockResolvedValue(
        new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
      );

      try {
        await client.setupServer("srv-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DokployError);
        expect((err as DokployError).endpoint).toBe("server.setup");
      }
    });
  });

  // ─── Retry Logic ─────────────────────────────────────────────────
  // Use a zero-timeout client so retries don't actually wait

  describe("retry logic", () => {
    let fastClient: DokployClient;

    beforeEach(() => {
      // Spy on global setTimeout and make it resolve immediately for backoff sleeps
      vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: TimerHandler) => {
        if (typeof fn === "function") fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      });

      fastClient = new DokployClient({
        baseUrl: "https://dokploy.test/api",
        apiToken: "test-token",
        timeout: 30000, // high timeout so we don't hit abort
        maxRetries: 2,
      });
    });

    it("retries 5xx server errors", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response("Server Error", { status: 500, statusText: "Internal Server Error" }))
        .mockResolvedValueOnce(new Response("Server Error", { status: 502, statusText: "Bad Gateway" }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: { data: { projectId: "p1" } } }), { status: 200 }),
        );

      const result = await fastClient.getProject("p1");

      expect(result).toEqual({ projectId: "p1" });
      expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("retries on network errors (fetch rejection)", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: { data: { serverId: "s1" } } }), { status: 200 }),
        );

      const result = await fastClient.getServer("s1");

      expect(result).toEqual({ serverId: "s1" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws after all retries exhausted", async () => {
      fetchMock.mockResolvedValue(
        new Response("Server Error", { status: 500, statusText: "Internal Server Error" }),
      );

      await expect(fastClient.createProject({ name: "test" })).rejects.toThrow(/failed after 3 attempts/);

      // Initial attempt + 2 retries = 3 total
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("does not retry 4xx client errors", async () => {
      fetchMock.mockResolvedValue(
        new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
      );

      await expect(fastClient.listProjects()).rejects.toThrow(DokployError);

      // Single attempt — no retries
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Timeout Handling ────────────────────────────────────────────

  describe("timeout handling", () => {
    it("aborts request when timeout fires", async () => {
      // Create a client with a very short timeout and no retries
      const shortClient = new DokployClient({
        baseUrl: "https://dokploy.test/api",
        apiToken: "test-token",
        timeout: 10, // 10ms timeout
        maxRetries: 0,
      });

      // Simulate a fetch that rejects on abort (like a real network request would)
      fetchMock.mockImplementation((_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (opts.signal?.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          opts.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });

      await expect(shortClient.getProject("p1")).rejects.toThrow(/failed after 1 attempt/);
    });
  });

  // ─── API Method Coverage ─────────────────────────────────────────

  describe("API methods", () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ result: { data: {} } }), { status: 200 }),
      );
    });

    it("deploy sends correct mutation", async () => {
      await client.deploy({ applicationId: "app-1", title: "Deploy v1" });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://dokploy.test/api/application.deploy",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ applicationId: "app-1", title: "Deploy v1" }),
        }),
      );
    });

    it("triggerAIFix sends correct mutation", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ result: { data: { applied: true, summary: "Fixed env" } } }), { status: 200 }),
      );

      const result = await client.triggerAIFix("app-1");

      expect(result).toEqual({ applied: true, summary: "Fixed env" });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://dokploy.test/api/application.aiFixDeployment",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ applicationId: "app-1" }),
        }),
      );
    });

    it("saveBuildType sends correct mutation", async () => {
      await client.saveBuildType({ applicationId: "app-1", buildType: "nixpacks" });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://dokploy.test/api/application.saveBuildType",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ applicationId: "app-1", buildType: "nixpacks" }),
        }),
      );
    });

    it("saveEnvironment sends correct mutation", async () => {
      await client.saveEnvironment({ applicationId: "app-1", env: "NODE_ENV=production\nPORT=3000" });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://dokploy.test/api/application.saveEnvironment",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ applicationId: "app-1", env: "NODE_ENV=production\nPORT=3000" }),
        }),
      );
    });

    it("createServer sends correct mutation", async () => {
      await client.createServer({
        name: "prod-1",
        ipAddress: "10.0.0.1",
        port: 22,
        username: "root",
        sshKeyId: "key-1",
        serverType: "deploy",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://dokploy.test/api/server.create",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("listProjects sends correct query", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ result: { data: [{ projectId: "p1" }] } }), { status: 200 }),
      );

      const result = await client.listProjects();

      expect(result).toEqual([{ projectId: "p1" }]);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain("project.all?input=");
    });
  });
});

// ─── createDokployClient factory ───────────────────────────────────

describe("createDokployClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when DOKPLOY_API_URL is missing", async () => {
    vi.stubEnv("DOKPLOY_API_URL", "");
    vi.stubEnv("DOKPLOY_API_TOKEN", "token");

    const { createDokployClient } = await import("../client.js");

    expect(() => createDokployClient()).toThrow(/DOKPLOY_API_URL is required/);
  });

  it("throws when DOKPLOY_API_TOKEN is missing", async () => {
    vi.stubEnv("DOKPLOY_API_URL", "https://dokploy.test/api");
    vi.stubEnv("DOKPLOY_API_TOKEN", "");

    const { createDokployClient } = await import("../client.js");

    expect(() => createDokployClient()).toThrow(/DOKPLOY_API_TOKEN is required/);
  });
});

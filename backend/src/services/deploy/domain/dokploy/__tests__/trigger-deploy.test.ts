import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ai-recovery module
const mockInvokeDokployAI = vi.fn();
vi.mock("../stages/ai-recovery.js", () => ({
  invokeDokployAI: (...args: unknown[]) => mockInvokeDokployAI(...args),
}));

const { stageTriggerDeploy, stageDeployWithRetry } = await import("../stages/trigger-deploy.js");

import type { DokployClient } from "../client.js";

describe("stageTriggerDeploy", () => {
  let mockClient: {
    deploy: ReturnType<typeof vi.fn>;
    getApplication: ReturnType<typeof vi.fn>;
    listDeployments: ReturnType<typeof vi.fn>;
    listDomains: ReturnType<typeof vi.fn>;
    generateDomain: ReturnType<typeof vi.fn>;
    createDomain: ReturnType<typeof vi.fn>;
    updateDomain: ReturnType<typeof vi.fn>;
  };
  let logLines: string[];
  let mockLog: (line: string) => Promise<void>;

  beforeEach(() => {
    // Make setTimeout resolve immediately so sleep() doesn't actually wait
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: (...args: unknown[]) => void) => {
      if (typeof fn === "function") fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    mockClient = {
      deploy: vi.fn().mockResolvedValue(undefined),
      getApplication: vi.fn(),
      listDeployments: vi.fn().mockResolvedValue([]),
      listDomains: vi.fn().mockResolvedValue([]),
      generateDomain: vi.fn().mockResolvedValue("app-my-app-98-93-35-222.sslip.io"),
      createDomain: vi.fn().mockResolvedValue({ domainId: "dom-1", host: "app-my-app-98-93-35-222.sslip.io", https: false, port: 3000, path: "/", applicationId: "app-1" }),
      updateDomain: vi.fn().mockResolvedValue(undefined),
    };
    logLines = [];
    mockLog = async (line: string) => { logLines.push(line); };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns success when the deployment status becomes 'done'", async () => {
    // First call (pre-trigger snapshot) has no deployments; after trigger a new
    // one appears as "done".
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("done");
    expect(result.appUrl).toContain("my-app");
    expect(mockClient.deploy).toHaveBeenCalledWith({ applicationId: "app-1", title: "Dockier deploy" });
  });

  it("generates and registers a domain on success when the app has none", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });
    mockClient.listDomains.mockResolvedValue([]); // no existing domain

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(mockClient.generateDomain).toHaveBeenCalledWith("my-app", "srv-1");
    expect(mockClient.createDomain).toHaveBeenCalled();
    expect(result.appUrl).toBe("http://app-my-app-98-93-35-222.sslip.io");
  });

  it("registers the domain on the container port it is given", async () => {
    const run = async (containerPort?: number) => {
      mockClient.createDomain.mockClear();
      mockClient.listDeployments
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
      mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });
      mockClient.listDomains.mockResolvedValue([]);
      await stageTriggerDeploy({
        applicationId: "app-1",
        client: mockClient as unknown as DokployClient,
        log: mockLog,
        containerPort,
        pollIntervalMs: 100,
      });
      return (mockClient.createDomain.mock.calls.at(-1)?.[0] as { port: number }).port;
    };

    // PHP/static railpack resolves to 80 upstream; Node railpack to 3000.
    expect(await run(80)).toBe(80);
    expect(await run(3000)).toBe(3000);
    // Defaults to 3000 when not provided.
    expect(await run(undefined)).toBe(3000);
  });

  it("reuses an existing domain instead of generating a new one", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });
    mockClient.listDomains.mockResolvedValue([{ domainId: "dom-9", host: "existing.example.com", https: true, port: 443 }]);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      containerPort: 443,
      pollIntervalMs: 100,
    });

    expect(mockClient.generateDomain).not.toHaveBeenCalled();
    expect(result.appUrl).toBe("https://existing.example.com");
  });

  it("reconciles a reused domain whose port no longer matches the container", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });
    // Domain left over from a Caddy-on-80 build; the app now listens on 3000.
    mockClient.listDomains.mockResolvedValue([
      { domainId: "dom-9", host: "app.sslip.io", https: false, port: 80, path: "/", certificateType: "none" },
    ]);

    await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      containerPort: 3000,
      pollIntervalMs: 100,
    });

    expect(mockClient.updateDomain).toHaveBeenCalledWith(
      expect.objectContaining({ domainId: "dom-9", host: "app.sslip.io", port: 3000 }),
    );
    expect(logLines.some((l) => /updating to 3000/i.test(l))).toBe(true);
  });

  it("records an advisory when it corrects a stale domain port", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });
    mockClient.listDomains.mockResolvedValue([
      { domainId: "dom-9", host: "app.sslip.io", https: false, port: 80, path: "/", certificateType: "none" },
    ]);

    const advisories: Array<{ code: string }> = [];
    await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      containerPort: 3000,
      pollIntervalMs: 100,
      advise: (a) => advisories.push(a),
    });

    expect(advisories.map((a) => a.code)).toContain("domain-port-corrected");
  });

  it("does not fail when reconciling the domain port errors", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });
    mockClient.listDomains.mockResolvedValue([
      { domainId: "dom-9", host: "app.sslip.io", https: false, port: 80, path: "/", certificateType: "none" },
    ]);
    mockClient.updateDomain.mockRejectedValueOnce(new Error("400"));

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      containerPort: 3000,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("done");
    expect(result.appUrl).toBe("http://app.sslip.io");
  });

  it("returns error when the deployment status becomes 'error'", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "error", createdAt: "x", title: "bad commit" }]);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("error");
    expect(result.appUrl).toBe("");
  });

  it("polls repeatedly until the deployment status resolves", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([]) // pre-trigger snapshot
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "running", createdAt: "x" }])
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "running", createdAt: "x" }])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app" });

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("done");
    // 1 pre-trigger snapshot + 3 polls
    expect(mockClient.listDeployments).toHaveBeenCalledTimes(4);
  });

  it("throws on timeout", async () => {
    // Restore real setTimeout for this test — we need Date.now() to advance
    vi.restoreAllMocks();

    // Re-stub setTimeout to be instant but track elapsed time
    let elapsed = 0;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: (...args: unknown[]) => void, ms?: number) => {
      elapsed += ms ?? 0;
      if (typeof fn === "function") fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    // Mock Date.now() to return advancing time based on elapsed sleep
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += elapsed;
      elapsed = 0;
      return now;
    });

    // Deployment stays "running" forever → the poll loop hits the timeout.
    mockClient.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "running", createdAt: "x" }]);

    await expect(
      stageTriggerDeploy({
        applicationId: "app-1",
        client: mockClient as unknown as DokployClient,
        log: mockLog,
        pollIntervalMs: 1000,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/timed out/);
  });

  it("logs triggering message", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "test" });

    await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(logLines.some((l) => l.includes("[stage:deploy] Triggering deployment"))).toBe(true);
  });

  it("on failure, surfaces a user-facing reason pointing at the repository", async () => {
    mockClient.listDeployments.mockResolvedValue([
      { deploymentId: "d1", status: "error", title: "Fix login bug\n\nmore detail", errorMessage: null, createdAt: "x" },
    ]);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("error");
    // Reason names the failing commit and points to the repo as the likely cause.
    expect(result.failureReason).toContain("Fix login bug");
    expect(result.failureReason).toMatch(/repository/i);
    // The deploy log tells the user the build failed and where the cause lies.
    expect(logLines.some((l) => /server build failed|building your application/i.test(l))).toBe(true);
    expect(logLines.some((l) => /repository/i.test(l))).toBe(true);
  });

  it("gives actionable start-command guidance for a server app with no start command", async () => {
    mockClient.listDeployments.mockResolvedValue([
      { deploymentId: "d1", status: "error", title: "Build astro app", errorMessage: null, createdAt: "x" },
    ]);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      runtimeHint: {
        buildType: "railpack",
        framework: "astro",
        kind: "server",
        startCommandApplied: false,
        repoHasStartScript: false,
      },
    });

    expect(result.status).toBe("error");
    // Names the missing start command and the concrete Astro fix.
    expect(result.failureReason).toMatch(/start command/i);
    expect(result.failureReason).toContain("node ./dist/server/entry.mjs");
    expect(logLines.some((l) => /start.*script|node \.\/dist\/server\/entry\.mjs/i.test(l))).toBe(true);
  });

  it("gives platform-adapter guidance instead of start-command guidance", async () => {
    mockClient.listDeployments.mockResolvedValue([
      { deploymentId: "d1", status: "error", title: "Build astro app", errorMessage: null, createdAt: "x" },
    ]);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      runtimeHint: { buildType: "railpack", framework: "astro", kind: "server", platformAdapter: true },
    });

    expect(result.failureReason).toMatch(/platform adapter/i);
    expect(result.failureReason).toMatch(/@astrojs\/node/);
    expect(result.failureReason).not.toMatch(/No start command was detected/i);
  });

  it("does NOT give start-command guidance when a start command was applied", async () => {
    mockClient.listDeployments.mockResolvedValue([
      { deploymentId: "d1", status: "error", title: "Build astro app", errorMessage: null, createdAt: "x" },
    ]);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      runtimeHint: {
        buildType: "railpack",
        framework: "astro",
        kind: "server",
        startCommandApplied: true,
        repoHasStartScript: false,
      },
    });

    // Falls back to the generic repository guidance.
    expect(result.failureReason).toMatch(/repository/i);
    expect(result.failureReason).not.toMatch(/No start command was detected/i);
  });
});

describe("stageDeployWithRetry", () => {
  let mockClient: {
    deploy: ReturnType<typeof vi.fn>;
    getApplication: ReturnType<typeof vi.fn>;
    listDeployments: ReturnType<typeof vi.fn>;
    listDomains: ReturnType<typeof vi.fn>;
    generateDomain: ReturnType<typeof vi.fn>;
    createDomain: ReturnType<typeof vi.fn>;
    updateDomain: ReturnType<typeof vi.fn>;
  };
  let logLines: string[];
  let mockLog: (line: string) => Promise<void>;

  beforeEach(() => {
    // Make setTimeout resolve immediately
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: (...args: unknown[]) => void) => {
      if (typeof fn === "function") fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    mockClient = {
      deploy: vi.fn().mockResolvedValue(undefined),
      getApplication: vi.fn().mockResolvedValue({ applicationStatus: "done", appName: "my-app" }),
      listDeployments: vi.fn().mockResolvedValue([]),
      listDomains: vi.fn().mockResolvedValue([]),
      generateDomain: vi.fn().mockResolvedValue("app-my-app-98-93-35-222.sslip.io"),
      createDomain: vi.fn().mockResolvedValue({ domainId: "dom-1", host: "app-my-app-98-93-35-222.sslip.io", https: false, port: 3000, path: "/", applicationId: "app-1" }),
      updateDomain: vi.fn().mockResolvedValue(undefined),
    };
    logLines = [];
    mockLog = async (line: string) => { logLines.push(line); };
    mockInvokeDokployAI.mockResolvedValue({ fixed: false, description: "No fix" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns on first attempt if deploy succeeds", async () => {
    mockClient.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);

    const result = await stageDeployWithRetry({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      maxAttempts: 3,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("done");
    expect(mockClient.deploy).toHaveBeenCalledTimes(1);
    expect(mockInvokeDokployAI).not.toHaveBeenCalled();
  });

  it("invokes AI recovery on failure and retries", async () => {
    // Attempt 1 → error, attempt 2 → done. Each attempt snapshots (pre-trigger)
    // then polls; return error for the first resolved poll, done thereafter.
    mockClient.listDeployments
      .mockResolvedValueOnce([]) // attempt 1 pre-trigger snapshot
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 1 poll → error
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 2 pre-trigger snapshot
      .mockResolvedValue([{ deploymentId: "d2", status: "done", createdAt: "y" }]); // attempt 2 poll → done

    mockInvokeDokployAI.mockResolvedValue({ fixed: true, description: "Fixed missing env" });

    const result = await stageDeployWithRetry({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      maxAttempts: 3,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("done");
    expect(mockClient.deploy).toHaveBeenCalledTimes(2);
    expect(mockInvokeDokployAI).toHaveBeenCalledTimes(1);
    expect(logLines.some((l) => l.includes("Applied automatic fix"))).toBe(true);
  });

  it("throws after max attempts exhausted", async () => {
    mockClient.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "error", createdAt: "x" }]);
    mockInvokeDokployAI.mockResolvedValue({ fixed: false, description: "No fix" });

    await expect(
      stageDeployWithRetry({
        applicationId: "app-1",
        client: mockClient as unknown as DokployClient,
        log: mockLog,
        maxAttempts: 2,
        pollIntervalMs: 100,
      }),
    ).rejects.toThrow(/failed after 2 attempts/);

    expect(mockClient.deploy).toHaveBeenCalledTimes(2);
    // AI recovery called only between attempts (not after last failure)
    expect(mockInvokeDokployAI).toHaveBeenCalledTimes(1);
  });

  it("does not invoke AI after the last attempt", async () => {
    mockClient.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "error", createdAt: "x" }]);

    await expect(
      stageDeployWithRetry({
        applicationId: "app-1",
        client: mockClient as unknown as DokployClient,
        log: mockLog,
        maxAttempts: 1,
        pollIntervalMs: 100,
      }),
    ).rejects.toThrow(/failed after 1 attempts/);

    expect(mockInvokeDokployAI).not.toHaveBeenCalled();
  });

  it("logs attempt count for each try", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([]) // attempt 1 snapshot
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 1 → error
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 2 snapshot
      .mockResolvedValue([{ deploymentId: "d2", status: "done", createdAt: "y" }]); // attempt 2 → done

    mockInvokeDokployAI.mockResolvedValue({ fixed: false, description: "" });

    await stageDeployWithRetry({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      maxAttempts: 3,
      pollIntervalMs: 100,
    });

    expect(logLines.some((l) => l.includes("Attempt 1/3"))).toBe(true);
    expect(logLines.some((l) => l.includes("Attempt 2/3"))).toBe(true);
  });
});

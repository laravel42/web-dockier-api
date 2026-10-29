import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The long-tail build-log diagnosis. Mocked so no test reaches OpenAI, and so
// the deterministic failure paths below are asserted without it interfering.
// (This replaces a mock of the old `ai-recovery` stage, which called a Dokploy
// procedure that does not exist.)
const mockDiagnose = vi.fn();
vi.mock("../stages/ai-diagnosis.js", () => ({
  diagnoseBuildFailure: (...args: unknown[]) => mockDiagnose(...args),
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
  // ─── Build-log evidence ────────────────────────────────────────
  // The live bug: Dokploy leaves `errorMessage` null when the BUILD (not its
  // orchestration) fails, so the classifier was starved and a genuinely
  // OOM-ing Nuxt build was reported as a missing start command. The real
  // evidence only exists in the host log file at `logPath`.
  const OOM_TAIL = `
Deploy
$ node .output/server/index.mjs

<--- Last few GCs --->
[1:0x7f8] 118456 ms: Mark-Compact 938.1 (960.4) -> 937.3 (960.4) MB

FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
Aborted (core dumped)
#22 ERROR: failed to build: failed to solve: process "npm run build" did not complete successfully: exit code: 134
`;
  const NUXT_HINT = {
    buildType: "railpack",
    framework: "nuxt",
    kind: "server" as const,
    startCommandApplied: false,
    repoHasStartScript: false,
  };
  const FAILED_WITH_LOG = [{
    deploymentId: "d1",
    status: "error",
    title: "Update identity to Morten in Tokyo",
    errorMessage: null,
    logPath: "/etc/dokploy/logs/app/app-2026-10-15:21:40:00.log",
    createdAt: "x",
  }];

  it("diagnoses OOM from the fetched build log when errorMessage is null", async () => {
    mockClient.listDeployments.mockResolvedValue(FAILED_WITH_LOG);
    const fetchBuildLog = vi.fn().mockResolvedValue(OOM_TAIL);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      runtimeHint: NUXT_HINT,
      fetchBuildLog,
    });

    expect(fetchBuildLog).toHaveBeenCalledWith("/etc/dokploy/logs/app/app-2026-10-15:21:40:00.log");
    expect(result.failureReason).toMatch(/ran out of memory/i);
    expect(result.failureReason).toContain("npm run build");
    expect(result.failureReason).not.toMatch(/start command/i);
    // The retrieval line is what makes the next live failure debuggable from
    // the Dockier log alone.
    expect(logLines.some((l) => /Retrieved the server build log for diagnosis/.test(l))).toBe(true);
  });

  it("falls back to the old reason, without throwing, when the log fetch fails", async () => {
    mockClient.listDeployments.mockResolvedValue(FAILED_WITH_LOG);
    const fetchBuildLog = vi.fn().mockRejectedValue(new Error("ssh timed out"));

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      runtimeHint: NUXT_HINT,
      fetchBuildLog,
    });

    expect(result.status).toBe("error");
    expect(result.failureReason).toMatch(/No start command was detected/i);
    expect(logLines.some((l) => /Retrieved the server build log/.test(l))).toBe(false);
  });

  it("does not attempt a fetch when the deployment has no logPath", async () => {
    mockClient.listDeployments.mockResolvedValue([
      { deploymentId: "d1", status: "error", title: "c", errorMessage: null, createdAt: "x" },
    ]);
    const fetchBuildLog = vi.fn();

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      runtimeHint: NUXT_HINT,
      fetchBuildLog,
    });

    expect(fetchBuildLog).not.toHaveBeenCalled();
    expect(result.failureReason).toMatch(/No start command was detected/i);
  });

  it("still classifies on errorMessage when the log fetch returns nothing", async () => {
    mockClient.listDeployments.mockResolvedValue([{
      ...FAILED_WITH_LOG[0],
      errorMessage: 'process "npm run build" did not complete successfully: exit code: 137',
    }]);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      runtimeHint: NUXT_HINT,
      fetchBuildLog: vi.fn().mockResolvedValue(""),
    });

    expect(result.failureReason).toMatch(/ran out of memory/i);
    expect(result.failureReason).toContain("npm run build");
  });

  it("stops watching the build when the deployment is cancelled mid-poll", async () => {
    // Build never finishes; the user cancels while it runs.
    mockClient.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "running", createdAt: "x" }]);
    const isCancelled = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
      isCancelled,
    });

    expect(result.status).toBe("cancelled");
    expect(result.appUrl).toBe("");
    expect(logLines.some((l) => /cancelled by user/i.test(l))).toBe(true);
    // Pre-trigger snapshot + the one poll before the cancel was observed; the
    // cancel check runs before the Dokploy round-trip, so no further calls.
    expect(mockClient.listDeployments).toHaveBeenCalledTimes(2);
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
    // Default: no AI diagnosis available, so the deterministic guidance runs.
    mockDiagnose.mockResolvedValue(null);
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
    expect(logLines.some((l) => /in case the failure was transient/i.test(l))).toBe(false);
  });

  it("retries after a failure and succeeds on the second attempt", async () => {
    // Attempt 1 → error, attempt 2 → done. Each attempt snapshots (pre-trigger)
    // then polls; return error for the first resolved poll, done thereafter.
    mockClient.listDeployments
      .mockResolvedValueOnce([]) // attempt 1 pre-trigger snapshot
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 1 poll → error
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 2 pre-trigger snapshot
      .mockResolvedValue([{ deploymentId: "d2", status: "done", createdAt: "y" }]); // attempt 2 poll → done

    const result = await stageDeployWithRetry({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      maxAttempts: 3,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("done");
    // A genuine build failure must never be reclassified as a user cancel.
    expect(result.status).not.toBe("cancelled");
    expect(mockClient.deploy).toHaveBeenCalledTimes(2);
    // The retry is NOT a retry-after-fix: nothing edits the repository between
    // attempts, so the log must not claim a fix was applied. It used to, via
    // a Dokploy procedure that does not exist.
    expect(logLines.some((l) => /applied automatic fix/i.test(l))).toBe(false);
    expect(logLines.some((l) => /in case the failure was transient/i.test(l))).toBe(true);
  });
  it("threads the build-log fetch through to failure reporting", async () => {
    mockClient.listDeployments.mockResolvedValue([
      { deploymentId: "d1", status: "error", title: "c", errorMessage: null, logPath: "/etc/dokploy/logs/a/a-1.log", createdAt: "x" },
    ]);
    const fetchBuildLog = vi.fn().mockResolvedValue("");

    await expect(
      stageDeployWithRetry({
        applicationId: "app-1",
        client: mockClient as unknown as DokployClient,
        log: mockLog,
        maxAttempts: 1,
        pollIntervalMs: 100,
        fetchBuildLog,
      }),
    ).rejects.toThrow(/failed after 1 attempts/);

    expect(fetchBuildLog).toHaveBeenCalledWith("/etc/dokploy/logs/a/a-1.log");
  });

  it("returns without AI recovery or a second deploy when cancelled", async () => {
    mockClient.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "running", createdAt: "x" }]);
    const isCancelled = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);

    const result = await stageDeployWithRetry({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      maxAttempts: 3,
      pollIntervalMs: 100,
      isCancelled,
    });

    expect(result.status).toBe("cancelled");
    expect(mockClient.deploy).toHaveBeenCalledTimes(1);
    // A cancel must not look like a build failure, so neither the retry nor the
    // failure diagnosis runs.
    expect(mockDiagnose).not.toHaveBeenCalled();
    expect(logLines.some((l) => /in case the failure was transient/i.test(l))).toBe(false);
    expect(logLines.some((l) => l.includes("Attempt 2/"))).toBe(false);
  });

  it("throws after max attempts exhausted", async () => {
    mockClient.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "error", createdAt: "x" }]);

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
    // The retry notice appears only BETWEEN attempts, never after the last
    // failure — announcing a retry that will not happen.
    expect(logLines.filter((l) => /in case the failure was transient/i.test(l))).toHaveLength(1);
  });

  it("does not announce a retry after the last attempt", async () => {
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

    expect(logLines.some((l) => /in case the failure was transient/i.test(l))).toBe(false);
  });

  it("logs attempt count for each try", async () => {
    mockClient.listDeployments
      .mockResolvedValueOnce([]) // attempt 1 snapshot
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 1 → error
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }]) // attempt 2 snapshot
      .mockResolvedValue([{ deploymentId: "d2", status: "done", createdAt: "y" }]); // attempt 2 → done

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

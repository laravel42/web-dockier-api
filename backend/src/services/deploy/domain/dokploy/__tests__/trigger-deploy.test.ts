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
    };
    logLines = [];
    mockLog = async (line: string) => { logLines.push(line); };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns success when application status becomes 'done'", async () => {
    mockClient.getApplication.mockResolvedValue({
      applicationStatus: "done",
      appName: "my-app",
    });

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

  it("returns error when application status becomes 'error'", async () => {
    mockClient.getApplication.mockResolvedValue({
      applicationStatus: "error",
      appName: "my-app",
    });

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("error");
    expect(result.appUrl).toBe("");
  });

  it("polls repeatedly until status resolves", async () => {
    mockClient.getApplication
      .mockResolvedValueOnce({ applicationStatus: "running", appName: "my-app" })
      .mockResolvedValueOnce({ applicationStatus: "running", appName: "my-app" })
      .mockResolvedValueOnce({ applicationStatus: "done", appName: "my-app" });

    const result = await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("done");
    expect(mockClient.getApplication).toHaveBeenCalledTimes(3);
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

    mockClient.getApplication.mockResolvedValue({ applicationStatus: "running", appName: "my-app" });

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
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "test" });

    await stageTriggerDeploy({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
      pollIntervalMs: 100,
    });

    expect(logLines[0]).toContain("[stage:deploy] Triggering deployment");
  });
});

describe("stageDeployWithRetry", () => {
  let mockClient: {
    deploy: ReturnType<typeof vi.fn>;
    getApplication: ReturnType<typeof vi.fn>;
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
      getApplication: vi.fn(),
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
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app" });

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
    mockClient.getApplication
      .mockResolvedValueOnce({ applicationStatus: "error", appName: "my-app" }) // attempt 1 fails
      .mockResolvedValueOnce({ applicationStatus: "done", appName: "my-app" }); // attempt 2 succeeds

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
    expect(logLines.some((l) => l.includes("Dokploy AI applied fix"))).toBe(true);
  });

  it("throws after max attempts exhausted", async () => {
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "error", appName: "my-app" });
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
    mockClient.getApplication.mockResolvedValue({ applicationStatus: "error", appName: "my-app" });

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
    mockClient.getApplication
      .mockResolvedValueOnce({ applicationStatus: "error", appName: "my-app" })
      .mockResolvedValueOnce({ applicationStatus: "done", appName: "my-app" });

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

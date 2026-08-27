import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invokeDokployAI } from "../stages/ai-recovery.js";
import { DokployError } from "../types.js";
import type { DokployClient } from "../client.js";

describe("invokeDokployAI", () => {
  let mockClient: { triggerAIFix: ReturnType<typeof vi.fn> };
  let logLines: string[];
  let mockLog: (line: string) => Promise<void>;

  beforeEach(() => {
    mockClient = {
      triggerAIFix: vi.fn(),
    };
    logLines = [];
    mockLog = async (line: string) => { logLines.push(line); };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns { fixed: true } when Dokploy AI applies a fix", async () => {
    mockClient.triggerAIFix.mockResolvedValue({
      applied: true,
      summary: "Added missing NODE_ENV variable",
    });

    const result = await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(result.fixed).toBe(true);
    expect(result.description).toBe("Added missing NODE_ENV variable");
    expect(logLines.some((l) => l.includes("Fix applied"))).toBe(true);
  });

  it("returns { fixed: false } when AI analyzes but cannot fix", async () => {
    mockClient.triggerAIFix.mockResolvedValue({
      applied: false,
      summary: "Issue requires manual intervention",
    });

    const result = await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(result.fixed).toBe(false);
    expect(result.description).toBe("Issue requires manual intervention");
    expect(logLines.some((l) => l.includes("no fix was applied"))).toBe(true);
  });

  it("returns { fixed: false } when Dokploy AI is unavailable (network error)", async () => {
    mockClient.triggerAIFix.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(result.fixed).toBe(false);
    expect(result.description).toContain("AI unavailable");
    expect(logLines.some((l) => l.includes("⚠ Dokploy AI unavailable"))).toBe(true);
  });

  it("returns { fixed: false } when Dokploy API returns an error", async () => {
    mockClient.triggerAIFix.mockRejectedValue(
      new DokployError("Service unavailable", 503, "application.aiFixDeployment"),
    );

    const result = await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(result.fixed).toBe(false);
    expect(result.description).toContain("API error (503)");
  });

  it("never throws — always returns a result", async () => {
    mockClient.triggerAIFix.mockRejectedValue(new Error("catastrophic failure"));

    // Should NOT throw
    const result = await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(result).toBeDefined();
    expect(result.fixed).toBe(false);
  });

  it("uses fallback description when summary is null on success", async () => {
    mockClient.triggerAIFix.mockResolvedValue({
      applied: true,
      summary: null,
    });

    const result = await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(result.fixed).toBe(true);
    expect(result.description).toBe("Applied automatic fix");
  });

  it("uses fallback description when summary is null on no-fix", async () => {
    mockClient.triggerAIFix.mockResolvedValue({
      applied: false,
      summary: null,
    });

    const result = await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(result.fixed).toBe(false);
    expect(result.description).toBe("No actionable fix found");
  });

  it("logs the triggering message before calling the API", async () => {
    mockClient.triggerAIFix.mockResolvedValue({ applied: false, summary: null });

    await invokeDokployAI({
      applicationId: "app-1",
      client: mockClient as unknown as DokployClient,
      log: mockLog,
    });

    expect(logLines[0]).toContain("[stage:ai-recovery] Triggering Dokploy AI diagnosis");
  });
});

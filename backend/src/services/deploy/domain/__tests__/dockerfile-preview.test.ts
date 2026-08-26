import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv() }));
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: { from: vi.fn() } }));

const mockRm = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({ rm: (...args: unknown[]) => mockRm(...args) }));

const mockCloneRepo = vi.fn();
const mockAnalyzeAndGenerate = vi.fn();
vi.mock("../../../../lib/build-pipeline.js", () => ({
  cloneRepo: (...args: unknown[]) => mockCloneRepo(...args),
  analyzeAndGenerate: (...args: unknown[]) => mockAnalyzeAndGenerate(...args),
}));

vi.mock("../../../../lib/logging.js", () => ({
  createConsoleLogger: () => ({
    info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), section: vi.fn(),
  }),
}));

const mockGetConnectionForTenant = vi.fn();
vi.mock("../../../../shared/service-clients/git-connections.js", () => ({
  getConnectionForTenant: (...args: unknown[]) => mockGetConnectionForTenant(...args),
}));

const mockGetProjectDeployConfig = vi.fn();
vi.mock("../../../../shared/service-clients/projects.js", () => ({
  getProjectDeployConfig: (...args: unknown[]) => mockGetProjectDeployConfig(...args),
}));

const { previewDockerfile } = await import("../dockerfile-preview.js");

// ─── Helpers ───────────────────────────────────────────────────────

const TENANT = "a1b2c3d4-1234-4abc-8def-111111111111";
const CONN = "b8c9d0e1-8901-4123-abcd-888888888888";

const conn = { provider: "github", personal_token: "tok", endpoint: "" };
const cloneResult = { repoDir: "/tmp/build-x/repo", workDir: "/tmp/build-x", commitHash: "abc1234" };

function analyzeResult(overrides: Record<string, unknown> = {}) {
  return {
    repoConfig: { runtime: "node", framework: "nextjs" },
    detectedStack: {},
    detectedPort: 3000,
    dockerfileGenerated: true,
    aiReviewed: true,
    aiRevised: false,
    source: "generated",
    aiEnabled: true,
    mechanicalDockerfile: "FROM node:20-slim\nEXPOSE 3000\nCMD [\"npm\",\"start\"]",
    finalDockerfile: "FROM node:20-slim\nEXPOSE 3000\nCMD [\"npm\",\"start\"]",
    reviewChanges: [],
    reviewSkipReason: undefined,
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return { tenantId: TENANT, gitConnectionId: CONN, repo: "acme/app", branch: "main", ...overrides };
}

beforeEach(() => {
  mockGetConnectionForTenant.mockResolvedValue(conn);
  mockCloneRepo.mockResolvedValue(cloneResult);
  mockAnalyzeAndGenerate.mockResolvedValue(analyzeResult());
  mockGetProjectDeployConfig.mockResolvedValue(null);
});

afterEach(() => vi.clearAllMocks());

// ─── Tests ─────────────────────────────────────────────────────────

describe("previewDockerfile", () => {
  it("returns a generated + revised preview and cleans up the temp dir", async () => {
    mockAnalyzeAndGenerate.mockResolvedValue(
      analyzeResult({
        aiRevised: true,
        finalDockerfile: "FROM node:20-slim\nUSER node\nEXPOSE 3000\nCMD [\"npm\",\"start\"]",
        reviewChanges: [{ what: "Added non-root USER", why: "Security" }],
      }),
    );

    const result = await previewDockerfile(baseInput());

    expect(result.source).toBe("generated");
    expect(result.revised).toBe(true);
    expect(result.aiEnabled).toBe(true);
    expect(result.finalDockerfile).toContain("USER node");
    expect(result.changes).toEqual([{ what: "Added non-root USER", why: "Security" }]);
    expect(result.runtime).toBe("node");
    expect(result.framework).toBe("nextjs");

    // Delegated with capture + generated path.
    expect(mockAnalyzeAndGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ capture: true, skipExistingDockerfile: false }),
    );
    // Temp dir removed.
    expect(mockRm).toHaveBeenCalledWith("/tmp/build-x", { recursive: true, force: true });
  });

  it("uses the repo Dockerfile path (skipExistingDockerfile) without AI when useRepoDockerfile is true", async () => {
    mockAnalyzeAndGenerate.mockResolvedValue(
      analyzeResult({
        source: "repo",
        aiEnabled: false,
        aiReviewed: false,
        aiRevised: false,
        mechanicalDockerfile: "FROM myrepo\nEXPOSE 8080",
        finalDockerfile: "FROM myrepo\nEXPOSE 8080",
      }),
    );

    const result = await previewDockerfile(baseInput({ useRepoDockerfile: true }));

    expect(result.source).toBe("repo");
    expect(result.aiEnabled).toBe(false);
    expect(result.revised).toBe(false);
    expect(mockAnalyzeAndGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ skipExistingDockerfile: true, capture: true }),
    );
  });

  it("reports aiEnabled=false when the review did not run", async () => {
    mockAnalyzeAndGenerate.mockResolvedValue(
      analyzeResult({ aiEnabled: false, aiReviewed: false }),
    );

    const result = await previewDockerfile(baseInput());

    expect(result.aiEnabled).toBe(false);
    expect(result.source).toBe("generated");
  });

  it("resolves knownPlatform from projectId and passes it through", async () => {
    mockGetProjectDeployConfig.mockResolvedValue({ platform: "laravel", deployScript: "" });

    await previewDockerfile(baseInput({ projectId: "proj-1" }));

    expect(mockGetProjectDeployConfig).toHaveBeenCalledWith("proj-1");
    expect(mockAnalyzeAndGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ knownPlatform: "laravel" }),
    );
  });

  it("propagates a clone failure and does not call analyze (no temp dir to clean)", async () => {
    mockCloneRepo.mockRejectedValue(new Error("Failed to clone acme/app@main"));

    await expect(previewDockerfile(baseInput())).rejects.toThrow(/clone/i);
    expect(mockAnalyzeAndGenerate).not.toHaveBeenCalled();
    expect(mockRm).not.toHaveBeenCalled();
  });

  it("throws before cloning when no git connection is provided", async () => {
    await expect(previewDockerfile(baseInput({ gitConnectionId: "" }))).rejects.toThrow();
    expect(mockGetConnectionForTenant).not.toHaveBeenCalled();
    expect(mockCloneRepo).not.toHaveBeenCalled();
  });
});

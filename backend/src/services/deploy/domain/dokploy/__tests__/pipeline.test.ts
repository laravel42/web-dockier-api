import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));

const mockAppendLog = vi.fn().mockResolvedValue(undefined);
const mockUpdateStatus = vi.fn().mockResolvedValue(undefined);
const mockGetDeploymentCurrentStatus = vi.fn().mockResolvedValue("pending");

const mockEmitSuccess = vi.fn();
const mockEmitFailure = vi.fn();
vi.mock("../../pipeline/helpers.js", () => ({
  appendLog: (...args: unknown[]) => mockAppendLog(...args),
  updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  emitDeploySuccessNotification: (...args: unknown[]) => mockEmitSuccess(...args),
  emitDeployFailureNotification: (...args: unknown[]) => mockEmitFailure(...args),
}));

// Post-success bookkeeping shared with the native pipeline.
const mockMarkInfraLive = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lifecycle/project-teardown.js", () => ({
  markProjectInfraLive: (...args: unknown[]) => mockMarkInfraLive(...args),
}));
const mockClearFavicon = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../../git-integration/domain/cache.js", () => ({
  clearRepoFaviconFromAnalysisCache: (...args: unknown[]) => mockClearFavicon(...args),
}));

vi.mock("../../deployments.js", () => ({
  getDeploymentCurrentStatus: (...args: unknown[]) => mockGetDeploymentCurrentStatus(...args),
}));

// Mappings: the pipeline clears stale DB mappings when a fresh server is
// provisioned. Mock the module so we can assert that without a real DB.
const mockDeleteDatabaseMappings = vi.fn().mockResolvedValue(undefined);
vi.mock("../mappings.js", () => ({
  deleteDatabaseMappings: (...args: unknown[]) => mockDeleteDatabaseMappings(...args),
}));

vi.mock("../../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Test Org" }, error: null }),
    }),
  },
}));

vi.mock("../../../../../shared/utils/time.js", () => ({
  logTimestamp: () => "2025-01-01T00:00:00Z",
  sleep: () => Promise.resolve(),
}));

// Stage mocks
const mockEnsureProject = vi.fn().mockResolvedValue({
  dokployProjectId: "proj-1",
  dokployEnvironmentId: "env-1",
});
const mockSyncGit = vi.fn().mockResolvedValue({
  gitConfig: { type: "github", owner: "user", repository: "repo", branch: "main" },
});
const mockProvisionServer = vi.fn().mockResolvedValue({
  dokployServerId: "srv-1",
  serverIp: "10.0.0.1",
  reused: true,
});
const mockConfigureApp = vi.fn().mockResolvedValue({
  dokployApplicationId: "app-1",
  buildType: "nixpacks",
});
const mockDeployWithRetry = vi.fn().mockResolvedValue({
  status: "done",
  appUrl: "https://my-app.dokploy.local",
});

vi.mock("../stages/ensure-project.js", () => ({
  stageEnsureProject: (...args: unknown[]) => mockEnsureProject(...args),
}));
vi.mock("../stages/sync-git.js", () => ({
  stageSyncGit: (...args: unknown[]) => mockSyncGit(...args),
}));
vi.mock("../stages/provision-server.js", () => ({
  stageProvisionServer: (...args: unknown[]) => mockProvisionServer(...args),
}));
vi.mock("../stages/configure-app.js", () => ({
  stageConfigureApp: (...args: unknown[]) => mockConfigureApp(...args),
}));
vi.mock("../stages/trigger-deploy.js", () => ({
  stageDeployWithRetry: (...args: unknown[]) => mockDeployWithRetry(...args),
}));
const mockRunPostDeploy = vi.fn().mockResolvedValue(undefined);
vi.mock("../stages/run-post-deploy.js", () => ({
  stageRunPostDeploy: (...args: unknown[]) => mockRunPostDeploy(...args),
}));
// Runtime resolution + URL verification both reach the network; mock them so
// this orchestration test stays offline and fast. Their logic is covered by
// resolve-runtime.test.ts and verify-deploy.test.ts.
const mockResolveRuntime = vi.fn().mockResolvedValue({});
vi.mock("../stages/resolve-runtime.js", () => ({
  resolveRuntimeStartCommand: (...args: unknown[]) => mockResolveRuntime(...args),
}));
const mockVerifyDeploy = vi.fn().mockResolvedValue({ ok: true, status: 200, reason: "ok" });
vi.mock("../stages/verify-deploy.js", () => ({
  stageVerifyDeploy: (...args: unknown[]) => mockVerifyDeploy(...args),
}));
vi.mock("../../../../projects/domain/env.js", () => ({
  revealEnv: vi.fn().mockResolvedValue({ exists: false, content: null }),
}));
vi.mock("../client.js", () => ({
  createDokployClient: () => ({}),
}));

const { executeDokployPipeline } = await import("../pipeline.js");

// ─── Tests ─────────────────────────────────────────────────────────

describe("executeDokployPipeline", () => {
  const basePipelineInput = {
    deploymentId: "deploy-1",
    tenantId: "tenant-1",
    projectId: "project-1",
    gitConnectionId: "git-conn-1",
    repo: "owner/my-app",
    branch: "main",
    providerId: "provider-1",
    tofuScript: "",
    deployStrategy: "vps",
    hasDocker: false,
    primaryLanguage: "javascript",
    techStack: ["node"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeploymentCurrentStatus.mockResolvedValue("pending");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("executes all stages in correct order on success", async () => {
    await executeDokployPipeline(basePipelineInput);

    // Stage 1: Ensure project
    expect(mockEnsureProject).toHaveBeenCalledOnce();

    // Stages 2 & 3: Sync git + provision server (parallel)
    expect(mockSyncGit).toHaveBeenCalledOnce();
    expect(mockProvisionServer).toHaveBeenCalledOnce();

    // Stage 4: Configure app
    expect(mockConfigureApp).toHaveBeenCalledOnce();
    expect(mockConfigureApp).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        environmentId: "env-1",
        serverId: "srv-1",
      }),
    );

    // Stage 5: Deploy with retry
    expect(mockDeployWithRetry).toHaveBeenCalledOnce();
    expect(mockDeployWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        maxAttempts: 2,
      }),
    );
  });

  it("transitions status: pending → building → deploying → success", async () => {
    await executeDokployPipeline(basePipelineInput);

    const statusCalls = mockUpdateStatus.mock.calls.map((c) => c[1]);
    expect(statusCalls).toContain("building");
    expect(statusCalls).toContain("deploying");
    expect(statusCalls).toContain("success");
  });

  it("sets status to failed when a stage throws", async () => {
    mockConfigureApp.mockRejectedValueOnce(new Error("Config failed"));

    await executeDokployPipeline(basePipelineInput);

    const statusCalls = mockUpdateStatus.mock.calls.map((c) => c[1]);
    expect(statusCalls).toContain("failed");
    expect(statusCalls).not.toContain("success");
  });

  it("logs the failure message when a stage throws", async () => {
    mockDeployWithRetry.mockRejectedValueOnce(new Error("Deployment failed after 2 attempts"));

    await executeDokployPipeline(basePipelineInput);

    const logLines = mockAppendLog.mock.calls.map((c) => c[1] as string);
    const failLine = logLines.find((l) => l.includes("Pipeline failed"));
    expect(failLine).toContain("Deployment failed after 2 attempts");
  });

  it("skips execution if deployment is already building (idempotency guard)", async () => {
    mockGetDeploymentCurrentStatus.mockResolvedValue("building");

    await executeDokployPipeline(basePipelineInput);

    expect(mockEnsureProject).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("skips execution if deployment is cancelled (idempotency guard)", async () => {
    mockGetDeploymentCurrentStatus.mockResolvedValue("cancelled");

    await executeDokployPipeline(basePipelineInput);

    expect(mockEnsureProject).not.toHaveBeenCalled();
  });

  it("passes git config from sync-git to configure-app", async () => {
    const customGitConfig = { type: "gitlab", owner: "org", repository: "app", branch: "develop" };
    mockSyncGit.mockResolvedValueOnce({ gitConfig: customGitConfig });

    await executeDokployPipeline(basePipelineInput);

    expect(mockConfigureApp).toHaveBeenCalledWith(
      expect.objectContaining({
        gitConfig: customGitConfig,
      }),
    );
  });

  it("passes server ID from provision-server to configure-app", async () => {
    mockProvisionServer.mockResolvedValueOnce({ dokployServerId: "srv-99", serverIp: "192.168.1.1", reused: true });

    await executeDokployPipeline(basePipelineInput);

    expect(mockConfigureApp).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: "srv-99",
      }),
    );
  });

  it("clears stale database mappings when the server was freshly provisioned (not reused)", async () => {
    mockProvisionServer.mockResolvedValueOnce({ dokployServerId: "srv-new", serverIp: "5.6.7.8", reused: false });

    await executeDokployPipeline(basePipelineInput);

    // A fresh server means the old DBs are gone; their mappings must be cleared
    // so they're recreated on the new box (fixes "getaddrinfo failed" Bad Gateway).
    expect(mockDeleteDatabaseMappings).toHaveBeenCalledWith("project-1");
  });

  it("does NOT clear database mappings when the server is reused", async () => {
    // default mockProvisionServer resolves reused: true
    await executeDokployPipeline(basePipelineInput);

    expect(mockDeleteDatabaseMappings).not.toHaveBeenCalled();
  });

  it("marks the project's infrastructure live on success (enables teardown)", async () => {
    await executeDokployPipeline(basePipelineInput);

    // Without this the project shows "No infrastructure" and the Tear Down
    // button stays disabled, so users cannot destroy what they just created.
    expect(mockMarkInfraLive).toHaveBeenCalledWith("project-1");
  });

  it("emits a success notification and clears the favicon cache on success", async () => {
    await executeDokployPipeline(basePipelineInput);

    expect(mockEmitSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", repo: "owner/my-app", branch: "main" }),
    );
    expect(mockClearFavicon).toHaveBeenCalled();
  });

  it("emits a failure notification when a stage throws", async () => {
    mockConfigureApp.mockRejectedValueOnce(new Error("Config failed"));

    await executeDokployPipeline(basePipelineInput);

    expect(mockEmitFailure).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", repo: "owner/my-app" }),
    );
    expect(mockMarkInfraLive).not.toHaveBeenCalled();
  });

  it("persists appUrl ATOMICALLY with the success status", async () => {
    await executeDokployPipeline(basePipelineInput);

    // Writing app_url after flipping to "success" raced the wizard, which stops
    // polling on a terminal status and captured an empty URL. It must land in the
    // same update as the status.
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      "deploy-1",
      "success",
      expect.objectContaining({ app_url: expect.stringContaining("http") }),
    );
  });
});

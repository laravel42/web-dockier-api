/**
 * End-to-end pipeline test.
 *
 * Unlike pipeline.test.ts (which mocks every stage), this drives the REAL
 * stage implementations — ensure-project, sync-git, configure-app,
 * trigger-deploy + AI recovery — and mocks only the external boundaries:
 *   - the Dokploy HTTP client (`createDokployClient`)
 *   - the DB mapping layer (`mappings.js`)
 *   - git connection credentials
 *   - project env reveal
 *   - deployment status/log helpers and supabase
 *
 * This catches wiring regressions across stages (data handoff, build-type
 * detection, retry + AI-recovery loop) that per-stage mocks cannot.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));

// ─── Log / status / db boundary ────────────────────────────────────

const logLines: string[] = [];
const statusCalls: string[] = [];
const mockAppendLog = vi.fn(async (_id: string, line: string) => { logLines.push(line); });
const mockUpdateStatus = vi.fn(async (_id: string, status: string) => { statusCalls.push(status); });
const mockGetDeploymentCurrentStatus = vi.fn().mockResolvedValue("pending");

vi.mock("../../pipeline/helpers.js", () => ({
  appendLog: (...a: unknown[]) => mockAppendLog(...(a as [string, string])),
  updateStatus: (...a: unknown[]) => mockUpdateStatus(...(a as [string, string])),
}));
vi.mock("../../deployments.js", () => ({
  getDeploymentCurrentStatus: (...a: unknown[]) => mockGetDeploymentCurrentStatus(...a),
}));
vi.mock("../../../../../shared/utils/time.js", () => ({
  logTimestamp: () => "2025-01-01T00:00:00Z",
  // sleep is used by the real trigger-deploy poll loop; make it instant here.
  sleep: () => Promise.resolve(),
}));

const dbUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock("../../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnValue({ eq: (...a: unknown[]) => dbUpdateEq(...a) }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Acme Inc" }, error: null }),
    }),
  },
}));

// ─── DB mapping layer (in-memory) ──────────────────────────────────

let tenantProject: unknown = null;
let application: unknown = null;
const createTenantProject = vi.fn(async (p: Record<string, unknown>) => {
  tenantProject = { id: "tp-1", organizationId: p.organizationId, dokployProjectId: p.dokployProjectId, dokployEnvironmentId: p.dokployEnvironmentId };
  return tenantProject;
});
const upsertApplication = vi.fn(async (p: Record<string, unknown>) => {
  application = { id: "am-1", projectId: p.projectId, dokployApplicationId: p.dokployApplicationId, dokployServerId: p.dokployServerId ?? null, buildType: p.buildType ?? "nixpacks" };
  return application;
});

vi.mock("../mappings.js", () => ({
  getTenantProject: vi.fn(async () => tenantProject),
  createTenantProject: (...a: unknown[]) => createTenantProject(...(a as [Record<string, unknown>])),
  getApplication: vi.fn(async () => application),
  upsertApplication: (...a: unknown[]) => upsertApplication(...(a as [Record<string, unknown>])),
}));

// ─── Git + env boundaries ──────────────────────────────────────────

vi.mock("../../../../../shared/service-clients/git-connections.js", () => ({
  getGitConnectionCredentials: vi.fn(async () => ({ provider: "github", endpoint: null })),
}));
vi.mock("../../../../projects/domain/env.js", () => ({
  revealEnv: vi.fn(async () => ({ exists: true, content: "FOO=bar\n# comment\nBAZ=qux" })),
}));

// ─── Dokploy HTTP client (fake) ────────────────────────────────────

const clientMethods = {
  // No existing projects by default → ensure-project reconciliation finds
  // nothing to adopt and proceeds to create a new one.
  listProjects: vi.fn(async () => [] as Array<{ projectId: string; name: string; createdAt?: string }>),
  getProject: vi.fn(async () => ({ projectId: "dpj-1", environments: [{ environmentId: "env-1", name: "production" }] })),
  createProject: vi.fn(async () => ({ projectId: "dpj-1", environments: [{ environmentId: "env-1" }] })),
  createApplication: vi.fn(async () => ({ applicationId: "app-1", appName: "my-app" })),
  saveGithubProvider: vi.fn(async () => undefined),
  saveGitlabProvider: vi.fn(async () => undefined),
  saveGitProvider: vi.fn(async () => undefined),
  saveBuildType: vi.fn(async () => undefined),
  saveEnvironment: vi.fn(async () => undefined),
  deploy: vi.fn(async () => undefined),
  getApplication: vi.fn(async () => ({ applicationStatus: "done", appName: "my-app" })),
  triggerAIFix: vi.fn(async () => ({ applied: true, summary: "bumped node version" })),
};
vi.mock("../client.js", () => ({
  createDokployClient: () => clientMethods,
}));

// provision-server is the one stage that reaches into cloud SDKs; keep it
// mocked so this test stays a Dokploy-orchestration test (the EC2/GCE
// provisioners have their own dedicated unit tests).
const mockProvisionServer = vi.fn(async (..._a: unknown[]) => ({ dokployServerId: "srv-1", serverIp: "10.0.0.9" }));
vi.mock("../stages/provision-server.js", () => ({
  stageProvisionServer: (...a: unknown[]) => mockProvisionServer(...a),
}));

const { executeDokployPipeline } = await import("../pipeline.js");

// ─── Fixtures ──────────────────────────────────────────────────────

function input(overrides: Record<string, unknown> = {}) {
  return {
    deploymentId: "deploy-1",
    tenantId: "tenant-1",
    projectId: "project-1",
    gitConnectionId: "git-1",
    repo: "acme/my-app",
    branch: "main",
    providerId: "provider-1",
    tofuScript: "",
    deployStrategy: "vps",
    hasDocker: false,
    primaryLanguage: "typescript",
    techStack: ["node"],
    deployPollIntervalMs: 1, // fast poll for tests
    ...overrides,
  };
}

beforeEach(() => {
  logLines.length = 0;
  statusCalls.length = 0;
  tenantProject = null;
  application = null;
  mockGetDeploymentCurrentStatus.mockResolvedValue("pending");
  clientMethods.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app" });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────

describe("Dokploy pipeline (end-to-end, real stages)", () => {
  it("runs all real stages to success and stores the app URL", async () => {
    await executeDokployPipeline(input());

    // Ensure-project created a Dokploy project + mapping. The name embeds the
    // org id so it's unique per tenant.
    expect(clientMethods.createProject).toHaveBeenCalledWith({ name: "Acme Inc [tenant-1]" });
    expect(createTenantProject).toHaveBeenCalled();

    // Configure-app created the application and configured github source.
    expect(clientMethods.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: "env-1", serverId: "srv-1" }),
    );
    expect(clientMethods.saveGithubProvider).toHaveBeenCalled();

    // TypeScript with no Dockerfile → railpack build type.
    expect(clientMethods.saveBuildType).toHaveBeenCalledWith(
      expect.objectContaining({ buildType: "railpack" }),
    );

    // Env vars parsed (FOO, BAZ) and sent.
    expect(clientMethods.saveEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({ env: "FOO=bar\nBAZ=qux" }),
    );

    // Deploy triggered and succeeded.
    expect(clientMethods.deploy).toHaveBeenCalled();
    expect(statusCalls).toEqual(expect.arrayContaining(["building", "deploying", "success"]));

    // App URL persisted.
    expect(dbUpdateEq).toHaveBeenCalled();
  });

  it("recovers via Dokploy AI: first deploy errors, retry succeeds", async () => {
    clientMethods.getApplication
      .mockResolvedValueOnce({ applicationStatus: "error", appName: "my-app" })   // attempt 1 poll
      .mockResolvedValueOnce({ applicationStatus: "done", appName: "my-app" });   // attempt 2 poll

    await executeDokployPipeline(input());

    // Deploy attempted twice, AI invoked once between attempts.
    expect(clientMethods.deploy).toHaveBeenCalledTimes(2);
    expect(clientMethods.triggerAIFix).toHaveBeenCalledTimes(1);
    expect(statusCalls).toContain("success");

    const aiLog = logLines.find((l) => l.includes("Dokploy AI applied fix"));
    expect(aiLog).toContain("bumped node version");
  });

  it("fails after 3 attempts when deploy never succeeds", async () => {
    clientMethods.getApplication.mockResolvedValue({ applicationStatus: "error", appName: "my-app" });

    await executeDokployPipeline(input());

    expect(clientMethods.deploy).toHaveBeenCalledTimes(3);
    // AI recovery attempted between the failed attempts (not after the last).
    expect(clientMethods.triggerAIFix).toHaveBeenCalledTimes(2);
    expect(statusCalls).toContain("failed");
    expect(statusCalls).not.toContain("success");

    const failLog = logLines.find((l) => l.includes("Pipeline failed"));
    expect(failLog).toContain("failed after 3 attempts");
  });

  it("chooses dockerfile build type when the repo has a Dockerfile", async () => {
    await executeDokployPipeline(input({ hasDocker: true }));

    expect(clientMethods.saveBuildType).toHaveBeenCalledWith(
      expect.objectContaining({ buildType: "dockerfile" }),
    );
  });

  it("reuses an existing Dokploy project mapping (idempotent)", async () => {
    tenantProject = { id: "tp-x", organizationId: "tenant-1", dokployProjectId: "dpj-existing", dokployEnvironmentId: "env-existing" };

    await executeDokployPipeline(input());

    expect(clientMethods.createProject).not.toHaveBeenCalled();
    expect(clientMethods.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: "env-existing" }),
    );
  });

  it("adopts an existing Dokploy project by name instead of creating a duplicate", async () => {
    // No local mapping (tenantProject stays null), but a project with the org's
    // name already exists in Dokploy — an orphan from a prior run that failed
    // before persisting the mapping. The stage must adopt it, not duplicate it.
    clientMethods.listProjects.mockResolvedValueOnce([
      { projectId: "dpj-orphan", name: "Acme Inc [tenant-1]", createdAt: "2026-01-01T00:00:00Z" },
    ]);
    clientMethods.getProject.mockResolvedValueOnce({
      projectId: "dpj-orphan",
      environments: [{ environmentId: "env-orphan", name: "production" }],
    });

    await executeDokployPipeline(input());

    // Did NOT create a duplicate project...
    expect(clientMethods.createProject).not.toHaveBeenCalled();
    // ...adopted the orphan and persisted the mapping to it.
    expect(createTenantProject).toHaveBeenCalledWith(
      expect.objectContaining({ dokployProjectId: "dpj-orphan" }),
    );
  });
});

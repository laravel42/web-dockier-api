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
const deleteTenantProject = vi.fn(async () => { tenantProject = null; });
const deleteApplicationMapping = vi.fn(async () => { application = null; });

vi.mock("../mappings.js", () => ({
  getTenantProject: vi.fn(async () => tenantProject),
  createTenantProject: (...a: unknown[]) => createTenantProject(...(a as [Record<string, unknown>])),
  deleteTenantProject: (...a: unknown[]) => deleteTenantProject(...(a as [])),
  getApplication: vi.fn(async () => application),
  upsertApplication: (...a: unknown[]) => upsertApplication(...(a as [Record<string, unknown>])),
  deleteApplicationMapping: (...a: unknown[]) => deleteApplicationMapping(...(a as [])),
  // Database mappings: no existing DB by default; upsert is a no-op recorder.
  getDatabase: vi.fn(async () => null),
  upsertDatabase: vi.fn(async (p: Record<string, unknown>) => ({ id: "dbm-1", ...p })),
  deleteDatabaseMappings: vi.fn(async () => undefined),
  deleteDatabaseMapping: vi.fn(async () => undefined),
}));

// ─── Git + env boundaries ──────────────────────────────────────────

vi.mock("../../../../../shared/service-clients/git-connections.js", () => ({
  getGitConnectionCredentials: vi.fn(async () => ({ provider: "github", endpoint: null })),
}));
const revealEnv = vi.fn(async () => ({ exists: true, content: "FOO=bar\n# comment\nBAZ=qux" }));
vi.mock("../../../../projects/domain/env.js", () => ({
  revealEnv: (...a: unknown[]) => revealEnv(...(a as [])),
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
  getApplication: vi.fn(async () => ({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" })),
  // Deploy status is tracked via the latest deployment record; default to a
  // successful one.
  listDeployments: vi.fn(async () => [{ deploymentId: "d1", status: "done", createdAt: "x" }]),
  // Domain resolution after a successful deploy.
  listDomains: vi.fn(async () => [] as Array<{ host: string; https: boolean; port: number | null }>),
  generateDomain: vi.fn(async () => "app-my-app-98-93-35-222.sslip.io"),
  createDomain: vi.fn(async () => ({ domainId: "dom-1", host: "app-my-app-98-93-35-222.sslip.io", https: false, port: 3000, path: "/", applicationId: "app-1" })),
  // Self-hosted database services.
  createMysql: vi.fn(async () => ({ id: "my-1", appName: "myapp-database-abcdef", name: "db", databaseName: "appdb", databaseUser: "dockier", databasePassword: "pw" })),
  deployMysql: vi.fn(async () => undefined),
  createPostgres: vi.fn(async () => ({ id: "pg-1", appName: "myapp-database-abcdef", name: "db", databaseName: "appdb", databaseUser: "dockier", databasePassword: "pw" })),
  deployPostgres: vi.fn(async () => undefined),
  createRedis: vi.fn(async () => ({ id: "r-1", appName: "myapp-cache-abcdef", name: "cache", databasePassword: "pw" })),
  deployRedis: vi.fn(async () => undefined),
  // Reused DB services are verified to still exist; default to "exists".
  databaseExists: vi.fn(async () => true),
  triggerAIFix: vi.fn(async () => ({ applied: true, summary: "bumped node version" })),
};
vi.mock("../client.js", () => ({
  createDokployClient: () => clientMethods,
}));

// provision-server is the one stage that reaches into cloud SDKs; keep it
// mocked so this test stays a Dokploy-orchestration test (the EC2/GCE
// provisioners have their own dedicated unit tests).
const mockProvisionServer = vi.fn(async (..._a: unknown[]) => ({ dokployServerId: "srv-1", serverIp: "10.0.0.9", reused: true }));
vi.mock("../stages/provision-server.js", () => ({
  stageProvisionServer: (...a: unknown[]) => mockProvisionServer(...a),
}));

// The post-deploy network stage delegates to the network dokploy-applier; that
// has its own unit tests (dokploy-applier.test.ts). Mock it here so this
// orchestration test doesn't reach into the network service's DB/client.
const mockApplyNetworkDokploy = vi.fn(async (_args: { tenantId: string; projectId: string }) => ({
  success: true,
  message: "Applied 0 security credential(s) and 0 redirect(s).",
}));
vi.mock("../../../network/domain/dokploy-applier.js", () => ({
  applyNetworkRulesDokploy: (args: { tenantId: string; projectId: string }) => mockApplyNetworkDokploy(args),
}));

const mockApplyDomainsDokploy = vi.fn(async (_args: { tenantId: string; projectId: string }) => ({
  success: true,
  message: "Applied 0 custom domains to the deployed application.",
}));
vi.mock("../../../domains/domain/dokploy-applier.js", () => ({
  applyDomainConfigDokploy: (args: { tenantId: string; projectId: string }) => mockApplyDomainsDokploy(args),
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
  clientMethods.getApplication.mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });
  clientMethods.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "done", createdAt: "x" }]);
  clientMethods.listDomains.mockResolvedValue([]);
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

    // Configure-app created the application and configured the git source.
    // GitHub (like GitLab) is routed through Dokploy's custom-git provider with
    // a clone URL, since Dockier uses a token rather than a Dokploy-registered
    // GitHub App.
    expect(clientMethods.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: "env-1", serverId: "srv-1" }),
    );
    expect(clientMethods.saveGitProvider).toHaveBeenCalledWith(
      expect.objectContaining({ customGitUrl: expect.stringContaining("github.com") }),
    );
    expect(clientMethods.saveGithubProvider).not.toHaveBeenCalled();

    // TypeScript with no Dockerfile → railpack build type.
    expect(clientMethods.saveBuildType).toHaveBeenCalledWith(
      expect.objectContaining({ buildType: "railpack" }),
    );

    // Env vars parsed (FOO, BAZ) and sent. A Node railpack app (techStack
    // "node") also gets PORT/HOST injected so Traefik can reach the server.
    const envArg = (clientMethods.saveEnvironment.mock.calls.at(-1)?.[0] as { env: string }).env;
    expect(envArg).toContain("FOO=bar");
    expect(envArg).toContain("BAZ=qux");
    expect(envArg).toContain("PORT=3000");
    expect(envArg).toContain("HOST=0.0.0.0");

    // Deploy triggered and succeeded.
    expect(clientMethods.deploy).toHaveBeenCalled();
    expect(statusCalls).toEqual(expect.arrayContaining(["building", "deploying", "success"]));

    // App URL persisted.
    expect(dbUpdateEq).toHaveBeenCalled();
  });

  it("recovers via automated diagnosis: first deploy errors, retry succeeds", async () => {
    clientMethods.listDeployments
      .mockResolvedValueOnce([]) // attempt 1 pre-trigger snapshot
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }])   // attempt 1 poll → error
      .mockResolvedValueOnce([{ deploymentId: "d1", status: "error", createdAt: "x" }])   // attempt 2 snapshot
      .mockResolvedValue([{ deploymentId: "d2", status: "done", createdAt: "y" }]);       // attempt 2 poll → done

    await executeDokployPipeline(input());

    // Deploy attempted twice, automated recovery invoked once between attempts.
    expect(clientMethods.deploy).toHaveBeenCalledTimes(2);
    expect(clientMethods.triggerAIFix).toHaveBeenCalledTimes(1);
    expect(statusCalls).toContain("success");

    const aiLog = logLines.find((l) => l.includes("Applied automatic fix"));
    expect(aiLog).toContain("bumped node version");
  });

  it("fails after the configured attempts when deploy never succeeds", async () => {
    clientMethods.listDeployments.mockResolvedValue([{ deploymentId: "d1", status: "error", createdAt: "x" }]);

    await executeDokployPipeline(input());

    // maxAttempts is 2 for the Dokploy pipeline.
    expect(clientMethods.deploy).toHaveBeenCalledTimes(2);
    // Automated recovery attempted only between attempts (not after the last).
    expect(clientMethods.triggerAIFix).toHaveBeenCalledTimes(1);
    expect(statusCalls).toContain("failed");
    expect(statusCalls).not.toContain("success");

    const failLog = logLines.find((l) => l.includes("Pipeline failed"));
    expect(failLog).toContain("failed after 2 attempts");
  });

  it("chooses dockerfile build type when the repo has a Dockerfile", async () => {
    await executeDokployPipeline(input({ hasDocker: true }));

    expect(clientMethods.saveBuildType).toHaveBeenCalledWith(
      expect.objectContaining({ buildType: "dockerfile" }),
    );
  });

  it("injects Railpack PHP defaults (extensions + skip migrations) for PHP apps", async () => {
    await executeDokployPipeline(input({ primaryLanguage: "php" }));

    // The env sent to Dokploy includes the default PHP extensions and disables
    // build-time migrations, so Laravel/Filament apps build without repo changes.
    const envCalls = clientMethods.saveEnvironment.mock.calls as unknown as Array<[{ env: string }]>;
    const envCall = envCalls.at(-1)?.[0];
    expect(envCall?.env).toContain("RAILPACK_PHP_EXTENSIONS=");
    expect(envCall?.env).toContain("intl");
    expect(envCall?.env).toContain("gd");
    expect(envCall?.env).toContain("RAILPACK_SKIP_MIGRATIONS=true");
  });

  it("does not inject PHP defaults for non-PHP apps", async () => {
    await executeDokployPipeline(input({ primaryLanguage: "typescript" }));

    const envCalls = clientMethods.saveEnvironment.mock.calls as unknown as Array<[{ env: string }]>;
    const envCall = envCalls.at(-1)?.[0];
    expect(envCall?.env).not.toContain("RAILPACK_PHP_EXTENSIONS");
  });

  it("treats managed services as no-ops (app uses its own credentials) and still deploys", async () => {
    // A managed database means the app connects to an external DB via its own
    // env vars — nothing to provision. The deploy should succeed and simply
    // note the managed service; no DB-provisioning calls happen.
    await executeDokployPipeline(input({
      services: [{ type: "database", name: "MySQL", mode: "managed" }],
    }));

    expect(statusCalls).toContain("success");
    expect(logLines.some((l) => /Managed services/i.test(l))).toBe(true);
    // Env is still configured (managed DB creds ride along in the app env).
    expect(clientMethods.saveEnvironment).toHaveBeenCalled();
  });

  it("provisions a self-hosted (vps) database and its connection env OVERRIDES the app's dev-time DB_HOST", async () => {
    // The project env carries dev-time defaults (DB_HOST=127.0.0.1) that would
    // cause "connection refused" in the container. For a self-hosted DB the
    // provisioned host must win.
    revealEnv.mockResolvedValueOnce({ exists: true, content: "DB_CONNECTION=mysql\nDB_HOST=127.0.0.1\nDB_PORT=3306" });

    await executeDokployPipeline(input({
      services: [{ type: "database", name: "MySQL/PostgreSQL", mode: "vps" }],
    }));

    expect(statusCalls).toContain("success");
    // DB_CONNECTION=mysql is honored (name "MySQL/PostgreSQL" must NOT force postgres).
    expect(clientMethods.createMysql).toHaveBeenCalled();
    expect(clientMethods.createPostgres).not.toHaveBeenCalled();

    const envCalls = clientMethods.saveEnvironment.mock.calls as unknown as Array<[{ env: string }]>;
    const env = envCalls.at(-1)?.[0]?.env ?? "";
    // Provisioned host wins over the user's 127.0.0.1, and is the
    // Swarm-resolvable tasks.<appName> form so the app can actually reach it.
    expect(env).toContain("DB_HOST=tasks.myapp-database-abcdef");
    expect(env).not.toContain("DB_HOST=127.0.0.1");
  });

  it("provisions a single Redis shared across queue + broadcasting (not one each)", async () => {
    await executeDokployPipeline(input({
      services: [
        { type: "queue", name: "Queue", mode: "vps" },
        { type: "broadcasting", name: "Broadcasting", mode: "vps" },
      ],
    }));

    expect(statusCalls).toContain("success");
    // One Redis, not two.
    expect(clientMethods.createRedis).toHaveBeenCalledTimes(1);
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

  it("clears a stale mapping when the mapped Dokploy project was deleted, then recreates", async () => {
    // Local mapping points at a project that no longer exists in Dokploy
    // (deleted in the UI). getProject rejects → the stale mapping is cleared
    // and a fresh project is created rather than trusting the dangling id.
    tenantProject = { id: "tp-x", organizationId: "tenant-1", dokployProjectId: "dpj-deleted", dokployEnvironmentId: "env-deleted" };
    deleteTenantProject.mockClear();
    clientMethods.getProject.mockRejectedValueOnce(new Error("404 project not found"));

    await executeDokployPipeline(input());

    // Stale mapping cleared...
    expect(deleteTenantProject).toHaveBeenCalled();
    // ...and a new project created (nothing to adopt: listProjects is empty by default).
    expect(clientMethods.createProject).toHaveBeenCalled();
  });

  it("clears a stale application mapping when the mapped app was deleted, then recreates", async () => {
    // A mapping row points at an application that no longer exists in Dokploy
    // (deleted out-of-band). The existence check (getApplication) 404s on that
    // id, so configure-app must clear the mapping and create a fresh app rather
    // than calling saveGitProvider on the dead id (which 404s "not found").
    application = { id: "am-x", projectId: "project-1", dokployApplicationId: "app-deleted", dokployServerId: "srv-1", buildType: "railpack" };
    deleteApplicationMapping.mockClear();
    clientMethods.createApplication.mockClear();
    // First getApplication call is the existence check → reject (deleted).
    // Later calls (appUrl extraction on success) → resolve normally.
    clientMethods.getApplication
      .mockRejectedValueOnce(new Error("404 Application not found"))
      .mockResolvedValue({ applicationStatus: "done", appName: "my-app", serverId: "srv-1" });

    await executeDokployPipeline(input());

    // Stale application mapping cleared, and a fresh application created.
    expect(deleteApplicationMapping).toHaveBeenCalled();
    expect(clientMethods.createApplication).toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mapping layer (in-memory) ─────────────────────────────────────
// getApplication returns null so stageConfigureApp always creates a fresh app
// (the create path exercises the full env-configuration logic we're testing).
vi.mock("../mappings.js", () => ({
  getApplication: vi.fn(async () => null),
  upsertApplication: vi.fn(async () => undefined),
  deleteApplicationMapping: vi.fn(async () => undefined),
}));

const { stageConfigureApp } = await import("../stages/configure-app.js");
import type { DokployClient } from "../client.js";
import type { GitProviderConfig } from "../stages/sync-git.js";
import type { ProvisionedDatabase } from "../stages/provision-databases.js";

/**
 * These tests focus on the env vars sent to Dokploy's saveEnvironment — in
 * particular the Railpack PHP defaults that drive whether Laravel migrations
 * (and the optimize/cache post-deploy steps) run at container startup.
 */
describe("stageConfigureApp — Railpack PHP env defaults", () => {
  let savedEnv: string | null;
  let client: {
    createApplication: ReturnType<typeof vi.fn>;
    getApplication: ReturnType<typeof vi.fn>;
    saveGithubProvider: ReturnType<typeof vi.fn>;
    saveGitlabProvider: ReturnType<typeof vi.fn>;
    saveGitProvider: ReturnType<typeof vi.fn>;
    saveBuildType: ReturnType<typeof vi.fn>;
    saveEnvironment: ReturnType<typeof vi.fn>;
  };
  const log = async () => {};

  beforeEach(() => {
    savedEnv = null;
    client = {
      createApplication: vi.fn(async () => ({ applicationId: "app-1" })),
      getApplication: vi.fn(async () => ({ applicationId: "app-1" })),
      saveGithubProvider: vi.fn(async () => undefined),
      saveGitlabProvider: vi.fn(async () => undefined),
      saveGitProvider: vi.fn(async () => undefined),
      saveBuildType: vi.fn(async () => undefined),
      saveEnvironment: vi.fn(async (p: { env: string }) => { savedEnv = p.env; }),
    };
  });

  afterEach(() => vi.clearAllMocks());

  const gitConfig: GitProviderConfig = {
    type: "custom",
    params: { customGitUrl: "https://x/y.git", customGitBranch: "main", customGitBuildPath: "/" },
  };

  const base = {
    projectId: "proj-1",
    projectName: "acme/my-app",
    environmentId: "env-1",
    serverId: "srv-1",
    gitConfig,
    client: undefined as unknown as DokployClient,
    log,
  };

  /** Parse the saved "K=V\n..." env string into a name→value map. */
  const envMap = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!savedEnv) return out;
    for (const line of savedEnv.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
    }
    return out;
  };

  const phpRailpack = {
    repoAnalysis: { hasDockerfile: false, isStaticSite: false, primaryLanguage: "php" },
  };

  it("does NOT skip migrations when a vps database is provisioned (migrations run at startup)", async () => {
    const provisionedDatabases: ProvisionedDatabase[] = [
      { serviceType: "database", engine: "mysql", host: "db-host", port: 3306, database: "app", user: "dockier", password: "pw" },
    ];
    await stageConfigureApp({
      ...base,
      ...phpRailpack,
      client: client as unknown as DokployClient,
      provisionedDatabases,
      envVars: [{ name: "DB_CONNECTION", value: "mysql" }],
    });

    expect(client.saveEnvironment).toHaveBeenCalledOnce();
    expect(envMap().RAILPACK_SKIP_MIGRATIONS).toBeUndefined();
  });

  it("does NOT skip migrations when the app env points at a managed database", async () => {
    await stageConfigureApp({
      ...base,
      ...phpRailpack,
      client: client as unknown as DokployClient,
      provisionedDatabases: [],
      envVars: [
        { name: "DB_CONNECTION", value: "mysql" },
        { name: "DB_HOST", value: "rds.example.com" },
      ],
    });

    expect(envMap().RAILPACK_SKIP_MIGRATIONS).toBeUndefined();
  });

  it("skips migrations when there is NO database at all (avoids first-boot crash loop)", async () => {
    await stageConfigureApp({
      ...base,
      ...phpRailpack,
      client: client as unknown as DokployClient,
      provisionedDatabases: [],
      envVars: [{ name: "APP_ENV", value: "production" }],
    });

    expect(envMap().RAILPACK_SKIP_MIGRATIONS).toBe("true");
  });

  it("treats DB_CONNECTION=sqlite as no external DB (skips migrations)", async () => {
    await stageConfigureApp({
      ...base,
      ...phpRailpack,
      client: client as unknown as DokployClient,
      provisionedDatabases: [],
      envVars: [{ name: "DB_CONNECTION", value: "sqlite" }],
    });

    expect(envMap().RAILPACK_SKIP_MIGRATIONS).toBe("true");
  });

  it("respects a user-set RAILPACK_SKIP_MIGRATIONS even when a DB is present", async () => {
    await stageConfigureApp({
      ...base,
      ...phpRailpack,
      client: client as unknown as DokployClient,
      provisionedDatabases: [
        { serviceType: "database", engine: "mysql", host: "db-host", port: 3306, password: "pw" },
      ],
      envVars: [{ name: "RAILPACK_SKIP_MIGRATIONS", value: "true" }],
    });

    // User's explicit value is preserved (single value, not duplicated/overridden).
    expect(envMap().RAILPACK_SKIP_MIGRATIONS).toBe("true");
  });

  it("applies the default RAILPACK_PHP_EXTENSIONS for PHP railpack apps", async () => {
    await stageConfigureApp({
      ...base,
      ...phpRailpack,
      client: client as unknown as DokployClient,
      provisionedDatabases: [],
      envVars: [{ name: "APP_ENV", value: "production" }],
    });

    expect(envMap().RAILPACK_PHP_EXTENSIONS).toContain("intl");
  });

  it("does not apply Railpack PHP defaults for a non-PHP app", async () => {
    await stageConfigureApp({
      ...base,
      repoAnalysis: { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript" },
      client: client as unknown as DokployClient,
      provisionedDatabases: [],
      envVars: [{ name: "APP_ENV", value: "production" }],
    });

    const env = envMap();
    expect(env.RAILPACK_SKIP_MIGRATIONS).toBeUndefined();
    expect(env.RAILPACK_PHP_EXTENSIONS).toBeUndefined();
  });
});

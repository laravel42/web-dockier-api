import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mapping layer (in-memory) ─────────────────────────────────────
let dbRow: Record<string, unknown> | null = null;
const upsertDatabase = vi.fn(async (p: Record<string, unknown>) => {
  dbRow = { id: "dbm-1", ...p };
  return dbRow;
});

const deleteDatabaseMapping = vi.fn(async (_projectId: string, _serviceType: string) => undefined);
vi.mock("../mappings.js", () => ({
  getDatabase: vi.fn(async () => dbRow),
  upsertDatabase: (...a: unknown[]) => upsertDatabase(...(a as [Record<string, unknown>])),
  deleteDatabaseMapping: (...a: unknown[]) => deleteDatabaseMapping(...(a as [string, string])),
}));

const { stageProvisionDatabases } = await import("../stages/provision-databases.js");
import type { DokployClient } from "../client.js";

describe("stageProvisionDatabases", () => {
  let client: {
    createMysql: ReturnType<typeof vi.fn>;
    deployMysql: ReturnType<typeof vi.fn>;
    createPostgres: ReturnType<typeof vi.fn>;
    deployPostgres: ReturnType<typeof vi.fn>;
    createRedis: ReturnType<typeof vi.fn>;
    deployRedis: ReturnType<typeof vi.fn>;
    databaseExists: ReturnType<typeof vi.fn>;
  };
  let logLines: string[];
  const log = async (l: string) => { logLines.push(l); };

  beforeEach(() => {
    dbRow = null;
    logLines = [];
    deleteDatabaseMapping.mockClear();
    client = {
      createMysql: vi.fn(async () => ({ id: "my-1", appName: "app-database-abc", name: "n", databaseName: "appdb", databaseUser: "dockier", databasePassword: "pw" })),
      deployMysql: vi.fn(async () => undefined),
      createPostgres: vi.fn(async () => ({ id: "pg-1", appName: "app-database-abc", name: "n", databaseName: "appdb", databaseUser: "dockier", databasePassword: "pw" })),
      deployPostgres: vi.fn(async () => undefined),
      createRedis: vi.fn(async () => ({ id: "r-1", appName: "app-cache-abc", name: "n", databasePassword: "pw" })),
      deployRedis: vi.fn(async () => undefined),
      // Default: a mapped service still exists (reuse path). Individual tests
      // override this to false to exercise the stale-mapping recreate path.
      databaseExists: vi.fn(async () => true),
    };
  });

  afterEach(() => vi.clearAllMocks());

  const base = {
    projectId: "proj-1",
    projectName: "acme/my-app",
    environmentId: "env-1",
    serverId: "srv-1",
  };

  it("ignores managed services (no provisioning)", async () => {
    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "MySQL", mode: "managed" }],
      envVars: [],
    });
    expect(result.databases).toHaveLength(0);
    expect(client.createMysql).not.toHaveBeenCalled();
  });

  it("provisions mysql by default for a vps database and deploys it", async () => {
    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [],
    });

    expect(client.createMysql).toHaveBeenCalledOnce();
    expect(client.deployMysql).toHaveBeenCalledWith("my-1");
    // The mapping stores the RAW service appName…
    expect(upsertDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", serviceType: "database", engine: "mysql", dbHost: "app-database-abc" }),
    );
    // …but the app receives the Swarm-resolvable tasks.<appName> host.
    expect(result.databases[0]).toMatchObject({ engine: "mysql", host: "tasks.app-database-abc", port: 3306, password: "pw" });
  });

  it("chooses postgres when DB_CONNECTION=pgsql", async () => {
    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [{ name: "DB_CONNECTION", value: "pgsql" }],
    });
    expect(client.createPostgres).toHaveBeenCalledOnce();
    expect(client.createMysql).not.toHaveBeenCalled();
    expect(result.databases[0]).toMatchObject({ engine: "postgres", port: 5432 });
  });

  it("provisions redis for a vps cache service", async () => {
    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "cache", name: "Redis", mode: "vps" }],
      envVars: [],
    });
    expect(client.createRedis).toHaveBeenCalledOnce();
    expect(client.deployRedis).toHaveBeenCalledWith("r-1");
    expect(result.databases[0]).toMatchObject({ engine: "redis", host: "tasks.app-cache-abc", port: 6379 });
  });

  it("reuses an existing mapped database instead of creating a new one", async () => {
    // getDatabase (module mock) returns dbRow — set it to a stored mapping in
    // the camelCase DatabaseMapping shape the stage expects.
    dbRow = {
      id: "dbm-1", projectId: "proj-1", serviceType: "database", engine: "mysql",
      dokployDatabaseId: "my-old", dbHost: "existing-host", dbName: "appdb", dbUser: "dockier",
    };

    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [],
    });

    expect(client.databaseExists).toHaveBeenCalledWith("mysql", "my-old");
    expect(client.createMysql).not.toHaveBeenCalled();
    expect(deleteDatabaseMapping).not.toHaveBeenCalled();
    // Reuse path also hands the app the Swarm-resolvable host.
    expect(result.databases[0]).toMatchObject({ engine: "mysql", host: "tasks.existing-host" });
  });

  it("recreates the service when the mapped DB no longer exists in Dokploy (stale mapping)", async () => {
    dbRow = {
      id: "dbm-1", projectId: "proj-1", serviceType: "database", engine: "mysql",
      dokployDatabaseId: "my-gone", dbHost: "dead-host", dbName: "credito_filament", dbUser: "dockier",
    };
    // The mapped service was deleted out-of-band in Dokploy.
    client.databaseExists.mockResolvedValue(false);

    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [{ name: "DB_CONNECTION", value: "mysql" }, { name: "DB_DATABASE", value: "credito_filament" }],
    });

    // Stale mapping cleared, then a fresh service created and wired in.
    expect(client.databaseExists).toHaveBeenCalledWith("mysql", "my-gone");
    expect(deleteDatabaseMapping).toHaveBeenCalledWith("proj-1", "database");
    expect(client.createMysql).toHaveBeenCalledOnce();
    expect(result.databases[0]).toMatchObject({ engine: "mysql", host: "tasks.app-database-abc" });
    expect(logLines.some((l) => /no longer exists — clearing stale mapping/i.test(l))).toBe(true);
  });

  it("does not double-prefix a reused host that is already tasks.-normalized", async () => {
    dbRow = {
      id: "dbm-1", projectId: "proj-1", serviceType: "database", engine: "mysql",
      dokployDatabaseId: "my-old", dbHost: "tasks.existing-host", dbName: "appdb", dbUser: "dockier",
    };

    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [],
    });

    expect(result.databases[0]).toMatchObject({ engine: "mysql", host: "tasks.existing-host" });
  });

  it("creates the mysql db with the app's own DB_DATABASE/DB_USERNAME/DB_PASSWORD when set", async () => {
    await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [
        { name: "DB_CONNECTION", value: "mysql" },
        { name: "DB_DATABASE", value: "credito_filament" },
        { name: "DB_USERNAME", value: "app_user" },
        { name: "DB_PASSWORD", value: "s3cret" },
      ],
    });

    expect(client.createMysql).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: "credito_filament", databaseUser: "app_user", databasePassword: "s3cret" }),
    );
  });

  it("falls back to the dockier user when the app requests a reserved username (root)", async () => {
    await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [
        { name: "DB_CONNECTION", value: "mysql" },
        { name: "DB_DATABASE", value: "credito_filament" },
        { name: "DB_USERNAME", value: "root" },
        { name: "DB_PASSWORD", value: "123456789" },
      ],
    });

    expect(client.createMysql).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: "credito_filament", databaseUser: "dockier", databasePassword: "123456789" }),
    );
  });

  it("uses the app's REDIS_PASSWORD when creating a vps redis service", async () => {
    await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "cache", name: "Redis", mode: "vps" }],
      envVars: [{ name: "REDIS_PASSWORD", value: "redis-pw" }],
    });

    expect(client.createRedis).toHaveBeenCalledWith(
      expect.objectContaining({ databasePassword: "redis-pw" }),
    );
  });

  it("is best-effort: a provisioning failure is logged and does not throw", async () => {
    client.createMysql.mockRejectedValueOnce(new Error("boom"));
    const result = await stageProvisionDatabases({
      ...base,
      client: client as unknown as DokployClient,
      log,
      services: [{ type: "database", name: "Database", mode: "vps" }],
      envVars: [],
    });
    expect(result.databases).toHaveLength(0);
    expect(logLines.some((l) => /Failed to provision/i.test(l))).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

let connectCalls = 0;
let queryCalls = 0;
/** Versions the fake ledger reports as applied. */
let appliedVersions: string[] = [];
let connectError: Error | null = null;

class FakeClient {
  async connect(): Promise<void> {
    connectCalls += 1;
    if (connectError) throw connectError;
  }
  async query(sql: string): Promise<{ rows: Array<{ version: string }> }> {
    if (sql.startsWith("SET")) return { rows: [] };
    queryCalls += 1;
    return { rows: appliedVersions.map((version) => ({ version })) };
  }
  async end(): Promise<void> {}
}

vi.mock("pg", () => ({ default: { Client: FakeClient } }));

vi.mock("../postgres.js", () => ({
  getPostgresConnectionConfig: () => ({ connectionString: "postgres://fake" }),
}));

vi.mock("../../config.js", () => ({
  env: { get DATABASE_URL() { return databaseUrl; } },
}));

vi.mock("../../logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../migration-manifest.js", () => ({
  MIGRATION_VERSIONS: ["0001", "0073", "0075"] as readonly string[],
}));

let databaseUrl: string | undefined = "postgres://fake";

const { getMigrationState, resetMigrationStateCache } = await import("../migration-state.js");

beforeEach(() => {
  connectCalls = 0;
  queryCalls = 0;
  appliedVersions = [];
  connectError = null;
  databaseUrl = "postgres://fake";
  resetMigrationStateCache();
});

describe("getMigrationState", () => {
  it("reports ready when every canonical version is applied", async () => {
    appliedVersions = ["0001", "0073", "0075"];

    await expect(getMigrationState()).resolves.toEqual({ status: "ready" });
  });

  it("names the missing versions as pending", async () => {
    // The incident: the ledger stopped at 0073 while the code needed 0075.
    appliedVersions = ["0001", "0073"];

    await expect(getMigrationState()).resolves.toEqual({
      status: "pending",
      versions: ["0075"],
    });
  });

  it("ignores versions applied but not in the manifest", async () => {
    // An extra applied migration is not a pending one — the difference is
    // one-directional on purpose.
    appliedVersions = ["0001", "0073", "0074", "0075", "0099"];

    await expect(getMigrationState()).resolves.toEqual({ status: "ready" });
  });

  it("fails open to unknown when the ledger cannot be read", async () => {
    // A role without access to supabase_migrations must not mark a healthy
    // instance degraded. A diagnostic that invents outages is worse than none.
    connectError = new Error("permission denied for schema supabase_migrations");

    const state = await getMigrationState();

    expect(state.status).toBe("unknown");
    expect(state).toMatchObject({ reason: expect.stringContaining("permission denied") });
  });

  it("fails open to unknown when DATABASE_URL is absent", async () => {
    databaseUrl = undefined;

    const state = await getMigrationState();

    expect(state.status).toBe("unknown");
    expect(connectCalls).toBe(0);
  });

  it("shares one query across concurrent callers", async () => {
    appliedVersions = ["0001", "0073", "0075"];

    const [a, b, c] = await Promise.all([
      getMigrationState(),
      getMigrationState(),
      getMigrationState(),
    ]);

    expect(a).toEqual(b);
    expect(b).toEqual(c);
    // At deploy scale a probe runs often; three callers must not mean three
    // connections.
    expect(queryCalls).toBe(1);
  });

  it("caches the result, including a pending one", async () => {
    appliedVersions = ["0001"];

    await getMigrationState();
    await getMigrationState();

    expect(queryCalls).toBe(1);
  });

  it("caches an unknown result too, so a broken read is not re-queried per request", async () => {
    connectError = new Error("connection refused");

    await getMigrationState();
    await getMigrationState();

    expect(connectCalls).toBe(1);
  });
});

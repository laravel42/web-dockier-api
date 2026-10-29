/**
 * Compose mapping layer and the resource resolver.
 *
 * getProjectResource is the chokepoint that keeps every consumer honest about
 * the two Dokploy resource kinds (teardown, the domains and network appliers,
 * command execution, the cancel route). The resolution ORDER is the part worth
 * testing hardest: getting it wrong means a compose project reads as an
 * application, and teardown then deletes an application that does not exist
 * while leaving a running stack — and its volumes — billing.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));

const mockFrom = vi.fn();

vi.mock("../../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const { getCompose, upsertCompose, deleteComposeMapping, getProjectResource } = await import(
  "../mappings.js"
);

// ─── Helpers ───────────────────────────────────────────────────────

function createChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "insert", "update", "upsert", "delete", "eq", "single", "maybeSingle"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  // `delete().eq()` resolves without .single(), so the chain must be awaitable.
  chain.then = ((resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)) as never;
  return chain;
}

/** Route each table name to its own result, so the resolver can be exercised. */
function routeTables(byTable: Record<string, { data: unknown; error: unknown }>) {
  mockFrom.mockImplementation((table: string) =>
    createChain(byTable[table] ?? { data: null, error: null }),
  );
}

const COMPOSE_ROW = {
  id: "uuid-c1",
  project_id: "proj-1",
  dokploy_compose_id: "dcomp-1",
  dokploy_server_id: "dsrv-1",
  app_name: "compose-abc123",
  compose_path: "./deploy/dokploy/docker-compose.yml",
  entry_service: "web",
  entry_port: 3000,
  service_names: ["postgres", "api", "sessions", "runtime-image", "web"],
};

const APPLICATION_ROW = {
  id: "uuid-a1",
  project_id: "proj-1",
  dokploy_application_id: "dapp-1",
  dokploy_server_id: "dsrv-1",
  build_type: "railpack",
  app_name: "my-app",
  container_port: 3000,
};

// ─── Tests ─────────────────────────────────────────────────────────

describe("getCompose", () => {
  afterEach(() => vi.clearAllMocks());

  it("maps a row to the compose mapping shape", async () => {
    mockFrom.mockReturnValue(createChain({ data: COMPOSE_ROW, error: null }));

    expect(await getCompose("proj-1")).toEqual({
      id: "uuid-c1",
      projectId: "proj-1",
      dokployComposeId: "dcomp-1",
      dokployServerId: "dsrv-1",
      appName: "compose-abc123",
      composePath: "./deploy/dokploy/docker-compose.yml",
      entryService: "web",
      entryPort: 3000,
      serviceNames: ["postgres", "api", "sessions", "runtime-image", "web"],
    });
    expect(mockFrom).toHaveBeenCalledWith("dokploy_composes");
  });

  it("returns null when the project has no compose mapping", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: null }));
    expect(await getCompose("proj-none")).toBeNull();
  });

  it("defaults the compose path and the service list on a sparse row", async () => {
    // A row written before the service list was known: the stage upserts the
    // ids first and the names only after loadServices succeeds.
    mockFrom.mockReturnValue(
      createChain({
        data: { id: "u", project_id: "p", dokploy_compose_id: "c", compose_path: null, service_names: null },
        error: null,
      }),
    );

    const mapping = await getCompose("p");
    expect(mapping?.composePath).toBe("./docker-compose.yml");
    expect(mapping?.serviceNames).toEqual([]);
    expect(mapping?.entryService).toBeNull();
    expect(mapping?.entryPort).toBeNull();
  });

  it("throws on a database error", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: { message: "connection failed" } }));
    await expect(getCompose("proj-1")).rejects.toThrow(/Failed to query dokploy_composes/);
  });
});

describe("upsertCompose", () => {
  afterEach(() => vi.clearAllMocks());

  it("upserts on project_id", async () => {
    const chain = createChain({ data: COMPOSE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await upsertCompose({ projectId: "proj-1", dokployComposeId: "dcomp-1" });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "proj-1", dokploy_compose_id: "dcomp-1" }),
      { onConflict: "project_id" },
    );
  });

  it("omits fields it was not given, so a later upsert cannot clobber them", async () => {
    // configure-compose upserts twice: the ids first, then the service list and
    // entry service once loadServices has run. The second write must not be
    // able to null out the first, and vice versa.
    const chain = createChain({ data: COMPOSE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await upsertCompose({ projectId: "proj-1", dokployComposeId: "dcomp-1" });

    const payload = chain.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("app_name");
    expect(payload).not.toHaveProperty("entry_service");
    expect(payload).not.toHaveProperty("entry_port");
    expect(payload).not.toHaveProperty("service_names");
    expect(payload).not.toHaveProperty("compose_path");
  });

  it("writes every field it was given", async () => {
    const chain = createChain({ data: COMPOSE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await upsertCompose({
      projectId: "proj-1",
      dokployComposeId: "dcomp-1",
      dokployServerId: "dsrv-1",
      appName: "compose-abc123",
      composePath: "./deploy/dokploy/docker-compose.yml",
      entryService: "web",
      entryPort: 3000,
      serviceNames: ["api", "web"],
    });

    expect(chain.upsert.mock.calls[0][0]).toMatchObject({
      dokploy_server_id: "dsrv-1",
      app_name: "compose-abc123",
      compose_path: "./deploy/dokploy/docker-compose.yml",
      entry_service: "web",
      entry_port: 3000,
      service_names: ["api", "web"],
    });
  });

  it("writes an entry port of 0 rather than treating it as absent", async () => {
    // Guards the `!== undefined` check: a falsy-but-present value must still be
    // written. 0 is not a valid port, but the mapping layer is not where that
    // is enforced, and a `params.entryPort ?` test here would silently drop it.
    const chain = createChain({ data: COMPOSE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await upsertCompose({ projectId: "p", dokployComposeId: "c", entryPort: 0 });

    expect(chain.upsert.mock.calls[0][0]).toMatchObject({ entry_port: 0 });
  });

  it("throws on a database error", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: { message: "nope" } }));
    await expect(upsertCompose({ projectId: "p", dokployComposeId: "c" })).rejects.toThrow(
      /Failed to upsert dokploy_composes/,
    );
  });
});

describe("deleteComposeMapping", () => {
  afterEach(() => vi.clearAllMocks());

  it("deletes the project's row", async () => {
    const chain = createChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await deleteComposeMapping("proj-1");

    expect(mockFrom).toHaveBeenCalledWith("dokploy_composes");
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("project_id", "proj-1");
  });

  it("throws on a database error", async () => {
    mockFrom.mockReturnValue(createChain({ data: null, error: { message: "nope" } }));
    await expect(deleteComposeMapping("proj-1")).rejects.toThrow(
      /Failed to delete dokploy_composes row/,
    );
  });
});

describe("getProjectResource", () => {
  afterEach(() => vi.clearAllMocks());

  it("resolves a compose project", async () => {
    routeTables({ dokploy_composes: { data: COMPOSE_ROW, error: null } });

    const resource = await getProjectResource("proj-1");

    expect(resource.kind).toBe("compose");
    if (resource.kind !== "compose") throw new Error("unreachable");
    expect(resource.compose.dokployComposeId).toBe("dcomp-1");
  });

  it("resolves an application project", async () => {
    routeTables({ dokploy_applications: { data: APPLICATION_ROW, error: null } });

    const resource = await getProjectResource("proj-1");

    expect(resource.kind).toBe("application");
    if (resource.kind !== "application") throw new Error("unreachable");
    expect(resource.application.dokployApplicationId).toBe("dapp-1");
  });

  it("resolves a project with neither", async () => {
    routeTables({});
    expect(await getProjectResource("proj-1")).toEqual({ kind: "none" });
  });

  it("prefers compose when a project somehow holds both rows", async () => {
    // Should not happen, but if an application row were left behind after a
    // switch to a compose deploy, the compose stack is the live resource. If
    // the stale application row won, teardown would delete an application that
    // is already gone and leave the stack running.
    routeTables({
      dokploy_composes: { data: COMPOSE_ROW, error: null },
      dokploy_applications: { data: APPLICATION_ROW, error: null },
    });

    expect((await getProjectResource("proj-1")).kind).toBe("compose");
  });

  it("does not query the applications table once compose matched", async () => {
    routeTables({ dokploy_composes: { data: COMPOSE_ROW, error: null } });

    await getProjectResource("proj-1");

    expect(mockFrom).toHaveBeenCalledWith("dokploy_composes");
    expect(mockFrom).not.toHaveBeenCalledWith("dokploy_applications");
  });

  it("propagates a database error rather than reporting no resource", async () => {
    // Reporting "none" on a failed query would make teardown skip every
    // resource and report success, so the error must surface.
    routeTables({ dokploy_composes: { data: null, error: { message: "down" } } });

    await expect(getProjectResource("proj-1")).rejects.toThrow(/dokploy_composes/);
  });
});

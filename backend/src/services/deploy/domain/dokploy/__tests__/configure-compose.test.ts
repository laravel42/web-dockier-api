import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../../shared/config.js", () => ({ env: createTestEnv() }));

const mockGetCompose = vi.fn();
const mockUpsertCompose = vi.fn(async () => ({}) as never);
const mockDeleteComposeMapping = vi.fn(async () => undefined);
vi.mock("../mappings.js", () => ({
  getCompose: (...a: unknown[]) => mockGetCompose(...a),
  upsertCompose: (...a: unknown[]) => mockUpsertCompose(...(a as [])),
  deleteComposeMapping: (...a: unknown[]) => mockDeleteComposeMapping(...(a as [])),
}));

const { stageConfigureCompose, ComposeConfigError } = await import("../stages/configure-compose.js");

// ─── Fixtures ──────────────────────────────────────────────────────

const BERRY_SERVICES = ["postgres", "api", "sessions", "runtime-image", "web"];

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    composeExists: vi.fn(async () => true),
    getCompose: vi.fn(async () => ({ composeId: "dcomp-1", appName: "compose-abc" })),
    createCompose: vi.fn(async () => ({ composeId: "dcomp-1", appName: "compose-abc" })),
    updateCompose: vi.fn(async () => undefined),
    saveComposeEnvironment: vi.fn(async () => undefined),
    loadComposeServices: vi.fn(async () => BERRY_SERVICES),
    ...overrides,
  };
}

const GIT_CONFIG = {
  type: "custom" as const,
  params: {
    customGitUrl: "https://x-access-token:tok@github.com/laravel42/berry.git",
    customGitBranch: "main",
    customGitBuildPath: "/",
    enableSubmodules: false,
    watchPaths: [],
  },
};

const COMPOSE_CONFIG = {
  path: "./deploy/dokploy/docker-compose.yml",
  entryService: "web",
  entryPort: 3000,
};

const logLines: string[] = [];
const log = async (line: string) => void logLines.push(line);

function run(client: unknown, extra: Record<string, unknown> = {}) {
  return stageConfigureCompose({
    projectId: "proj-1",
    projectName: "berry",
    environmentId: "env-1",
    serverId: "srv-1",
    gitConfig: GIT_CONFIG,
    compose: COMPOSE_CONFIG,
    envVars: [{ name: "POSTGRES_PASSWORD", value: "secret" }],
    client: client as never,
    log,
    ...extra,
  });
}

beforeEach(() => {
  logLines.length = 0;
  mockGetCompose.mockResolvedValue(null);
});
afterEach(() => vi.clearAllMocks());

// ─── Required variables ────────────────────────────────────────────

describe("stageConfigureCompose — required variables", () => {
  it("blocks the deploy BEFORE creating anything when a required variable is unset", async () => {
    // `${VAR:?}` makes `docker compose` abort, and its error reaches only the
    // build log the user cannot read. Failing here names the variables instead.
    const client = createClient();

    await expect(
      run(client, { requiredVars: ["POSTGRES_PASSWORD", "BERRY_DOMAIN", "BERRY_AUTH_SECRET"] }),
    ).rejects.toThrow(ComposeConfigError);

    expect(client.createCompose).not.toHaveBeenCalled();
    expect(mockUpsertCompose).not.toHaveBeenCalled();
  });

  it("names every missing variable in the message", async () => {
    await expect(
      run(createClient(), { requiredVars: ["BERRY_DOMAIN", "BERRY_AUTH_SECRET"] }),
    ).rejects.toThrow(/BERRY_DOMAIN, BERRY_AUTH_SECRET/);
  });

  it("treats a variable set to an empty string as missing", async () => {
    // `${VAR:?}` rejects empty as well as unset, so an empty value must not
    // satisfy the check.
    await expect(
      run(createClient(), {
        envVars: [{ name: "BERRY_DOMAIN", value: "" }],
        requiredVars: ["BERRY_DOMAIN"],
      }),
    ).rejects.toThrow(/BERRY_DOMAIN/);
  });

  it("proceeds when every required variable is provided", async () => {
    const result = await run(createClient(), { requiredVars: ["POSTGRES_PASSWORD"] });
    expect(result.dokployComposeId).toBe("dcomp-1");
  });
});

// ─── Create / reuse ────────────────────────────────────────────────

describe("stageConfigureCompose — create and reuse", () => {
  it("creates a stack with a serverId and plain-git source", async () => {
    const client = createClient();
    await run(client);

    expect(client.createCompose).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "berry",
        environmentId: "env-1",
        // Required in practice: compose.create rejects without it when the
        // instance has no default local server.
        serverId: "srv-1",
        sourceType: "git",
        composeType: "docker-compose",
      }),
    );
  });

  it("reuses a mapped stack that still exists", async () => {
    mockGetCompose.mockResolvedValue({ dokployComposeId: "dcomp-existing", appName: "compose-xyz" });
    const client = createClient();

    const result = await run(client);

    expect(client.createCompose).not.toHaveBeenCalled();
    expect(mockDeleteComposeMapping).not.toHaveBeenCalled();
    expect(result.dokployComposeId).toBe("dcomp-existing");
  });

  it("clears a stale mapping and recreates when the stack is gone from Dokploy", async () => {
    // Deleted in the Dokploy UI. Reusing the id makes every later call fail
    // with "Compose not found".
    mockGetCompose.mockResolvedValue({ dokployComposeId: "dcomp-gone", appName: null });
    const client = createClient({ composeExists: vi.fn(async () => false) });

    await run(client);

    expect(mockDeleteComposeMapping).toHaveBeenCalledWith("proj-1");
    expect(client.createCompose).toHaveBeenCalled();
    expect(logLines.some((l) => /no longer exists/i.test(l))).toBe(true);
  });

  it("refreshes a missing appName from Dokploy on the reuse path", async () => {
    // appName is how compose containers are located (`<appName>-<service>-N`).
    mockGetCompose.mockResolvedValue({ dokployComposeId: "dcomp-1", appName: null });
    const client = createClient();

    const result = await run(client);

    expect(client.getCompose).toHaveBeenCalledWith("dcomp-1");
    expect(result.appName).toBe("compose-abc");
  });
});

// ─── Git source and compose path ───────────────────────────────────

describe("stageConfigureCompose — source configuration", () => {
  it("sets the compose path through update, since create ignores it", async () => {
    // Verified against the live API: compose.create keeps its
    // ./docker-compose.yml default whatever it is passed.
    const client = createClient();
    await run(client);

    expect(client.createCompose).toHaveBeenCalledWith(
      expect.not.objectContaining({ composePath: expect.anything() }),
    );
    expect(client.updateCompose).toHaveBeenCalledWith(
      expect.objectContaining({
        composeId: "dcomp-1",
        composePath: "./deploy/dokploy/docker-compose.yml",
      }),
    );
  });

  it("passes the clone URL through from sync-git unchanged", async () => {
    // stageSyncGit already produces a token-authenticated custom-git URL for
    // every provider, which is exactly what sourceType "git" wants. Rewriting
    // it here would strip the credentials.
    const client = createClient();
    await run(client);

    expect(client.updateCompose).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "git",
        customGitUrl: GIT_CONFIG.params.customGitUrl,
        customGitBranch: "main",
      }),
    );
  });

  it("requests an .env file so ${VAR} interpolation resolves", async () => {
    // Dokploy does not read the repo's own env_file, so the stack sees its
    // variables only through this.
    const client = createClient();
    await run(client);

    expect(client.updateCompose).toHaveBeenCalledWith(
      expect.objectContaining({ createEnvFile: true }),
    );
    expect(client.saveComposeEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({ env: "POSTGRES_PASSWORD=secret", createEnvFile: true }),
    );
  });

  it("writes an empty env rather than skipping, so a previous env is cleared", async () => {
    const client = createClient();
    await run(client, { envVars: [] });

    expect(client.saveComposeEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({ env: "" }),
    );
  });

  it("rejects a git config that is not a plain clone URL", async () => {
    await expect(
      run(createClient(), { gitConfig: { type: "github", params: {} } }),
    ).rejects.toThrow(ComposeConfigError);
  });
});

// ─── Services ──────────────────────────────────────────────────────

describe("stageConfigureCompose — services", () => {
  it("asks Dokploy to clone and parse, and persists what it reports", async () => {
    const client = createClient();
    const result = await run(client);

    expect(client.loadComposeServices).toHaveBeenCalledWith("dcomp-1", "fetch", expect.anything());
    expect(result.serviceNames).toEqual(BERRY_SERVICES);
    expect(mockUpsertCompose).toHaveBeenLastCalledWith(
      expect.objectContaining({ serviceNames: BERRY_SERVICES, entryService: "web", entryPort: 3000 }),
    );
  });

  it("fails with a user-facing message when the services cannot be read", async () => {
    // A compose file with no `services:` key 404s here. Deploying anyway would
    // produce an empty stack.
    const client = createClient({
      loadComposeServices: vi.fn(async () => {
        throw new Error("Services not found");
      }),
    });

    await expect(run(client)).rejects.toThrow(/Could not read the services/);
  });

  it("drops a configured entry service that the compose file does not declare", async () => {
    // Renamed or removed in the repo. domain.create would accept the unknown
    // name and Traefik would route to nothing.
    const client = createClient();
    const result = await run(client, {
      compose: { ...COMPOSE_CONFIG, entryService: "frontend" },
    });

    expect(result.entryService).toBeUndefined();
    expect(logLines.some((l) => /not in this compose file/i.test(l))).toBe(true);
  });

  it("reports that no domain will be attached when the port is unknown", async () => {
    // Dokploy writes this port into the Traefik loadbalancer label, so a
    // guessed value is a Bad Gateway with no other symptom.
    const client = createClient();
    const result = await run(client, {
      compose: { path: COMPOSE_CONFIG.path, entryService: "web" },
    });

    expect(result.entryPort).toBeUndefined();
    expect(logLines.some((l) => /no container port is known/i.test(l))).toBe(true);
  });

  it("does not configure a build type or run command", async () => {
    // A compose stack has neither — each service builds from its own `build:`.
    // Carrying configure-app's builder logic over here would be wrong.
    const client = createClient() as unknown as Record<string, unknown>;
    await run(client);

    expect(client).not.toHaveProperty("saveBuildType.mock.calls.0");
    expect(Object.keys(client)).not.toContain("saveBuildType");
  });
});

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
    updateApplication: ReturnType<typeof vi.fn>;
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
      updateApplication: vi.fn(async () => undefined),
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

  it("applies PHP extension defaults when detected via techStack even if primaryLanguage is not php", async () => {
    await stageConfigureApp({
      ...base,
      // primaryLanguage misdetected (e.g. "blade" comes back empty), but the
      // tech stack clearly identifies a Laravel/Filament app.
      repoAnalysis: { hasDockerfile: false, isStaticSite: false, primaryLanguage: "", techStack: ["laravel", "filament"] },
      client: client as unknown as DokployClient,
      provisionedDatabases: [],
      envVars: [{ name: "APP_ENV", value: "production" }],
    });

    expect(envMap().RAILPACK_PHP_EXTENSIONS).toContain("gd");
    expect(envMap().RAILPACK_PHP_EXTENSIONS).toContain("intl");
    expect(envMap().RAILPACK_PHP_EXTENSIONS).toContain("zip");
    expect(envMap().RAILPACK_PHP_EXTENSIONS).toContain("sockets");
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

/**
 * Build-type selection. Asserts on the `buildType` (and publishDirectory)
 * sent to Dokploy's saveBuildType — the field that decides whether the app is
 * served as a static bundle or built/run as a service. A static generator
 * misbuilt as a running service serves nothing on the routed port → Bad Gateway.
 */
describe("stageConfigureApp — build type selection", () => {
  let client: {
    createApplication: ReturnType<typeof vi.fn>;
    getApplication: ReturnType<typeof vi.fn>;
    saveGithubProvider: ReturnType<typeof vi.fn>;
    saveGitlabProvider: ReturnType<typeof vi.fn>;
    saveGitProvider: ReturnType<typeof vi.fn>;
    saveBuildType: ReturnType<typeof vi.fn>;
    saveEnvironment: ReturnType<typeof vi.fn>;
    updateApplication: ReturnType<typeof vi.fn>;
  };
  const log = async () => {};

  beforeEach(() => {
    client = {
      createApplication: vi.fn(async () => ({ applicationId: "app-1" })),
      getApplication: vi.fn(async () => ({ applicationId: "app-1" })),
      saveGithubProvider: vi.fn(async () => undefined),
      saveGitlabProvider: vi.fn(async () => undefined),
      saveGitProvider: vi.fn(async () => undefined),
      saveBuildType: vi.fn(async () => undefined),
      saveEnvironment: vi.fn(async () => undefined),
      updateApplication: vi.fn(async () => undefined),
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
    provisionedDatabases: [],
    envVars: [],
    log,
  };

  const buildTypeArg = () => client.saveBuildType.mock.calls[0][0] as { buildType: string; publishDirectory: string; isStaticSpa: boolean };

  const run = async (repoAnalysis: {
    hasDockerfile: boolean;
    isStaticSite: boolean;
    primaryLanguage?: string;
    techStack?: string[];
    publishDirectory?: string;
    runtime?: string;
    phpVersion?: string;
  }) => {
    await stageConfigureApp({ ...base, repoAnalysis, client: client as unknown as DokployClient });
  };

  it("builds a source-only Astro site with Railpack (it must run the build; 'static' would COPY a non-existent dist)", async () => {
    await run({ hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Astro"] });
    expect(buildTypeArg().buildType).toBe("railpack");
  });

  it("builds Vite/Angular source SPAs with Railpack", async () => {
    await run({ hasDockerfile: false, isStaticSite: false, primaryLanguage: "typescript", techStack: ["Node.js", "Vite"] });
    expect(buildTypeArg().buildType).toBe("railpack");
    vi.clearAllMocks();
    await run({ hasDockerfile: false, isStaticSite: false, techStack: ["Angular"] });
    expect(buildTypeArg().buildType).toBe("railpack");
  });

  it("uses the 'static' build type only when the repo ships pre-built output (explicit isStaticSite)", async () => {
    await run({ hasDockerfile: false, isStaticSite: true, techStack: [], publishDirectory: "build" });
    const arg = buildTypeArg();
    expect(arg.buildType).toBe("static");
    expect(arg.isStaticSpa).toBe(true);
    expect(arg.publishDirectory).toBe("build");
  });

  it("defaults the static publishDirectory to dist when none is given", async () => {
    await run({ hasDockerfile: false, isStaticSite: true, techStack: [] });
    expect(buildTypeArg().publishDirectory).toBe("dist");
  });

  it("keeps SSR frameworks on railpack (Next.js, Nuxt, SvelteKit, Remix)", async () => {
    for (const fw of ["Next.js", "Nuxt", "SvelteKit", "Remix"]) {
      vi.clearAllMocks();
      await run({ hasDockerfile: false, isStaticSite: false, primaryLanguage: "typescript", techStack: ["Node.js", fw] });
      expect(buildTypeArg().buildType).toBe("railpack");
    }
  });

  it("keeps a server-language app on railpack", async () => {
    await run({ hasDockerfile: false, isStaticSite: false, primaryLanguage: "php", techStack: ["PHP"] });
    expect(buildTypeArg().buildType).toBe("railpack");
    vi.clearAllMocks();
    await run({ hasDockerfile: false, isStaticSite: false, primaryLanguage: "python", techStack: ["Python", "Django"] });
    expect(buildTypeArg().buildType).toBe("railpack");
  });

  it("prefers dockerfile when a Dockerfile is present, even with a committed static output", async () => {
    await run({ hasDockerfile: true, isStaticSite: true, techStack: ["Astro"] });
    expect(buildTypeArg().buildType).toBe("dockerfile");
  });

  it("defaults an unknown stack to railpack", async () => {
    await run({ hasDockerfile: false, isStaticSite: false, primaryLanguage: "", techStack: [] });
    expect(buildTypeArg().buildType).toBe("railpack");
  });

  it("falls back to nixpacks for PHP older than Railpack supports (8.1)", async () => {
    await run({
      hasDockerfile: false,
      isStaticSite: false,
      primaryLanguage: "php",
      techStack: ["PHP", "Laravel"],
      runtime: "php",
      phpVersion: "8.1",
    });
    expect(buildTypeArg().buildType).toBe("nixpacks");
  });

  it("keeps railpack for PHP 8.2 and newer", async () => {
    for (const version of ["8.2", "8.3", "8.4"]) {
      vi.clearAllMocks();
      await run({
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "php",
        techStack: ["PHP", "Laravel"],
        runtime: "php",
        phpVersion: version,
      });
      expect(buildTypeArg().buildType).toBe("railpack");
    }
  });

  it("falls back to nixpacks for PHP 7.x", async () => {
    await run({
      hasDockerfile: false,
      isStaticSite: false,
      primaryLanguage: "php",
      techStack: ["PHP"],
      runtime: "php",
      phpVersion: "7.4",
    });
    expect(buildTypeArg().buildType).toBe("nixpacks");
  });

  it("keeps railpack when the PHP version is unknown (conservative)", async () => {
    await run({ hasDockerfile: false, isStaticSite: false, primaryLanguage: "php", techStack: ["PHP"], runtime: "php" });
    expect(buildTypeArg().buildType).toBe("railpack");
  });

  it("does not apply the PHP version rule to non-PHP apps", async () => {
    await run({
      hasDockerfile: false,
      isStaticSite: false,
      primaryLanguage: "javascript",
      techStack: ["Node.js"],
      runtime: "node",
      phpVersion: "8.1",
    });
    expect(buildTypeArg().buildType).toBe("railpack");
  });

  it("prefers a repo Dockerfile over the nixpacks PHP fallback", async () => {
    await run({
      hasDockerfile: true,
      isStaticSite: false,
      primaryLanguage: "php",
      techStack: ["PHP"],
      runtime: "php",
      phpVersion: "8.1",
    });
    expect(buildTypeArg().buildType).toBe("dockerfile");
  });
});

/**
 * Container port + Node runtime env. A railpack Node app (Express, SSR Astro
 * via @astrojs/node, ...) binds the PORT env and defaults HOST to localhost.
 * We inject PORT=3000 + HOST=0.0.0.0 and route Traefik to 3000; PHP/static
 * railpack serves on 80. A mismatch is the classic Bad Gateway.
 */
describe("stageConfigureApp — container port + Node runtime env", () => {
  let savedEnv: string | null;
  let client: {
    createApplication: ReturnType<typeof vi.fn>;
    getApplication: ReturnType<typeof vi.fn>;
    saveGithubProvider: ReturnType<typeof vi.fn>;
    saveGitlabProvider: ReturnType<typeof vi.fn>;
    saveGitProvider: ReturnType<typeof vi.fn>;
    saveBuildType: ReturnType<typeof vi.fn>;
    saveEnvironment: ReturnType<typeof vi.fn>;
    updateApplication: ReturnType<typeof vi.fn>;
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
      updateApplication: vi.fn(async () => undefined),
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
    provisionedDatabases: [],
    log,
  };

  const envMap = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!savedEnv) return out;
    for (const line of savedEnv.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
    }
    return out;
  };

  const run = async (
    repoAnalysis: {
      hasDockerfile: boolean;
      isStaticSite: boolean;
      primaryLanguage?: string;
      techStack?: string[];
      startCommand?: string;
      framework?: string;
      runtime?: string;
      phpVersion?: string;
      kind?: "server" | "static";
      packageManager?: string;
      packageManagerVersion?: string;
    },
    envVars: Array<{ name: string; value: string }> = [],
    instanceType?: string,
  ) =>
    stageConfigureApp({ ...base, repoAnalysis, envVars, instanceType, client: client as unknown as DokployClient });

  // ─── Railpack pnpm pin ────────────────────────────────────────
  //
  // Railpack resolves pnpm from pnpm-lock.yaml, where pnpm 9/10/11 all write
  // `lockfileVersion: '9.0'` → it always plans pnpm 9. mise then activates the
  // repo's declared version inside /app, and pnpm 11 moved its global bin dir,
  // so `pnpm add -g node-gyp` dies on "global bin directory ... not in PATH".
  // Pinning the declared version makes the plan agree with the container.
  describe("pins the repo's declared pnpm version for Railpack", () => {
    const node = (extra: Record<string, unknown> = {}) => ({
      hasDockerfile: false,
      isStaticSite: false,
      primaryLanguage: "typescript",
      techStack: ["Node.js", "Astro"],
      ...extra,
    });
    const someEnv = [{ name: "PUBLIC_URL", value: "https://example.com" }];

    it("pins the declared version", async () => {
      await run(node({ packageManager: "pnpm", packageManagerVersion: "11.22.0" }), someEnv);
      expect(envMap().RAILPACK_PACKAGES).toBe("pnpm@11.22.0");
    });

    it("pins nothing when the repo declares no package manager", async () => {
      await run(node(), someEnv);
      expect(envMap().RAILPACK_PACKAGES).toBeUndefined();
    });

    it("leaves npm/yarn/bun to Railpack", async () => {
      await run(node({ packageManager: "yarn", packageManagerVersion: "4.5.0" }), someEnv);
      expect(envMap().RAILPACK_PACKAGES).toBeUndefined();
    });

    it("ignores a range or tag — Railpack's own inference beats a half-parsed constraint", async () => {
      await run(node({ packageManager: "pnpm", packageManagerVersion: "^11" }), someEnv);
      expect(envMap().RAILPACK_PACKAGES).toBeUndefined();

      await run(node({ packageManager: "pnpm", packageManagerVersion: "latest" }), someEnv);
      expect(envMap().RAILPACK_PACKAGES).toBeUndefined();
    });

    it("never overrides a user-set RAILPACK_PACKAGES", async () => {
      await run(node({ packageManager: "pnpm", packageManagerVersion: "11.22.0" }), [
        { name: "RAILPACK_PACKAGES", value: "pnpm@10.14.0 jq@1.7" },
      ]);
      expect(envMap().RAILPACK_PACKAGES).toBe("pnpm@10.14.0 jq@1.7");
    });

    it("does not pin for a non-railpack build", async () => {
      const result = await run(
        node({ hasDockerfile: true, packageManager: "pnpm", packageManagerVersion: "11.22.0" }),
        someEnv,
      );
      expect(result.buildType).toBe("dockerfile");
      expect(envMap().RAILPACK_PACKAGES).toBeUndefined();
    });
  });

  // ─── pnpm 11 global bin dir ───────────────────────────────────
  //
  // Railpack runs `pnpm add -g node-gyp` in its install step and picks the pnpm
  // global bin dir from the lockfile-derived version (always 9), while pnpm 11
  // moved that dir to $PNPM_HOME/bin. The step then dies with "global bin
  // directory ... is not in PATH" before installing anything. The version pin
  // cannot fix it — Railpack applies config packages after building the step —
  // so we own the install command and fix PATH there.
  describe("repairs the Railpack install step for pnpm 11+", () => {
    const node = (extra: Record<string, unknown> = {}) => ({
      hasDockerfile: false,
      isStaticSite: false,
      primaryLanguage: "typescript",
      techStack: ["Node.js", "Astro"],
      ...extra,
    });
    const someEnv = [{ name: "PUBLIC_URL", value: "https://example.com" }];

    it("puts the moved global bin dir on PATH and keeps node-gyp + install", async () => {
      await run(node({ packageManager: "pnpm", packageManagerVersion: "11.22.0" }), someEnv);
      const cmd = envMap().RAILPACK_INSTALL_CMD;
      expect(cmd).toContain('export PATH="${PNPM_HOME:-/opt/pnpm}/bin:$PATH"');
      expect(cmd).toContain("pnpm add -g node-gyp");
      expect(cmd).toContain("pnpm install --prefer-offline");
    });

    it("leaves pnpm 10 and below alone — their bin dir is where Railpack expects", async () => {
      await run(node({ packageManager: "pnpm", packageManagerVersion: "10.14.0" }), someEnv);
      expect(envMap().RAILPACK_INSTALL_CMD).toBeUndefined();

      await run(node({ packageManager: "pnpm", packageManagerVersion: "9.15.9" }), someEnv);
      expect(envMap().RAILPACK_INSTALL_CMD).toBeUndefined();
    });

    it("does not override the install step when no package manager is declared", async () => {
      await run(node(), someEnv);
      expect(envMap().RAILPACK_INSTALL_CMD).toBeUndefined();
    });

    it("never overrides a user-set RAILPACK_INSTALL_CMD", async () => {
      await run(node({ packageManager: "pnpm", packageManagerVersion: "11.22.0" }), [
        { name: "RAILPACK_INSTALL_CMD", value: "pnpm install --no-frozen-lockfile" },
      ]);
      expect(envMap().RAILPACK_INSTALL_CMD).toBe("pnpm install --no-frozen-lockfile");
    });

    it("does not touch the install step for a non-railpack build", async () => {
      await run(node({ hasDockerfile: true, packageManager: "pnpm", packageManagerVersion: "11.22.0" }), someEnv);
      expect(envMap().RAILPACK_INSTALL_CMD).toBeUndefined();
    });
  });

  it("routes a Node railpack app (SSR Astro) to port 3000 and injects PORT + HOST", async () => {
    const result = await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Astro"] },
      // A DB-less SSR app still needs at least one env var so saveEnvironment runs.
      [{ name: "PUBLIC_URL", value: "https://example.com" }],
    );
    expect(result.containerPort).toBe(3000);
    const env = envMap();
    expect(env.PORT).toBe("3000");
    expect(env.HOST).toBe("0.0.0.0");
  });

  it("sizes the build heap to the server's RAM", async () => {
    const node = { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Nuxt"] };
    const env = [{ name: "PUBLIC_URL", value: "https://example.com" }];

    await run(node, env, "t3.small");
    expect(envMap().NODE_OPTIONS).toBe("--max-old-space-size=1536");

    await run(node, env, "t3.medium");
    expect(envMap().NODE_OPTIONS).toBe("--max-old-space-size=3072");

    // Smallest AWS plan: the 768 MB floor, not 75% of 1 GB.
    await run(node, env, "t3.micro");
    expect(envMap().NODE_OPTIONS).toBe("--max-old-space-size=768");
  });

  it("injects no heap limit on a GCE machine, which is provisioned without swap", async () => {
    const node = { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Nuxt"] };
    const env = [{ name: "PUBLIC_URL", value: "https://example.com" }];

    // 75% of RAM is only backable where the provisioner adds a swapfile, which
    // the GCE path does not — promising it there invites a kernel OOM kill.
    await run(node, env, "e2-small");
    expect(envMap().NODE_OPTIONS).toBeUndefined();

    await run(node, env, "e2-micro");
    expect(envMap().NODE_OPTIONS).toBeUndefined();
  });

  it("injects no heap limit when the server's size is unknown", async () => {
    const node = { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Nuxt"] };
    const env = [{ name: "PUBLIC_URL", value: "https://example.com" }];

    // Pre-provisioned/BYO server — the provision stage reports no size.
    await run(node, env);
    expect(envMap().NODE_OPTIONS).toBeUndefined();

    // Free-form instance string (the route accepts any string) — guessing a
    // size here is what hands V8 a heap the box cannot back.
    await run(node, env, "1 vCPU / 512 MB");
    expect(envMap().NODE_OPTIONS).toBeUndefined();
  });

  it("never overrides a user-supplied NODE_OPTIONS", async () => {
    await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Nuxt"] },
      [{ name: "NODE_OPTIONS", value: "--max-old-space-size=512" }],
      "t3.medium",
    );
    expect(envMap().NODE_OPTIONS).toBe("--max-old-space-size=512");
  });

  it("injects no build heap limit for a PHP railpack app or a static Node bundle", async () => {
    await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "php", techStack: ["PHP", "Laravel"] },
      [{ name: "APP_ENV", value: "production" }],
      "t3.small",
    );
    expect(envMap().NODE_OPTIONS).toBeUndefined();

    await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Vite"], kind: "static" },
      [{ name: "PUBLIC_URL", value: "https://example.com" }],
      "t3.small",
    );
    expect(envMap().NODE_OPTIONS).toBeUndefined();
  });

  it("does not override a user-set PORT or HOST", async () => {
    const result = await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "typescript", techStack: ["Node.js", "Express"] },
      [{ name: "PORT", value: "8080" }, { name: "HOST", value: "127.0.0.1" }],
    );
    // We still route to the user's chosen port so Traefik matches.
    const env = envMap();
    expect(env.PORT).toBe("8080");
    expect(env.HOST).toBe("127.0.0.1");
    // Port resolution itself is stack-based (3000 for Node); the user owns the
    // env, but the routed port default stays 3000. (A user who remaps PORT must
    // also expose that port — documented behavior.)
    expect(result.containerPort).toBe(3000);
  });

  it("routes a PHP railpack app to port 80 and injects no Node PORT/HOST", async () => {
    const result = await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "php", techStack: ["PHP", "Laravel"] },
      [{ name: "APP_ENV", value: "production" }],
    );
    expect(result.containerPort).toBe(80);
    const env = envMap();
    expect(env.PORT).toBeUndefined();
    expect(env.HOST).toBeUndefined();
  });

  it("routes a nixpacks PHP fallback to port 80 (nginx), not 3000", async () => {
    const result = await run(
      {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "php",
        techStack: ["PHP", "Laravel"],
        runtime: "php",
        phpVersion: "8.1",
      },
      [{ name: "APP_ENV", value: "production" }],
    );
    expect(result.buildType).toBe("nixpacks");
    expect(result.containerPort).toBe(80);
  });

  it("advises when an old PHP version forces the Nixpacks builder", async () => {
    const advisories: Array<{ code: string }> = [];
    await stageConfigureApp({
      ...base,
      repoAnalysis: {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "php",
        techStack: ["PHP", "Laravel"],
        runtime: "php",
        phpVersion: "8.1",
      },
      envVars: [{ name: "APP_ENV", value: "production" }],
      client: client as unknown as DokployClient,
      advise: (a) => advisories.push(a),
    });

    expect(advisories.map((a) => a.code)).toContain("php-version-unsupported-by-railpack");
  });

  it("does not inject Railpack PHP env on a nixpacks fallback build", async () => {
    await run(
      {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "php",
        techStack: ["PHP", "Laravel"],
        runtime: "php",
        phpVersion: "8.1",
      },
      [{ name: "APP_ENV", value: "production" }],
    );
    const env = envMap();
    expect(env.RAILPACK_PHP_EXTENSIONS).toBeUndefined();
    expect(env.RAILPACK_SKIP_MIGRATIONS).toBeUndefined();
  });

  it("routes a dockerfile app to port 3000 (no Node env injected)", async () => {
    const result = await run(
      { hasDockerfile: true, isStaticSite: false, primaryLanguage: "go", techStack: ["Go", "Docker"] },
      [{ name: "APP_ENV", value: "production" }],
    );
    expect(result.containerPort).toBe(3000);
    expect(envMap().PORT).toBeUndefined();
  });

  it("injects RAILPACK_START_CMD for a railpack app when a start command is derived", async () => {
    await run(
      {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "javascript",
        techStack: ["Node.js", "Astro"],
        startCommand: "node ./dist/server/entry.mjs",
      },
      [{ name: "PUBLIC_URL", value: "https://example.com" }],
    );
    expect(envMap().RAILPACK_START_CMD).toBe("node ./dist/server/entry.mjs");
  });

  it("does not inject a start command when none was derived", async () => {
    await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Astro"] },
      [{ name: "PUBLIC_URL", value: "https://example.com" }],
    );
    expect(envMap().RAILPACK_START_CMD).toBeUndefined();
  });

  it("does not inject RAILPACK_START_CMD for a dockerfile build", async () => {
    await run(
      {
        hasDockerfile: true,
        isStaticSite: false,
        primaryLanguage: "javascript",
        techStack: ["Node.js"],
        startCommand: "node ./dist/server/entry.mjs",
      },
      [{ name: "APP_ENV", value: "production" }],
    );
    expect(envMap().RAILPACK_START_CMD).toBeUndefined();
  });

  it("also sets Dokploy's native application run command (builder-independent)", async () => {
    await run(
      {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "javascript",
        techStack: ["Node.js", "Astro"],
        startCommand: "node ./dist/server/entry.mjs",
      },
      [{ name: "PUBLIC_URL", value: "https://example.com" }],
    );
    expect(client.updateApplication).toHaveBeenCalledWith(
      expect.objectContaining({ command: "node ./dist/server/entry.mjs" }),
    );
  });

  it("CLEARS a stale run command when no start command was derived", async () => {
    // `command` persists on the Dokploy application, so a value from an earlier
    // deploy (e.g. a PHP supervisord path) would survive and break the container.
    // Reconciling to "" makes redeploys self-healing.
    await run(
      { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js", "Astro"] },
      [{ name: "PUBLIC_URL", value: "https://example.com" }],
    );
    expect(client.updateApplication).toHaveBeenCalledWith(
      expect.objectContaining({ command: "" }),
    );
  });

  it("clears the run command for a PHP nixpacks build (never injects supervisord)", async () => {
    await run(
      {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "php",
        techStack: ["PHP", "Laravel"],
        runtime: "php",
        phpVersion: "8.1",
        // Even if an upstream caller supplied one, PHP must not get a run command.
        startCommand: "/usr/bin/supervisord -c /etc/supervisor/conf.d/app.conf",
      },
      [{ name: "APP_ENV", value: "production" }],
    );
    expect(client.updateApplication).toHaveBeenCalledWith(
      expect.objectContaining({ command: "" }),
    );
  });

  it("does not fail the stage when setting the run command errors", async () => {
    client.updateApplication.mockRejectedValueOnce(new Error("400 bad request"));
    const result = await run(
      {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "javascript",
        techStack: ["Node.js", "Astro"],
        startCommand: "node ./dist/server/entry.mjs",
      },
      [{ name: "PUBLIC_URL", value: "https://example.com" }],
    );
    // Stage still completes and the env override remains in place.
    expect(result.containerPort).toBe(3000);
    expect(envMap().RAILPACK_START_CMD).toBe("node ./dist/server/entry.mjs");
  });

  it("records advisories for the adjustments it makes", async () => {
    const advisories: Array<{ code: string }> = [];
    await stageConfigureApp({
      ...base,
      repoAnalysis: {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "javascript",
        techStack: ["Node.js", "Astro"],
        framework: "astro",
        startCommand: "node ./dist/server/entry.mjs",
      },
      envVars: [{ name: "PUBLIC_URL", value: "https://example.com" }],
      client: client as unknown as DokployClient,
      advise: (a) => advisories.push(a),
    });

    const codes = advisories.map((a) => a.code);
    // Missing start script + injected PORT/HOST are both user-actionable.
    expect(codes).toContain("missing-start-script");
    expect(codes).toContain("injected-port-host");
  });

  it("does not advise about PORT when the user already set it", async () => {
    const advisories: Array<{ code: string }> = [];
    await stageConfigureApp({
      ...base,
      repoAnalysis: { hasDockerfile: false, isStaticSite: false, primaryLanguage: "javascript", techStack: ["Node.js"] },
      envVars: [{ name: "PORT", value: "8080" }, { name: "HOST", value: "0.0.0.0" }],
      client: client as unknown as DokployClient,
      advise: (a) => advisories.push(a),
    });

    expect(advisories.map((a) => a.code)).not.toContain("injected-port-host");
  });

  it("advises when migrations are skipped for a PHP app with no database", async () => {
    const advisories: Array<{ code: string }> = [];
    await stageConfigureApp({
      ...base,
      repoAnalysis: { hasDockerfile: false, isStaticSite: false, primaryLanguage: "php", techStack: ["PHP", "Laravel"] },
      envVars: [{ name: "APP_ENV", value: "production" }],
      client: client as unknown as DokployClient,
      advise: (a) => advisories.push(a),
    });

    const codes = advisories.map((a) => a.code);
    expect(codes).toContain("migrations-skipped");
    expect(codes).toContain("php-extension-defaults");
  });

  it("records no advisories when nothing needed adjusting", async () => {
    const advisories: Array<{ code: string }> = [];
    await stageConfigureApp({
      ...base,
      repoAnalysis: { hasDockerfile: true, isStaticSite: false, primaryLanguage: "go", techStack: ["Go", "Docker"] },
      envVars: [{ name: "APP_ENV", value: "production" }],
      client: client as unknown as DokployClient,
      advise: (a) => advisories.push(a),
    });

    expect(advisories).toEqual([]);
  });

  it("does not override a user-set RAILPACK_START_CMD", async () => {
    await run(
      {
        hasDockerfile: false,
        isStaticSite: false,
        primaryLanguage: "javascript",
        techStack: ["Node.js", "Astro"],
        startCommand: "node ./dist/server/entry.mjs",
      },
      [{ name: "RAILPACK_START_CMD", value: "node custom.mjs" }],
    );
    expect(envMap().RAILPACK_START_CMD).toBe("node custom.mjs");
  });
});

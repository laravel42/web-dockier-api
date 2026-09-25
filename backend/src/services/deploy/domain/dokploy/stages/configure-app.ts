/**
 * Stage: Configure Application
 *
 * Creates or updates a Dokploy Application for the project.
 * Configures git source, build type, and environment variables.
 *
 * Depends on: ensure-project, sync-git, provision-server.
 */

import type { DokployClient } from "../client.js";
import type { DokployBuildType, DeployService } from "../types.js";
import { getApplication, upsertApplication, deleteApplicationMapping } from "../mappings.js";
import type { GitProviderConfig } from "./sync-git.js";
import type { ProvisionedDatabase } from "./provision-databases.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";
import {
  type Advisory,
  missingStartScriptAdvisory,
  injectedPortHostAdvisory,
  phpExtensionDefaultsAdvisory,
  migrationsSkippedAdvisory,
  databaseEnvOverriddenAdvisory,
} from "../advisories.js";

/**
 * Railpack version to pin for railpack builds. Dokploy tags the builder image
 * as `railpack-frontend:<version>`, so this must be a real published version.
 * Kept as a single constant so it's easy to bump when validating a newer
 * Railpack release.
 */
const RAILPACK_VERSION = "0.15.4";

/**
 * Default PHP extensions installed for Railpack PHP builds via the
 * `RAILPACK_PHP_EXTENSIONS` env var.
 *
 * Railpack only installs extensions declared in the app's composer.json
 * `require` (e.g. `ext-gd`). Real Laravel/Filament apps depend on packages
 * (filament, phpspreadsheet, openspout, chrome-php, ...) that need these
 * extensions transitively but don't always declare them, so composer's
 * platform check fails the build ("ext-intl/ext-gd/... is missing"). Installing
 * a common Laravel set by default makes these apps build without requiring a
 * repo change. Users can override by setting RAILPACK_PHP_EXTENSIONS themselves.
 */
const DEFAULT_PHP_EXTENSIONS = ["gd", "intl", "zip", "sockets", "bcmath", "exif", "pcntl"];

/**
 * The port a Node railpack app is told to listen on (via PORT) and that Traefik
 * is routed to. Railpack's PHP/static images serve on 80, but a Node server
 * (Express, Astro's @astrojs/node SSR, Nuxt, etc.) listens on whatever PORT
 * says — and defaults vary (Astro's Node adapter is 4321). We pin a single
 * value, inject it as PORT so the server honors it, and route Traefik to the
 * same number. A mismatch here is the classic "Bad Gateway": Traefik forwards
 * to a port nothing is listening on. 3000 is Dokploy's conventional app port.
 */
const NODE_RAILPACK_PORT = 3000;

export interface ConfigureAppResult {
  dokployApplicationId: string;
  buildType: DokployBuildType;
  /**
   * The container port Traefik must route the app's domain to. Derived from
   * the build type and language (Node railpack → NODE_RAILPACK_PORT; PHP/static
   * railpack → 80; other builders → 3000). The deploy stage uses this to
   * register the domain on the right port.
   */
  containerPort: number;
}

export interface RepoAnalysisInfo {
  hasDockerfile: boolean;
  isStaticSite: boolean;
  publishDirectory?: string;
  primaryLanguage?: string;
  techStack?: string[];
  /** Detected framework (e.g. "astro"), used to word advisories precisely. */
  framework?: string;
  /**
   * Explicit server start command derived from repo analysis. When present and
   * the build is railpack, it's injected as RAILPACK_START_CMD so
   * Railpack launches the right process for apps whose repo has no `start`
   * script (e.g. SSR Astro → "node ./dist/server/entry.mjs").
   */
  startCommand?: string;
}

/**
 * Create or update the Dokploy Application, configure its source and build.
 */
export async function stageConfigureApp(params: {
  projectId: string;
  projectName: string;
  environmentId: string;
  serverId: string;
  gitConfig: GitProviderConfig;
  repoAnalysis: RepoAnalysisInfo;
  /**
   * Backing services detected for this deployment. Managed-mode services are
   * no-ops here (the app uses its own env credentials); vps-mode services are
   * provisioned separately and their connection env is injected into the app.
   */
  services?: DeployService[];
  /** Self-hosted databases provisioned for this deployment (vps services). */
  provisionedDatabases?: ProvisionedDatabase[];
  envVars: Array<{ name: string; value: string }>;
  client: DokployClient;
  log: (line: string) => Promise<void>;
  /**
   * Optional sink for user-facing advisories about the automatic adjustments
   * this stage makes (missing start script, injected PORT/HOST, ...). The
   * pipeline renders them as a summary so a successful deploy still tells the
   * user what Dockier compensated for. Omitted in unit tests.
   */
  advise?: (advisory: Advisory) => void;
}): Promise<ConfigureAppResult> {
  const { projectId, projectName, environmentId, serverId, gitConfig, repoAnalysis, services = [], provisionedDatabases = [], envVars, client, log, advise } = params;

  // Managed-mode services need no provisioning — the app connects to them via
  // its own env credentials (RDS/Neon/Upstash/etc.). vps-mode services are
  // provisioned on the server by the provision-databases stage; here we just
  // note them for visibility.
  const managed = services.filter((s) => s.mode === "managed");
  const vps = services.filter((s) => s.mode === "vps");
  if (managed.length > 0) {
    await log(`[stage:configure-app] Managed services (app uses its own credentials): ${managed.map((s) => s.name || s.type).join(", ")}`);
  }
  if (vps.length > 0) {
    await log(`[stage:configure-app] Self-hosted services: ${vps.map((s) => s.name || s.type).join(", ")}`);
  }

  await log("[stage:configure-app] Checking for existing application...");

  // Reuse the mapped application only if it still exists in Dokploy. An app
  // deleted out-of-band (e.g. removed in the Dokploy UI) leaves a dangling
  // mapping row; blindly reusing its id makes every subsequent call
  // (saveGitProvider, saveBuildType, ...) fail with "Application not found".
  // If it's gone, clear the stale mapping and create a fresh application.
  let applicationId: string;
  // Dokploy's Swarm service name for this app — needed later to locate the
  // running container for command execution. Captured from create/lookup and
  // persisted on the mapping.
  let appName: string | undefined;
  const existing = await getApplication(projectId);

  if (existing && (await applicationExists(existing.dokployApplicationId, client))) {
    applicationId = existing.dokployApplicationId;
    // Refresh appName from Dokploy if we don't already have it stored (e.g.
    // app created before appName was persisted). Best-effort — a lookup miss
    // just leaves it unset and command execution falls back gracefully.
    if (!existing.appName) {
      try {
        const app = await client.getApplication(applicationId);
        appName = app?.appName || undefined;
      } catch {
        // ignore — appName stays unset
      }
    }
    await log(`[stage:configure-app] Reusing existing application: ${applicationId}`);
  } else {
    if (existing) {
      await log(
        `[stage:configure-app] Mapped application ${existing.dokployApplicationId} no longer exists — clearing stale mapping and recreating.`,
      );
      await deleteApplicationMapping(projectId);
    }

    await log(`[stage:configure-app] Creating application "${projectName}"...`);
    const app = await client.createApplication({
      name: projectName,
      environmentId,
      serverId,
    });
    applicationId = app.applicationId;
    appName = app.appName || undefined;

    await upsertApplication({
      projectId,
      dokployApplicationId: applicationId,
      dokployServerId: serverId,
      appName,
    });

    await log(`[stage:configure-app] Application created: ${applicationId}`);
  }

  // ─── Configure Git Source ────────────────────────────────────────
  await log(`[stage:configure-app] Configuring git source (${gitConfig.type})...`);

  switch (gitConfig.type) {
    case "github":
      await client.saveGithubProvider({
        applicationId,
        ...gitConfig.params,
      });
      break;
    case "gitlab":
      await client.saveGitlabProvider({
        applicationId,
        ...gitConfig.params,
      });
      break;
    case "custom":
      await client.saveGitProvider({
        applicationId,
        ...gitConfig.params,
      });
      break;
  }

  // ─── Configure Build Type ───────────────────────────────────────
  const buildType = determineBuildType(repoAnalysis);
  await log(`[stage:configure-app] Setting build type: ${buildType}`);

  // Dokploy's saveBuildType requires the full field set as non-optional, even
  // for build types that don't use them. Send empty-string defaults and
  // override only the fields relevant to the chosen build type.
  //
  // railpackVersion MUST be a concrete version for railpack builds: Dokploy
  // builds the frontend image tag as `railpack-frontend:<railpackVersion>`, so
  // an empty value produces `railpack-frontend:v` (v + nothing), which doesn't
  // exist in the registry and fails with "not found". Pin a known-good version.
  await client.saveBuildType({
    applicationId,
    buildType,
    dockerfile: buildType === "dockerfile" ? "./Dockerfile" : "",
    dockerContextPath: buildType === "dockerfile" ? "./" : "",
    dockerBuildStage: "",
    herokuVersion: "",
    railpackVersion: buildType === "railpack" ? RAILPACK_VERSION : "",
    publishDirectory: buildType === "static" ? (repoAnalysis.publishDirectory || "dist") : "",
    isStaticSpa: buildType === "static",
  });

  // Update stored build type (and appName if we resolved a fresh one on the
  // reuse path — omitted when undefined so we never clobber a stored value).
  await upsertApplication({
    projectId,
    dokployApplicationId: applicationId,
    dokployServerId: serverId,
    buildType,
    appName,
  });

  // ─── Configure Environment Variables ────────────────────────────
  // Precedence: user env is the base, then the self-hosted DB connection env
  // OVERRIDES it. This is deliberate — when the user chose a self-hosted (vps)
  // database, Dockier owns the connection. The app's own DB_HOST/DB_PORT etc.
  // are dev-time defaults (typically 127.0.0.1) that would cause "connection
  // refused" in the container, so the provisioned host/port/credentials must
  // win. (Managed services provision nothing, so this override is empty and
  // the user's external-DB credentials are untouched.)
  const withDbEnv = mergeEnv(envVars, dbConnectionEnv(provisionedDatabases));
  // A database is "available" to the app at startup if we provisioned one
  // (vps) OR the app's own env points at one (managed / external). This gates
  // whether Railpack should run Laravel migrations at container startup.
  const hasDatabase = provisionedDatabases.length > 0 || hasDbEnv(withDbEnv);
  const withPhpDefaults = withRailpackPhpDefaults(withDbEnv, buildType, repoAnalysis.primaryLanguage, hasDatabase, repoAnalysis.techStack ?? []);
  // Node railpack apps need PORT/HOST so the server listens where Traefik
  // routes (and on all interfaces). No-op for PHP/static/non-railpack.
  const withNodeEnv = nodeRuntimeEnv(withPhpDefaults, buildType, repoAnalysis.primaryLanguage, repoAnalysis.techStack ?? []);
  // Hand Railpack an explicit start command when analysis derived one (e.g. SSR
  // Astro with no `start` script). Without this, Railpack finds no start
  // command and the container runs nothing → Bad Gateway.
  const finalEnv = withRailpackStartCommand(withNodeEnv, buildType, repoAnalysis.startCommand);
  if (buildType === "railpack" && repoAnalysis.startCommand && !envHas(withNodeEnv, "RAILPACK_START_CMD")) {
    await log(`[stage:configure-app] Using derived start command: ${repoAnalysis.startCommand}`);
    advise?.(missingStartScriptAdvisory(repoAnalysis.startCommand, repoAnalysis.framework));
  }
  if (provisionedDatabases.length > 0) {
    await log(`[stage:configure-app] Wired ${provisionedDatabases.length} self-hosted service(s) into the app env.`);
    advise?.(databaseEnvOverriddenAdvisory(provisionedDatabases.length));
  }

  // Report the runtime/extension defaults we injected above, comparing against
  // the caller's original env so we only advise on values WE added.
  if (!envHas(envVars, "PORT") && envHas(finalEnv, "PORT")) {
    advise?.(injectedPortHostAdvisory(NODE_RAILPACK_PORT));
  }
  if (!envHas(envVars, "RAILPACK_PHP_EXTENSIONS") && envHas(finalEnv, "RAILPACK_PHP_EXTENSIONS")) {
    advise?.(phpExtensionDefaultsAdvisory(DEFAULT_PHP_EXTENSIONS));
  }
  if (!envHas(envVars, "RAILPACK_SKIP_MIGRATIONS") && envHas(finalEnv, "RAILPACK_SKIP_MIGRATIONS")) {
    advise?.(migrationsSkippedAdvisory());
  }
  if (finalEnv.length > 0) {
    await log(`[stage:configure-app] Setting ${finalEnv.length} environment variables...`);
    const envString = finalEnv.map((v) => `${v.name}=${v.value}`).join("\n");
    await client.saveEnvironment({
      applicationId,
      env: envString,
      // Dokploy requires buildArgs/buildSecrets as non-optional; empty = none.
      buildArgs: "",
      buildSecrets: "",
      createEnvFile: true,
    });
  }

  // Builder-independent start-command override. Railpack's RAILPACK_START_CMD is
  // documented as a CLI `--env` build variable, so app env may not reach it;
  // Dokploy's own application `command` overrides the container's entrypoint
  // regardless of builder. Best-effort — a failure here still leaves the env var
  // in place and never fails the deploy.
  if (buildType === "railpack" && repoAnalysis.startCommand) {
    try {
      await client.updateApplication({ applicationId, command: repoAnalysis.startCommand });
      await log("[stage:configure-app] Applied start command to the application (run command).");
    } catch (err) {
      await log(`[stage:configure-app] Could not set the application run command (continuing): ${getErrMsg(err)}`);
    }
  }

  const containerPort = resolveContainerPort(buildType, repoAnalysis.primaryLanguage, repoAnalysis.techStack ?? []);
  await log(`[stage:configure-app] ✓ Application configured (build: ${buildType}, port: ${containerPort})`);
  return { dokployApplicationId: applicationId, buildType, containerPort };
}

/**
 * Build the connection env vars for provisioned self-hosted databases.
 *
 * These are DEFAULTS — merged UNDER the user's project env, so any DB_* the
 * user set explicitly (e.g. pointing at a managed DB) always wins. Uses the
 * Laravel/standard names (DB_*, REDIS_*), plus DB_CONNECTION for the SQL engine.
 */
function dbConnectionEnv(dbs: ProvisionedDatabase[]): Array<{ name: string; value: string }> {
  const env: Array<{ name: string; value: string }> = [];
  for (const db of dbs) {
    if (db.engine === "redis") {
      env.push({ name: "REDIS_HOST", value: db.host });
      env.push({ name: "REDIS_PORT", value: String(db.port) });
      if (db.password) env.push({ name: "REDIS_PASSWORD", value: db.password });
      continue;
    }
    // SQL (mysql/postgres)
    env.push({ name: "DB_CONNECTION", value: db.engine === "postgres" ? "pgsql" : "mysql" });
    env.push({ name: "DB_HOST", value: db.host });
    env.push({ name: "DB_PORT", value: String(db.port) });
    if (db.database) env.push({ name: "DB_DATABASE", value: db.database });
    if (db.user) env.push({ name: "DB_USERNAME", value: db.user });
    if (db.password) env.push({ name: "DB_PASSWORD", value: db.password });
  }
  return env;
}

/**
 * Merge two env lists; values in `override` win over `base`. Order is
 * preserved with base first, then any override keys not already present, and
 * overridden values updated in place.
 */
function mergeEnv(
  base: Array<{ name: string; value: string }>,
  override: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  const map = new Map<string, string>();
  for (const { name, value } of base) map.set(name, value);
  for (const { name, value } of override) map.set(name, value);
  return Array.from(map, ([name, value]) => ({ name, value }));
}

/**
 * Augment the project's env with Railpack PHP defaults, without overriding
 * anything the user set explicitly:
 *
 *  - RAILPACK_PHP_EXTENSIONS: a common Laravel extension set, so builds don't
 *    fail on "ext-* is missing" for extensions the repo didn't declare.
 *  - RAILPACK_SKIP_MIGRATIONS: this is what runs (or skips) the user's Laravel
 *    post-deploy commands. Railpack's `start-container.sh` runs, at container
 *    STARTUP (runtime, after env is injected):
 *        php artisan migrate --force   (unless RAILPACK_SKIP_MIGRATIONS=true)
 *        php artisan storage:link
 *        php artisan optimize:clear && php artisan optimize
 *    `optimize` rebuilds the config/route/view/event caches — i.e. it covers
 *    `config:cache`, `route:cache`, and `view:cache`. So letting migrations run
 *    delivers the standard Laravel post-deploy sequence with no start-command
 *    override. Because startup already runs this sequence, the after-deploy
 *    post-deploy stage (run-post-deploy.ts) deliberately skips these
 *    startup-covered commands for Railpack PHP apps — re-running `config:cache`
 *    over `docker exec` (which may lack the runtime env) would bake a broken
 *    config and cause a Bad Gateway.
 *
 *    We only force SKIP_MIGRATIONS=true when NO database is reachable at
 *    startup (no provisioned vps DB and no DB_* in the app env). Without a DB,
 *    `migrate` would fail and crash-loop the container on first boot. When a DB
 *    IS available, we leave the flag unset so migrations run at startup against
 *    the injected, reachable connection — which is exactly when they should.
 *
 * Only applies to PHP railpack builds; returns the input unchanged otherwise.
 */
function withRailpackPhpDefaults(
  envVars: Array<{ name: string; value: string }>,
  buildType: DokployBuildType,
  primaryLanguage?: string,
  hasDatabase = false,
  techStack: string[] = [],
): Array<{ name: string; value: string }> {
  if (buildType !== "railpack" || !isPhpApp(primaryLanguage, techStack)) return envVars;

  const has = (name: string) => envVars.some((v) => v.name === name);
  const additions: Array<{ name: string; value: string }> = [];

  if (!has("RAILPACK_PHP_EXTENSIONS")) {
    additions.push({ name: "RAILPACK_PHP_EXTENSIONS", value: DEFAULT_PHP_EXTENSIONS.join(",") });
  }
  // Only skip migrations when there's no DB to migrate against. With a DB
  // present, leave the flag unset so Railpack runs migrate + optimize at
  // startup (the user's post-deploy commands). Never override a user-set value.
  if (!has("RAILPACK_SKIP_MIGRATIONS") && !hasDatabase) {
    additions.push({ name: "RAILPACK_SKIP_MIGRATIONS", value: "true" });
  }

  return additions.length > 0 ? [...envVars, ...additions] : envVars;
}

/**
 * Detect a PHP/Laravel app from EITHER the detected primary language OR the
 * tech stack. Relying on `primaryLanguage` alone is fragile — a Laravel repo
 * can be classified as "Blade", left blank, or mixed, and then the PHP
 * extension defaults silently don't apply, causing composer to fail the build
 * on missing ext-gd/intl/zip/sockets. Checking the tech stack ("php",
 * "laravel", "filament", ...) as well makes detection robust.
 */
function isPhpApp(primaryLanguage: string | undefined, techStack: string[]): boolean {
  const lang = (primaryLanguage ?? "").toLowerCase();
  if (lang.includes("php") || lang.includes("laravel") || lang.includes("blade")) return true;
  return techStack.some((s) => {
    const t = s.toLowerCase();
    return t.includes("php") || t.includes("laravel") || t.includes("filament") || t.includes("blade");
  });
}

/** True if the env carries a SQL database connection (DB_HOST or DB_CONNECTION). */
function hasDbEnv(envVars: Array<{ name: string; value: string }>): boolean {
  return envVars.some(
    (v) => (v.name === "DB_HOST" || v.name === "DB_CONNECTION") && v.value.trim() !== "" && v.value.trim().toLowerCase() !== "sqlite",
  );
}

/**
 * Check whether a Dokploy application still exists, by id. Returns false if
 * `application.one` reports it missing (or any lookup error), so a
 * deleted/unreachable app is treated as "recreate" rather than fatal.
 */
async function applicationExists(applicationId: string, client: DokployClient): Promise<boolean> {
  try {
    const app = await client.getApplication(applicationId);
    return Boolean(app?.applicationId);
  } catch {
    // application.one throws (typically 404) when the app was deleted.
    return false;
  }
}

// ─── Build Type Detection ────────────────────────────────────────

function determineBuildType(analysis: RepoAnalysisInfo): DokployBuildType {
  // Priority 1: Existing Dockerfile
  if (analysis.hasDockerfile) return "dockerfile";

  // Priority 2: Pre-built static site.
  //
  // Dokploy's "static" build type does NOT build the app — it wraps a tiny
  // nginx image that COPYs an ALREADY-BUILT publish directory (e.g. `dist`)
  // from the repo. It only works when that built output is committed to the
  // repository. It is NOT the right choice for a source-only static generator
  // (Astro, Vite, Angular, ...): those produce `dist/` at build time, so a
  // "static" build fails with `COPY dist .: "/dist": not found`.
  //
  // Source-only static generators must build with Railpack (Priority 3), which
  // runs the install+build and serves the output over Caddy on port 80. So we
  // only pick "static" when an explicit upstream signal says the built output
  // is present in the repo — never inferred from the tech stack alone.
  if (analysis.isStaticSite) return "static";

  // Priority 3: Everything else → Railpack.
  //
  // Railpack is the newer successor to Nixpacks and is our standard builder for
  // source-based deploys. It tracks current runtime versions (so it avoids
  // Nixpacks failures like "undefined variable 'nodejs_24'"), detects start
  // commands more reliably (Nixpacks fails with "No start command could be
  // found" on apps it can't infer), and supports Node, PHP, Python, Go, and
  // more. We default to it rather than gating on a language allow-list, since
  // that allow-list let unrecognized-language repos silently fall through to
  // Nixpacks and fail.
  return "railpack";
}

// ─── Port / runtime detection ────────────────────────────────────

/**
 * Detect a Node.js app from the primary language or tech stack.
 *
 * Node railpack apps (Express, Nuxt, SvelteKit, Remix, SSR Astro via
 * @astrojs/node, ...) run a Node server that binds the PORT env var, unlike
 * railpack's PHP/static images which serve on 80. Detecting Node lets us inject
 * PORT/HOST and route Traefik to the matching port.
 */
function isNodeApp(primaryLanguage: string | undefined, techStack: string[]): boolean {
  const lang = (primaryLanguage ?? "").toLowerCase();
  if (lang.includes("javascript") || lang.includes("typescript") || lang.includes("node")) return true;
  return techStack.some((s) => {
    const t = s.toLowerCase();
    return (
      t.includes("node") ||
      t.includes("javascript") ||
      t.includes("typescript") ||
      t.includes("astro") ||
      t.includes("next") ||
      t.includes("nuxt") ||
      t.includes("remix") ||
      t.includes("svelte") ||
      t.includes("express") ||
      t.includes("fastify") ||
      t.includes("nest") ||
      t.includes("vite")
    );
  });
}

/**
 * Resolve the container port Traefik must route the app's domain to.
 *
 *  - railpack + Node → NODE_RAILPACK_PORT: a Node server honors the PORT env we
 *    inject (see nodeRuntimeEnv), so we route to that same port.
 *  - railpack + non-Node (PHP/static via Caddy) → 80.
 *  - any other builder (dockerfile/nixpacks) → Dokploy's conventional 3000.
 *
 * A wrong port is the classic Bad Gateway: Traefik routes fine but the
 * container isn't listening where it forwards.
 */
export function resolveContainerPort(
  buildType: DokployBuildType,
  primaryLanguage: string | undefined,
  techStack: string[],
): number {
  if (buildType === "railpack") {
    return isNodeApp(primaryLanguage, techStack) ? NODE_RAILPACK_PORT : 80;
  }
  return 3000;
}

/**
 * Env defaults that make a Node railpack server reachable by Traefik:
 *
 *  - PORT: the port we route the domain to. Node servers (incl. Astro's Node
 *    adapter, which otherwise defaults to 4321) bind PORT when set.
 *  - HOST=0.0.0.0: many Node servers (again incl. Astro's Node adapter) default
 *    to localhost, which only accepts connections from inside the container —
 *    Traefik, in its own container, can't reach it. Binding all interfaces
 *    fixes the "connection refused"/Bad Gateway.
 *
 * Applied only to Node railpack apps, and never overrides a user-set value.
 */
function nodeRuntimeEnv(
  envVars: Array<{ name: string; value: string }>,
  buildType: DokployBuildType,
  primaryLanguage: string | undefined,
  techStack: string[],
): Array<{ name: string; value: string }> {
  if (buildType !== "railpack" || !isNodeApp(primaryLanguage, techStack)) return envVars;

  const has = (name: string) => envVars.some((v) => v.name === name);
  const additions: Array<{ name: string; value: string }> = [];
  if (!has("PORT")) additions.push({ name: "PORT", value: String(NODE_RAILPACK_PORT) });
  if (!has("HOST")) additions.push({ name: "HOST", value: "0.0.0.0" });

  return additions.length > 0 ? [...envVars, ...additions] : envVars;
}

/** True if an env list already contains a variable by name. */
function envHas(envVars: Array<{ name: string; value: string }>, name: string): boolean {
  return envVars.some((v) => v.name === name);
}

/**
 * Inject RAILPACK_START_CMD when a start command was derived at analysis time.
 *
 * Railpack reads this as the container start command, which fixes apps whose
 * repo declares no `start` script (Railpack otherwise derives no start command,
 * the image gets no CMD, and the container runs nothing → Bad Gateway).
 *
 * NOTE: Railpack documents build-configuration variables as passed via the CLI's
 * `--env`, not read from the ambient process environment. Whether the host
 * forwards app env into the Railpack invocation is host-specific, so we ALSO set
 * Dokploy's native application `command` (see applyStartCommandOverride) as a
 * builder-independent belt-and-braces override.
 *
 * Applies only to railpack builds; never overrides a user-set value. Other build
 * types ignore it (a Dockerfile has its own CMD; static has no server).
 */
function withRailpackStartCommand(
  envVars: Array<{ name: string; value: string }>,
  buildType: DokployBuildType,
  startCommand: string | undefined,
): Array<{ name: string; value: string }> {
  if (buildType !== "railpack" || !startCommand) return envVars;
  if (envHas(envVars, "RAILPACK_START_CMD")) return envVars;
  return [...envVars, { name: "RAILPACK_START_CMD", value: startCommand }];
}

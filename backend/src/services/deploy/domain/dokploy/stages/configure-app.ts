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

export interface ConfigureAppResult {
  dokployApplicationId: string;
  buildType: DokployBuildType;
}

export interface RepoAnalysisInfo {
  hasDockerfile: boolean;
  isStaticSite: boolean;
  publishDirectory?: string;
  primaryLanguage?: string;
  techStack?: string[];
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
}): Promise<ConfigureAppResult> {
  const { projectId, projectName, environmentId, serverId, gitConfig, repoAnalysis, services = [], provisionedDatabases = [], envVars, client, log } = params;

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
  const finalEnv = withRailpackPhpDefaults(withDbEnv, buildType, repoAnalysis.primaryLanguage, hasDatabase, repoAnalysis.techStack ?? []);
  if (provisionedDatabases.length > 0) {
    await log(`[stage:configure-app] Wired ${provisionedDatabases.length} self-hosted service(s) into the app env.`);
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

  await log(`[stage:configure-app] ✓ Application configured (build: ${buildType})`);
  return { dokployApplicationId: applicationId, buildType };
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
 *    override.
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

  // Priority 2: Static site
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

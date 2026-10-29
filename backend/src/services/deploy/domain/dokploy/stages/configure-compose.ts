/**
 * Stage: Configure Compose
 *
 * Creates or updates the Dokploy Compose stack for a project, points it at the
 * repo's compose file, sets its environment, and resolves which service a
 * domain should route to.
 *
 * The sibling of configure-app, and deliberately much smaller. A compose stack
 * has NO build type, no run command, no PORT/HOST injection and no Railpack
 * configuration: each service in the file builds from its own `build:` or runs
 * its own `image:`. Carrying any of configure-app's builder logic over here
 * would be wrong.
 *
 * Depends on: ensure-project, sync-git, provision-server.
 */

import type { DokployClient } from "../client.js";
import { getCompose, upsertCompose, deleteComposeMapping } from "../mappings.js";
import type { GitProviderConfig } from "./sync-git.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";
import { DOKPLOY_STAGE, stageMarker } from "../../../../../lib/logging.js";

const MARKER = stageMarker(DOKPLOY_STAGE.CONFIGURE_COMPOSE);
const SERVICES_MARKER = stageMarker(DOKPLOY_STAGE.COMPOSE_SERVICES);

/**
 * `compose.loadServices` CLONES the repo before parsing, so it needs far longer
 * than the client's 30s default. Measured at ~5s for a 35MB repo; this leaves
 * room for a large repo on a slow link without hanging the pipeline.
 */
const LOAD_SERVICES_TIMEOUT_MS = 180_000;

export interface ComposeDeployConfig {
  /** Compose file path inside the repo, e.g. "./deploy/dokploy/docker-compose.yml". */
  path: string;
  /** The service a domain routes to. */
  entryService?: string;
  /** Container port that service listens on. */
  entryPort?: number;
}

export interface ConfigureComposeResult {
  dokployComposeId: string;
  /** Dokploy's appName; compose containers are named `<appName>-<service>-N`. */
  appName?: string;
  /** Service names as Dokploy parsed them. */
  serviceNames: string[];
  entryService?: string;
  entryPort?: number;
}

/**
 * Raised when the deploy cannot proceed and the reason is the user's to fix.
 * Thrown rather than logged so the pipeline fails fast with a clear message
 * instead of handing Dokploy a stack that cannot start.
 */
export class ComposeConfigError extends Error {}

export async function stageConfigureCompose(params: {
  projectId: string;
  projectName: string;
  environmentId: string;
  serverId: string;
  gitConfig: GitProviderConfig;
  compose: ComposeDeployConfig;
  envVars: Array<{ name: string; value: string }>;
  /**
   * Variables the compose file marks `${VAR:?…}`. `docker compose` aborts when
   * any is unset, so the deploy is blocked up front rather than failing in a
   * build log the user cannot read.
   */
  requiredVars?: string[];
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ConfigureComposeResult> {
  const {
    projectId, projectName, environmentId, serverId,
    gitConfig, compose, envVars, requiredVars = [], client, log,
  } = params;

  // ─── Required variables ──────────────────────────────────────────
  // Before creating anything: a missing `${VAR:?}` makes `docker compose`
  // refuse to start the stack, and its own error reaches only the build log.
  const provided = new Set(envVars.filter((v) => v.value !== "").map((v) => v.name));
  const missing = requiredVars.filter((name) => !provided.has(name));
  if (missing.length > 0) {
    throw new ComposeConfigError(
      `This compose file requires ${missing.length} environment variable(s) that are not set: ` +
      `${missing.join(", ")}. Add them to the project's environment variables and deploy again.`,
    );
  }

  // ─── Create or reuse the compose resource ────────────────────────
  // Same verify-then-reconcile shape as configure-app: a stack deleted in the
  // Dokploy UI leaves a dangling mapping row, and reusing its id makes every
  // later call fail with "Compose not found".
  await log(`${MARKER} Checking for an existing compose stack...`);

  let composeId: string;
  let appName: string | undefined;
  const existing = await getCompose(projectId);

  if (existing && (await client.composeExists(existing.dokployComposeId))) {
    composeId = existing.dokployComposeId;
    appName = existing.appName ?? undefined;
    if (!appName) {
      // Older row, or one written before appName was persisted. Best-effort:
      // a miss just leaves it unset.
      try {
        appName = (await client.getCompose(composeId)).appName || undefined;
      } catch {
        // ignore
      }
    }
    await log(`${MARKER} Reusing existing compose stack: ${composeId}`);
  } else {
    if (existing) {
      await log(
        `${MARKER} Mapped compose stack ${existing.dokployComposeId} no longer exists — clearing stale mapping and recreating.`,
      );
      await deleteComposeMapping(projectId);
    }

    await log(`${MARKER} Creating compose stack "${projectName}"...`);
    const created = await client.createCompose({
      name: projectName,
      description: "",
      environmentId,
      // Required in practice, not just by the schema: compose.create rejects
      // with UNAUTHORIZED when the instance has no default local server.
      serverId,
      composeType: "docker-compose",
      // Dockier always clones with its own credentials (see below), so the
      // source is plain git rather than a Dokploy-registered provider.
      sourceType: "git",
    });
    composeId = created.composeId;
    appName = created.appName || undefined;

    await upsertCompose({
      projectId,
      dokployComposeId: composeId,
      dokployServerId: serverId,
      appName,
      composePath: compose.path,
    });
    await log(`${MARKER} Compose stack created: ${composeId}`);
  }

  // ─── Git source + compose path ───────────────────────────────────
  // `compose.update` is the ONLY way to set these: compose.create silently
  // ignores composePath and keeps its ./docker-compose.yml default, which is
  // wrong for any repo that keeps the file elsewhere.
  //
  // The clone URL comes straight from stageSyncGit with no transformation. That
  // stage already funnels every provider into a token-authenticated custom-git
  // URL, because Dokploy's native provider families are keyed on a GitHub App /
  // GitLab OAuth app registered inside Dokploy that Dockier does not have — and
  // `sourceType: "git"` wants exactly that URL.
  const { customGitUrl, customGitBranch } = gitSource(gitConfig);
  await log(`${MARKER} Pointing the stack at ${compose.path} (branch ${customGitBranch})...`);
  await client.updateCompose({
    composeId,
    sourceType: "git",
    customGitUrl,
    customGitBranch,
    composePath: compose.path,
    // Writes a `.env` beside the compose file from the env below, so
    // `${VAR}` interpolation resolves. Dokploy does not read the repo's own
    // `env_file`, so this is the only way the stack sees its variables.
    createEnvFile: true,
    enableSubmodules: false,
    watchPaths: [],
  });

  // ─── Environment ─────────────────────────────────────────────────
  // The project's variables are the ONLY env source for a compose deploy.
  // Sent even when empty so a previously-set env is cleared rather than
  // silently retained from an earlier deploy — Dockier owns this field, the
  // same way it owns the application's env.
  const envString = envVars.map((v) => `${v.name}=${v.value}`).join("\n");
  await log(`${MARKER} Setting ${envVars.length} environment variable(s)...`);
  await client.saveComposeEnvironment({ composeId, env: envString, createEnvFile: true });

  // ─── Services ────────────────────────────────────────────────────
  // Dokploy's own parse is authoritative here: it reads the file after cloning
  // and applying its interpolation, so it is what the deploy will actually run.
  // Dockier's analyzer parse drives the wizard (it must work before any compose
  // resource exists); a disagreement means the wizard showed something stale.
  await log(`${SERVICES_MARKER} Reading the services declared in ${compose.path}...`);
  let serviceNames: string[] = [];
  try {
    serviceNames = await client.loadComposeServices(composeId, "fetch", {
      timeout: LOAD_SERVICES_TIMEOUT_MS,
    });
    await log(`${SERVICES_MARKER} Services: ${serviceNames.join(", ") || "(none)"}`);
  } catch (err) {
    // A compose file with no `services:` key 404s here. That is a real,
    // user-visible problem, not a transient one, so stop — deploying would
    // produce a stack with nothing in it.
    throw new ComposeConfigError(
      `Could not read the services from ${compose.path}: ${getErrMsg(err)}. ` +
      `Check that the file exists on this branch and declares a "services:" section.`,
    );
  }

  // ─── Entry service + port ────────────────────────────────────────
  const entryService = resolveEntryService(compose.entryService, serviceNames, log);
  const entryPort = compose.entryPort;

  if (entryService && !entryPort) {
    // Never guess. Dokploy writes this port straight into the Traefik
    // `loadbalancer.server.port` label, so a wrong value is a Bad Gateway with
    // no other symptom. Better to deploy with no domain and say so.
    await log(
      `${SERVICES_MARKER} No container port is known for "${entryService}", so no domain will be attached. ` +
      `Set the port in the project's deploy settings, or declare it in the compose file.`,
    );
  }

  await upsertCompose({
    projectId,
    dokployComposeId: composeId,
    dokployServerId: serverId,
    appName,
    composePath: compose.path,
    serviceNames,
    ...(entryService ? { entryService } : {}),
    ...(entryPort !== undefined ? { entryPort } : {}),
  });

  await log(
    `${MARKER} ✓ Compose stack configured (${serviceNames.length} service(s)` +
    `${entryService ? `, routing "${entryService}"${entryPort ? ` on port ${entryPort}` : ""}` : ", no public service"})`,
  );

  return { dokployComposeId: composeId, appName, serviceNames, entryService, entryPort };
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Validate the configured entry service against what Dokploy actually parsed.
 *
 * A stored choice that no longer exists (the service was renamed or removed in
 * the repo) is dropped rather than passed through: `domain.create` would accept
 * the unknown name and Traefik would route to nothing.
 */
function resolveEntryService(
  configured: string | undefined,
  serviceNames: string[],
  log: (line: string) => Promise<void>,
): string | undefined {
  if (!configured) return undefined;
  if (serviceNames.length === 0) return configured;
  if (serviceNames.includes(configured)) return configured;

  void log(
    `${SERVICES_MARKER} The configured public service "${configured}" is not in this compose file ` +
    `(it declares: ${serviceNames.join(", ")}). No domain will be attached until it is corrected.`,
  );
  return undefined;
}

/**
 * The clone URL and branch for `compose.update`, from the git config
 * stageSyncGit already prepared.
 *
 * stageSyncGit returns "custom" for every provider, so that is the only branch
 * that occurs in practice. The others are handled rather than cast away, so a
 * future change there fails loudly here instead of sending an empty URL that
 * Dokploy would accept and then fail to clone.
 */
function gitSource(config: GitProviderConfig): { customGitUrl: string; customGitBranch: string } {
  if (config.type === "custom") {
    return {
      customGitUrl: config.params.customGitUrl,
      customGitBranch: config.params.customGitBranch,
    };
  }
  throw new ComposeConfigError(
    `Docker Compose deploys need a plain git clone URL, but the git connection resolved to "${config.type}". ` +
    `This is a Dockier configuration problem — contact your administrator.`,
  );
}

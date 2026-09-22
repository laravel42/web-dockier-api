/**
 * Stage: Trigger Deploy & Poll Status
 *
 * Triggers a Dokploy deployment, polls until completion, and extracts
 * the application URL. Supports retry with Dokploy AI recovery.
 */

import type { DokployClient } from "../client.js";
import { invokeDokployAI } from "./ai-recovery.js";
import { sleep } from "../../../../../shared/utils/time.js";

export interface DeployResult {
  status: "done" | "error";
  appUrl: string;
  /** User-facing reason when status is "error" (best-effort). */
  failureReason?: string;
}

/**
 * Trigger deployment and poll until success or failure.
 */
export async function stageTriggerDeploy(params: {
  applicationId: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
  /** Build type of the app — determines the container port for the domain. */
  buildType?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<DeployResult> {
  const { applicationId, client, log, buildType = "", pollIntervalMs = 5000, timeoutMs = 1_200_000 } = params;

  // Capture the set of existing deployment ids BEFORE triggering, so we can
  // identify the NEW deployment this trigger creates and follow only its
  // status. Polling the application's overall `applicationStatus` is unreliable
  // here: it can still hold a stale "error" from a previous attempt while the
  // new build is running, which made us report a false failure mid-build.
  const priorIds = new Set((await client.listDeployments(applicationId)).map((d) => d.deploymentId));

  await log("[stage:deploy] Triggering deployment...");
  await client.deploy({ applicationId, title: "Dockier deploy" });

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);

    // Find the deployment created by this trigger (newest id not seen before),
    // falling back to the most recent record if we can't distinguish one yet.
    const deployments = await client.listDeployments(applicationId);
    const current = deployments.find((d) => !priorIds.has(d.deploymentId)) ?? deployments[0];
    const status = current?.status;

    if (status === "done") {
      const app = await client.getApplication(applicationId);
      const appUrl = await resolveAppUrl(applicationId, app, client, log, containerPortForBuildType(buildType));
      await log(`[stage:deploy] ✓ Deployment successful! URL: ${appUrl || "(pending domain)"}`);
      return { status: "done", appUrl };
    }

    if (status === "error") {
      await log("[stage:deploy] ✗ Deployment failed");
      const failureReason = await reportBuildFailure(applicationId, client, log);
      return { status: "error", appUrl: "", failureReason };
    }

    // status is "running" (or the record hasn't appeared yet) — keep polling.
  }

  // Timeout
  throw new Error(
    `Deployment timed out after ${Math.round(timeoutMs / 1000)}s while the build was still running.`,
  );
}

/**
 * Deploy with retry loop. On failure, invokes Dokploy AI for recovery.
 */
export async function stageDeployWithRetry(params: {
  applicationId: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
  buildType?: string;
  maxAttempts?: number;
  pollIntervalMs?: number;
}): Promise<DeployResult> {
  const { applicationId, client, log, buildType, maxAttempts = 3, pollIntervalMs } = params;

  let lastFailureReason: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await log(`[stage:deploy] Attempt ${attempt}/${maxAttempts}...`);

    const result = await stageTriggerDeploy({
      applicationId,
      client,
      log,
      buildType,
      pollIntervalMs,
    });

    if (result.status === "done") {
      return result;
    }

    lastFailureReason = result.failureReason;

    // Failed — try automated recovery diagnosis if we have retries left.
    if (attempt < maxAttempts) {
      await log("[stage:deploy] Running automated error diagnosis...");
      const aiResult = await invokeDokployAI({ applicationId, client, log });

      if (aiResult.fixed) {
        await log(`[stage:deploy] Applied automatic fix: ${aiResult.description}`);
      } else {
        await log("[stage:deploy] No automatic fix available. Retrying...");
      }
    }
  }

  const suffix = lastFailureReason ? ` ${lastFailureReason}` : "";
  throw new Error(
    `Deployment failed after ${maxAttempts} attempts. The application build did not succeed.${suffix}`,
  );
}

// ─── Failure Reporting ───────────────────────────────────────────

/**
 * On a failed deploy, surface a user-facing reason in the deploy log.
 *
 * Dokploy streams the full build log over a websocket (not fetchable over
 * REST), so we can't echo the raw build output here. Instead we read the
 * latest deployment record and present what we do have — the failing commit
 * and timing — plus clear guidance that a failure at this stage almost always
 * originates in the application's own source (build/install scripts, missing
 * dependencies, code that needs a database at build time, etc.), not in the
 * Dockier platform. Users don't have Dokploy access, so this message is their
 * only window into why the build failed.
 *
 * Returns a short reason string (also appended to the thrown error), or a
 * generic message if the deployment record can't be read. Never throws.
 */
async function reportBuildFailure(
  applicationId: string,
  client: DokployClient,
  log: (line: string) => Promise<void>,
): Promise<string> {
  let commit = "";
  try {
    const deployments = await client.listDeployments(applicationId);
    const latest = deployments.find((d) => d.status === "error") ?? deployments[0];
    if (latest?.title) {
      // Dokploy stores the commit subject as the deployment title.
      commit = latest.title.split("\n")[0].trim();
    }
    if (latest?.errorMessage) {
      await log(`[stage:deploy] Build error: ${latest.errorMessage}`);
    }
  } catch {
    // Best-effort — fall through to the generic guidance below.
  }

  await log("[stage:deploy] The server build failed while building your application.");
  if (commit) {
    await log(`[stage:deploy] Failing commit: ${commit}`);
  }
  await log(
    "[stage:deploy] This stage compiles and installs YOUR application, so the cause is " +
    "almost always in the repository — a failing build/install step, a missing dependency, " +
    "or code that requires a database or external service at build time. Review the app's " +
    "build and start commands and its most recent commit. If you need the full server build " +
    "log, contact your Dockier administrator.",
  );

  return commit
    ? `The build failed on commit "${commit}". The cause is most likely in the repository (build/install step, missing dependency, or code requiring a service at build time). Contact your Dockier administrator for the full server build log.`
    : `The application build failed. The cause is most likely in the repository (build/install step, missing dependency, or code requiring a service at build time). Contact your Dockier administrator for the full server build log.`;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Resolve the real, reachable URL for a deployed app.
 *
 * A Dokploy app has no public URL until a domain is registered (Traefik routes
 * by domain). So on success we:
 *   1. reuse an already-registered domain if one exists, else
 *   2. generate a free sslip.io host (embeds the server IP, no DNS setup) and
 *      register it via domain.create.
 * Returns the http(s) URL, or "" if a domain couldn't be established (deploy
 * still succeeded — the URL is just not available yet). Never throws.
 */
async function resolveAppUrl(
  applicationId: string,
  app: { appName?: string; serverId?: string | null },
  client: DokployClient,
  log: (line: string) => Promise<void>,
  containerPort: number,
): Promise<string> {
  try {
    // 1. Reuse an existing domain if the app already has one.
    const existing = await client.listDomains(applicationId);
    const already = existing[0];
    if (already?.host) {
      return toUrl(already.host, already.https);
    }

    // 2. Generate + register a free sslip.io domain.
    if (!app.appName || !app.serverId) return "";
    const host = await client.generateDomain(app.appName, app.serverId);
    if (!host) return "";

    const created = await client.createDomain({
      host,
      applicationId,
      // The port Traefik forwards to must match the port the app container
      // listens on, or requests get "Bad Gateway". This depends on the
      // builder/framework (see containerPortForBuildType).
      port: containerPort,
      https: false, // sslip.io free domains are HTTP-only
      domainType: "application",
      certificateType: "none",
    });
    await log(`[stage:deploy] Assigned domain: ${created.host}`);
    return toUrl(created.host, created.https);
  } catch {
    // Domain setup is best-effort — the deploy already succeeded.
    return "";
  }
}

/**
 * The container port Traefik should route to, by build type.
 *
 * - railpack: serves PHP via FrankenPHP/Caddy on port 80; static sites via
 *   Caddy on 80; Node apps typically honor PORT=3000. Railpack's PHP/static
 *   images listen on 80, which is the common case, so default railpack to 80.
 * - dockerfile/nixpacks/other: Dokploy's conventional app port is 3000.
 *
 * A wrong port is the classic "Bad Gateway" cause: Traefik routes fine but the
 * container isn't listening where it forwards.
 */
function containerPortForBuildType(buildType: string): number {
  return buildType === "railpack" ? 80 : 3000;
}

/** Build an http(s) URL from a Dokploy domain host. */
function toUrl(host: string, https: boolean): string {
  // The container port is internal to Traefik; the public URL is on the
  // standard 80/443 for the scheme, so it's just scheme://host.
  return `${https ? "https" : "http"}://${host}`;
}



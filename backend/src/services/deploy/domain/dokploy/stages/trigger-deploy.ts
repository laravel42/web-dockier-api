/**
 * Stage: Trigger Deploy & Poll Status
 *
 * Triggers a Dokploy deployment, polls until completion, and extracts
 * the application URL. Supports retry with Dokploy AI recovery.
 */

import type { DokployClient } from "../client.js";
import { classifyBuildFailure } from "./build-failure.js";
import { sleep } from "../../../../../shared/utils/time.js";
import { type Advisory, domainPortCorrectedAdvisory } from "../advisories.js";

export interface DeployResult {
  /**
   * "cancelled" is a user action observed mid-build, never a build failure:
   * callers must unwind without AI recovery, a retry, or a "failed" status.
   */
  status: "done" | "error" | "cancelled";
  appUrl: string;
  /** User-facing reason when status is "error" (best-effort). */
  failureReason?: string;
}

/**
 * Lightweight, framework-aware context for failure messaging. Lets a build
 * failure surface actionable guidance instead of the generic "check the repo".
 * Everything is best-effort — a missing hint just yields the generic message.
 */
export interface RuntimeHint {
  /** Dokploy build type in use (railpack/static/dockerfile/...). */
  buildType?: string;
  /** Detected framework (e.g. "astro"), when known. */
  framework?: string;
  /** True if we handed Railpack an explicit start command for this deploy. */
  startCommandApplied?: boolean;
  /** True if the repo declares its own `start` script. */
  repoHasStartScript?: boolean;
  /** Whether the app is a server (needs a running process) vs static. */
  kind?: "server" | "static";
  /**
   * True when the build targets a platform runtime (Astro Vercel/Netlify/
   * Cloudflare adapter) — it produces no startable Node server, so the guidance
   * is "switch to @astrojs/node", not "add a start script".
   */
  platformAdapter?: boolean;
}

/**
 * Trigger deployment and poll until success or failure.
 */
export async function stageTriggerDeploy(params: {
  applicationId: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
  /**
   * The container port Traefik should route the app's domain to. Resolved
   * upstream from build type + language (see resolveContainerPort in
   * configure-app). Defaults to 3000 (Dokploy's conventional app port) when
   * not provided.
   */
  containerPort?: number;
  /** Framework-aware context for a clearer failure message (best-effort). */
  runtimeHint?: RuntimeHint;
  /** Optional sink for user-facing advisories (see advisories.ts). */
  advise?: (advisory: Advisory) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
  /**
   * Checked once per poll tick so a cancel issued while the build runs stops
   * the watch. Injected rather than read here, to keep this stage free of the
   * deployments/DB module.
   */
  isCancelled?: () => Promise<boolean>;
  /**
   * Reads the tail of the server-side build log for a failed deployment, so the
   * failure can be classified from what the build actually printed. Injected for
   * the same reason as isCancelled — keeps this stage free of the DB module.
   * Best-effort: resolves to "" when the log can't be read.
   */
  fetchBuildLog?: (logPath: string) => Promise<string>;
}): Promise<DeployResult> {
  const { applicationId, client, log, containerPort = 3000, runtimeHint, advise, pollIntervalMs = 5000, timeoutMs = 1_200_000, isCancelled, fetchBuildLog } = params;

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

    // Cancel check first, so a cancelled deploy also skips the Dokploy
    // round-trip below.
    if (isCancelled && (await isCancelled())) {
      await log("[stage:deploy] ⛔ Cancelled by user — stopped watching the build.");
      return { status: "cancelled", appUrl: "" };
    }

    // Find the deployment created by this trigger (newest id not seen before),
    // falling back to the most recent record if we can't distinguish one yet.
    const deployments = await client.listDeployments(applicationId);
    const current = deployments.find((d) => !priorIds.has(d.deploymentId)) ?? deployments[0];
    const status = current?.status;

    if (status === "done") {
      const app = await client.getApplication(applicationId);
      const appUrl = await resolveAppUrl(applicationId, app, client, log, containerPort, advise);
      await log(`[stage:deploy] ✓ Deployment successful! URL: ${appUrl || "(pending domain)"}`);
      return { status: "done", appUrl };
    }

    if (status === "error") {
      await log("[stage:deploy] ✗ Deployment failed");
      const failureReason = await reportBuildFailure(applicationId, client, log, runtimeHint, fetchBuildLog);
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
  /** Container port Traefik routes to (see stageTriggerDeploy). */
  containerPort?: number;
  /** Framework-aware context for a clearer failure message (best-effort). */
  runtimeHint?: RuntimeHint;
  /** Optional sink for user-facing advisories (see advisories.ts). */
  advise?: (advisory: Advisory) => void;
  maxAttempts?: number;
  pollIntervalMs?: number;
  /** See stageTriggerDeploy — passed straight through. */
  isCancelled?: () => Promise<boolean>;
  /** See stageTriggerDeploy — passed straight through. */
  fetchBuildLog?: (logPath: string) => Promise<string>;
}): Promise<DeployResult> {
  const { applicationId, client, log, containerPort, runtimeHint, advise, maxAttempts = 3, pollIntervalMs, isCancelled, fetchBuildLog } = params;

  let lastFailureReason: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await log(`[stage:deploy] Attempt ${attempt}/${maxAttempts}...`);

    const result = await stageTriggerDeploy({
      applicationId,
      client,
      log,
      containerPort,
      runtimeHint,
      advise,
      pollIntervalMs,
      isCancelled,
      fetchBuildLog,
    });

    if (result.status === "done") {
      return result;
    }

    // A user cancel is not a failure: return before AI recovery, the next
    // "Attempt n/n" log line and a second client.deploy().
    if (result.status === "cancelled") {
      return result;
    }

    lastFailureReason = result.failureReason;

    // Retry once more. This is NOT a retry-after-fix: nothing can edit the
    // user's repository between attempts, and the diagnosis above has already
    // been reported. The retry exists because a build can fail transiently —
    // a flaky dependency download, a registry timeout — and re-running costs
    // one build. A deterministic failure simply fails again with the same
    // message.
    //
    // It used to call Dokploy's `application.aiFixDeployment` and claim a fix
    // had been applied. That procedure does not exist on the Dokploy API
    // (verified against the live instance), so the call 404'd on every failed
    // deploy and the claim was never true.
    if (attempt < maxAttempts) {
      await log("[stage:deploy] Retrying in case the failure was transient...");
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
 * Evidence comes from the latest deployment record's `errorMessage` (set only
 * when Dokploy's own orchestration throws, so usually empty) plus — when
 * `fetchBuildLog` is injected — the tail of the host-side build log file that
 * holds what the builder actually printed. Both are best-effort; with neither,
 * we still present the failing commit plus clear guidance that a failure at
 * this stage almost always originates in the application's own source
 * (build/install scripts, missing dependencies, code that needs a database at
 * build time, etc.), not in the Dockier platform. Users don't have Dokploy
 * access, so this message is their only window into why the build failed.
 *
 * Returns a short reason string (also appended to the thrown error), or a
 * generic message if the deployment record can't be read. Never throws.
 */
async function reportBuildFailure(
  applicationId: string,
  client: DokployClient,
  log: (line: string) => Promise<void>,
  runtimeHint?: RuntimeHint,
  fetchBuildLog?: (logPath: string) => Promise<string>,
): Promise<string> {
  let commit = "";
  let evidence = "";
  try {
    const deployments = await client.listDeployments(applicationId);
    const latest = deployments.find((d) => d.status === "error") ?? deployments[0];
    if (latest?.title) {
      // Dokploy stores the commit subject as the deployment title.
      commit = latest.title.split("\n")[0].trim();
    }
    if (latest?.errorMessage) {
      evidence = latest.errorMessage;
      await log(`[stage:deploy] Build error: ${latest.errorMessage}`);
    }
    // The builder's own output lives only in the host log file; without it the
    // classifier below has nothing to go on and falls back to repo heuristics.
    if (latest?.logPath && fetchBuildLog) {
      try {
        const tail = await fetchBuildLog(latest.logPath);
        if (tail) {
          evidence = [evidence, tail].filter(Boolean).join("\n");
          // Logged on success only: its absence tells a reader that the
          // diagnosis below ran WITHOUT the build output.
          await log(
            `[stage:deploy] Retrieved the server build log for diagnosis (${Math.max(1, Math.round(tail.length / 1024))} KB from ${latest.logPath}).`,
          );
        }
      } catch {
        // Best-effort — classify on whatever errorMessage gave us.
      }
    }
  } catch {
    // Best-effort — fall through to the generic guidance below.
  }

  await log("[stage:deploy] The server build failed while building your application.");
  if (commit) {
    await log(`[stage:deploy] Failing commit: ${commit}`);
  }

  // Keep the raw evidence for the AI tier below: `evidence` is reused by the
  // deterministic classifier, which does not need it preserved.
  const logEvidence = evidence;

  // What the build actually reported outranks any heuristic about the repo (see
  // build-failure.ts); the branches below only format the diagnosis.
  const diagnosis = classifyBuildFailure(evidence, runtimeHint);
  const onCommit = commit ? ` (commit "${commit}")` : "";

  if (diagnosis.kind === "oom") {
    const step = diagnosis.step ?? "the build step";
    await log(
      `[stage:deploy] The build ran out of memory while running "${step}". Raise the build's memory ` +
      'ceiling (set NODE_OPTIONS="--max-old-space-size=<MB>" in the project env), select a larger plan ' +
      "with more memory, or make the build less memory-hungry (fewer parallel workers, no source maps).",
    );
    return (
      `The build ran out of memory while running "${step}"${onCommit}. ` +
      "Select a larger plan with more memory, or reduce the build's memory use (fewer parallel workers, no source maps)."
    );
  }

  // Framework-aware guidance for the most common self-inflicted case: a
  // server app (Railpack Node) with no start command. When the repo declares
  // no `start` script AND we couldn't derive one, Railpack builds the app but
  // has nothing to run, so the container serves nothing (Bad Gateway) or the
  // build/deploy is reported failed. Tell the user exactly how to fix it,
  // since they can't see the raw build log.
  // A platform-adapter build has no startable Node server; the fix is to change
  // the adapter, not to add a start script.
  if (diagnosis.kind === "platform-adapter") {
    await log(
      "[stage:deploy] This Astro app is built with a platform adapter (Vercel/Netlify/Cloudflare), which " +
      "produces a serverless handler rather than a Node server. Switch to @astrojs/node with " +
      'mode: "standalone" to deploy it here.',
    );
    return commit
      ? `This Astro app uses a platform adapter (Vercel/Netlify/Cloudflare) and has no Node server to run (commit "${commit}"). Switch to @astrojs/node with mode: "standalone".`
      : 'This Astro app uses a platform adapter (Vercel/Netlify/Cloudflare) and has no Node server to run. Switch to @astrojs/node with mode: "standalone".';
  }

  if (diagnosis.kind === "missing-start") {
    const suggested = runtimeHint?.framework === "astro" ? "node ./dist/server/entry.mjs" : "your server entry (e.g. node ./dist/server/entry.mjs)";
    await log(
      `[stage:deploy] No production start command was detected for this ${runtimeHint?.framework ?? "server"} app. ` +
      `Railpack built it but has no command to run the server. Add a "start" script to package.json, e.g.: ` +
      `"start": "${suggested}". Then redeploy.`,
    );
    return commit
      ? `No start command was detected for this ${runtimeHint?.framework ?? "server"} app (commit "${commit}"). Add a "start" script to package.json (e.g. "${suggested}") and redeploy.`
      : `No start command was detected for this ${runtimeHint?.framework ?? "server"} app. Add a "start" script to package.json (e.g. "${suggested}") and redeploy.`;
  }

  // Last tier before the generic guidance: ask a model to read the build log.
  //
  // Deliberately after every deterministic pattern above — those are free,
  // exact and already cover the failures we understand. This is for the long
  // tail, and it is the only thing standing between a user with no access to
  // the build log and "something went wrong". Never throws; returns null when
  // OPENAI_API_KEY is unset or anything at all goes wrong.
  if (logEvidence.trim()) {
    const { diagnoseBuildFailure } = await import("./ai-diagnosis.js");
    const diagnosis = await diagnoseBuildFailure({ logTail: logEvidence, hint: runtimeHint });
    if (diagnosis) {
      await log(`[stage:deploy] ${diagnosis.summary}`);
      await log(`[stage:deploy] Suggested fix: ${diagnosis.suggestion}`);
      return commit
        ? `${diagnosis.summary} (commit "${commit}") ${diagnosis.suggestion}`
        : `${diagnosis.summary} ${diagnosis.suggestion}`;
    }
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
  advise?: (advisory: Advisory) => void,
): Promise<string> {
  try {
    // 1. Reuse an existing domain if the app already has one.
    //
    // A reused domain keeps the port it was originally registered with. If that
    // no longer matches where the container listens (e.g. the app moved from a
    // Caddy-on-80 build to a Node-on-3000 build), Traefik forwards to a dead
    // port and every request is a Bad Gateway. Reconcile it.
    const existing = await client.listDomains(applicationId);
    const already = existing[0];
    if (already?.host) {
      if (already.port !== containerPort) {
        await log(
          `[stage:deploy] Existing domain ${already.host} points at port ${already.port ?? "(unset)"}; updating to ${containerPort}.`,
        );
        try {
          await client.updateDomain({
            domainId: already.domainId,
            host: already.host,
            port: containerPort,
            https: already.https,
            path: already.path ?? "/",
            domainType: "application",
            certificateType: (already.certificateType as "none" | "letsencrypt") ?? "none",
          });
          advise?.(domainPortCorrectedAdvisory(already.port, containerPort));
        } catch {
          // Best-effort: leave the domain as-is rather than failing the deploy.
          await log("[stage:deploy] Could not update the existing domain's port (continuing).");
        }
      } else {
        await log(`[stage:deploy] Reusing domain ${already.host} (port ${containerPort}).`);
      }
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

/** Build an http(s) URL from a Dokploy domain host. */
function toUrl(host: string, https: boolean): string {
  // The container port is internal to Traefik; the public URL is on the
  // standard 80/443 for the scheme, so it's just scheme://host.
  return `${https ? "https" : "http"}://${host}`;
}



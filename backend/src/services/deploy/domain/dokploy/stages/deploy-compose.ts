/**
 * Stage: Deploy Compose & Poll Status
 *
 * The sibling of trigger-deploy, against `compose.deploy` and
 * `deployment.allByCompose`. Same shape — snapshot the existing deployment ids,
 * trigger, follow only the new record — and for the same reason: the resource's
 * own status field can still hold a stale "error" from a previous attempt while
 * the new run is building, which reads as an immediate failure.
 *
 * Differences from the application path, all consequences of a compose stack
 * being N containers behind ONE Dokploy resource:
 *
 *  - The domain attaches to a NAMED service, so a stack with no resolved entry
 *    service or port gets no domain rather than a guessed one.
 *  - There is no retry-with-AI loop. Dokploy exposes no AI fix procedure for
 *    either resource kind (verified against the live instance), and a compose
 *    build failure is almost always a bad build context or a missing variable —
 *    neither of which a blind retry fixes.
 */

import type { DokployClient } from "../client.js";
import type { DokployDeployment } from "../types.js";
import { sleep } from "../../../../../shared/utils/time.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";
import { DOKPLOY_STAGE, stageMarker } from "../../../../../lib/logging.js";

const MARKER = stageMarker(DOKPLOY_STAGE.DEPLOY);

export interface ComposeDeployResult {
  /** "cancelled" is a user action, never a build failure — callers must unwind. */
  status: "done" | "error" | "cancelled";
  appUrl: string;
  /** User-facing reason when status is "error" (best-effort). */
  failureReason?: string;
}

export async function stageDeployCompose(params: {
  composeId: string;
  /** Dokploy's appName, needed to generate the free sslip.io host. */
  appName?: string;
  serverId: string;
  /** The service a domain routes to. No domain is attached without it. */
  entryService?: string;
  /** That service's container port. No domain is attached without it. */
  entryPort?: number;
  client: DokployClient;
  log: (line: string) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** Checked once per tick so a cancel stops the watch (see trigger-deploy). */
  isCancelled?: () => Promise<boolean>;
  /** Reads the tail of the server-side build log; best-effort, "" on failure. */
  fetchBuildLog?: (logPath: string) => Promise<string>;
}): Promise<ComposeDeployResult> {
  const {
    composeId, appName, serverId, entryService, entryPort,
    client, log, pollIntervalMs = 5000, timeoutMs = 1_200_000, isCancelled, fetchBuildLog,
  } = params;

  const priorIds = new Set(
    (await client.listComposeDeployments(composeId)).map((d) => d.deploymentId),
  );

  await log(`${MARKER} Triggering compose deployment...`);
  await client.deployCompose({ composeId, title: "Dockier deploy" });

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);

    if (isCancelled && (await isCancelled())) {
      await log(`${MARKER} ⛔ Cancelled by user — stopped watching the build.`);
      return { status: "cancelled", appUrl: "" };
    }

    const deployments = await client.listComposeDeployments(composeId);
    const current = deployments.find((d) => !priorIds.has(d.deploymentId)) ?? deployments[0];

    if (current?.status === "done") {
      const appUrl = await resolveComposeUrl({
        composeId, appName, serverId, entryService, entryPort, client, log,
      });
      await log(`${MARKER} ✓ Deployment successful! URL: ${appUrl || "(no public service)"}`);
      return { status: "done", appUrl };
    }

    if (current?.status === "error") {
      await log(`${MARKER} ✗ Deployment failed`);
      return {
        status: "error",
        appUrl: "",
        failureReason: await reportComposeFailure(composeId, current, client, log, fetchBuildLog),
      };
    }

    // "running", or the record has not appeared yet — keep polling.
  }

  throw new Error(
    `Compose deployment timed out after ${Math.round(timeoutMs / 1000)}s while the build was still running.`,
  );
}

// ─── URL resolution ──────────────────────────────────────────────

/**
 * Resolve the stack's public URL by registering a domain on its entry service.
 *
 * Returns "" — and says why — when there is nothing to route to. That is a
 * legitimate outcome: an internal-only stack has no public URL, and a stack
 * whose port could not be determined must not get a domain pointed at a
 * guessed port. Dokploy writes the port we pass straight into the Traefik
 * `loadbalancer.server.port` label, so a wrong one produces a URL that Bad
 * Gateways forever, which is worse than no URL at all.
 *
 * Never throws: the deploy already succeeded.
 */
async function resolveComposeUrl(params: {
  composeId: string;
  appName?: string;
  serverId: string;
  entryService?: string;
  entryPort?: number;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<string> {
  const { composeId, appName, serverId, entryService, entryPort, client, log } = params;

  if (!entryService || !entryPort) {
    await log(
      `${MARKER} No public service is configured for this stack, so no domain was attached. ` +
      `Pick the service and port in the project's deploy settings to publish it.`,
    );
    return "";
  }

  try {
    // 1. Reuse a domain already registered for this service.
    //
    // Reconcile its port the way the application path does: a stack whose
    // service moved to a different port keeps the old domain, and Traefik then
    // forwards to a dead port on every request.
    const existing = await client.listComposeDomains(composeId);
    const already = existing.find((d) => d.serviceName === entryService) ?? existing[0];

    if (already?.host) {
      if (already.port !== entryPort) {
        await log(
          `${MARKER} Existing domain ${already.host} points at port ${already.port ?? "(unset)"}; updating to ${entryPort}.`,
        );
        try {
          await client.updateDomain({
            domainId: already.domainId,
            host: already.host,
            port: entryPort,
            https: already.https,
            path: already.path ?? "/",
            domainType: "compose",
            // Preserved explicitly: dropping it would leave Traefik with a
            // router and no service to send the request to.
            serviceName: already.serviceName ?? entryService,
            certificateType: (already.certificateType as "none" | "letsencrypt") ?? "none",
          });
        } catch {
          await log(`${MARKER} Could not update the existing domain's port (continuing).`);
        }
      } else {
        await log(`${MARKER} Reusing domain ${already.host} → ${entryService}:${entryPort}.`);
      }
      return toUrl(already.host, already.https);
    }

    // 2. Generate and register a free sslip.io domain. generateDomain is
    //    resource-agnostic — it only needs the appName and the server IP.
    if (!appName) return "";
    const host = await client.generateDomain(appName, serverId);
    if (!host) return "";

    const created = await client.createDomain({
      host,
      composeId,
      serviceName: entryService,
      domainType: "compose",
      port: entryPort,
      https: false, // sslip.io free domains are HTTP-only
      certificateType: "none",
      path: "/",
    });
    await log(`${MARKER} Assigned domain: ${created.host} → ${entryService}:${entryPort}`);
    return toUrl(created.host, created.https);
  } catch (err) {
    // Domain setup is best-effort — the deploy already succeeded. Logged
    // rather than swallowed silently, because "no URL" otherwise looks like a
    // configuration choice.
    await log(`${MARKER} Could not attach a domain (the deployment itself succeeded): ${getErrMsg(err)}`);
    return "";
  }
}

function toUrl(host: string, https: boolean): string {
  return `${https ? "https" : "http"}://${host}`;
}

// ─── Failure reporting ───────────────────────────────────────────

/**
 * Compose-specific build-failure patterns.
 *
 * Kept separate from `classifyBuildFailure`: its `missing-start` and
 * `platform-adapter` branches reason about a builder and a start command, and a
 * compose stack has neither. These are the failures the compose path actually
 * produces, in the order that a match proves most.
 */
const COMPOSE_FAILURE_PATTERNS: Array<{ pattern: RegExp; explain: (m: RegExpMatchArray) => string }> = [
  {
    // The stale-compose-file failure: a build context that no longer exists.
    pattern: /unable to prepare context: path "([^"]+)" not found/i,
    explain: (m) =>
      `A service builds from "${m[1]}", which does not exist in the repository. ` +
      `Fix the build context in the compose file, or restore the directory.`,
  },
  {
    pattern: /failed to (?:solve|read) dockerfile: open ([^\s:]+)/i,
    explain: (m) => `A service names the Dockerfile "${m[1]}", which does not exist in the repository.`,
  },
  {
    pattern: /(?:pull access denied|manifest unknown|repository does not exist)[^\n]*?([\w./-]+:[\w.-]+)?/i,
    explain: (m) =>
      `An image could not be pulled${m[1] ? ` ("${m[1]}")` : ""}. Check the image name and tag, ` +
      `and whether it needs registry credentials.`,
  },
  {
    // `${VAR:?msg}` with the variable unset. Blocked before the deploy, so this
    // only fires for a variable set to an empty string.
    pattern: /required variable ([A-Za-z_]\w*) is missing/i,
    explain: (m) =>
      `The compose file requires the variable ${m[1]}, which is unset or empty. ` +
      `Set it in the project's environment variables.`,
  },
  {
    pattern: /network ([\w-]+) declared as external, but could not be found/i,
    explain: (m) =>
      `The compose file expects an external network "${m[1]}" that does not exist on the server. ` +
      `For Dokploy routing this should be "dokploy-network".`,
  },
];

/**
 * Surface a user-facing reason for a failed compose deploy.
 *
 * Users have no Dokploy access, so this message is their only window into the
 * failure. Evidence is the deployment record's `errorMessage` plus the tail of
 * the host-side build log when `fetchBuildLog` is injected. Never throws.
 */
async function reportComposeFailure(
  composeId: string,
  deployment: DokployDeployment | undefined,
  client: DokployClient,
  log: (line: string) => Promise<void>,
  fetchBuildLog?: (logPath: string) => Promise<string>,
): Promise<string> {
  let evidence = deployment?.errorMessage ?? "";
  if (evidence) await log(`${MARKER} Build error: ${evidence}`);

  if (deployment?.logPath && fetchBuildLog) {
    try {
      const tail = await fetchBuildLog(deployment.logPath);
      if (tail) {
        evidence = [evidence, tail].filter(Boolean).join("\n");
        await log(
          `${MARKER} Retrieved the server build log for diagnosis ` +
          `(${Math.max(1, Math.round(tail.length / 1024))} KB from ${deployment.logPath}).`,
        );
      }
    } catch {
      // Best-effort — classify on whatever errorMessage gave us.
    }
  }

  const commit = deployment?.title?.split("\n")[0].trim() ?? "";
  if (commit) await log(`${MARKER} Failing commit: ${commit}`);

  for (const { pattern, explain } of COMPOSE_FAILURE_PATTERNS) {
    const match = evidence.match(pattern);
    if (match) {
      const reason = explain(match);
      await log(`${MARKER} ${reason}`);
      return reason;
    }
  }

  // Same long-tail tier as the application path: the deterministic patterns
  // above cover the compose failures we understand, and this reads the log for
  // everything else. Never throws; null when OPENAI_API_KEY is unset.
  if (evidence.trim()) {
    const { diagnoseBuildFailure } = await import("./ai-diagnosis.js");
    const diagnosis = await diagnoseBuildFailure({ logTail: evidence });
    if (diagnosis) {
      await log(`${MARKER} ${diagnosis.summary}`);
      await log(`${MARKER} Suggested fix: ${diagnosis.suggestion}`);
      return commit
        ? `${diagnosis.summary} (commit "${commit}") ${diagnosis.suggestion}`
        : `${diagnosis.summary} ${diagnosis.suggestion}`;
    }
  }

  // No recognised pattern. The merged compose file is the most useful thing we
  // can still show: it is what Dokploy actually ran, including the Traefik
  // labels it injected, so a reader can see the real build contexts and ports.
  try {
    const converted = await client.getConvertedCompose(composeId);
    if (converted) {
      await log(
        `${MARKER} The stack was deployed from this merged compose file ` +
        `(Dokploy adds the domain labels):\n${converted.slice(0, 4000)}`,
      );
    }
  } catch {
    // Diagnostic only.
  }

  await log(
    `${MARKER} The compose build failed. The cause is almost always in the repository or the compose ` +
    `file — a build that fails, a missing build context, an image that cannot be pulled, or a variable ` +
    `the stack needs. Review the compose file and the most recent commit.`,
  );

  return commit
    ? `The compose deployment failed on commit "${commit}". Check the compose file's build contexts, images and required variables.`
    : `The compose deployment failed. Check the compose file's build contexts, images and required variables.`;
}

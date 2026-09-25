/**
 * Stage: Verify Deploy (runtime visibility)
 *
 * A Dokploy deployment reporting "done" only means the BUILD succeeded and the
 * service was created. It says nothing about whether the container actually
 * serves traffic. Every Bad Gateway in practice looked like a fully successful
 * deploy in Dockier's log, because nothing ever probed the URL — users don't
 * have Dokploy access, so a 502 was invisible and undiagnosable from here.
 *
 * This stage closes that gap: after a successful deploy it probes the app URL
 * and reports what actually happened, and on a gateway error it names the
 * likely cause (no start command / not listening on the routed port) instead of
 * leaving the user to guess.
 *
 * Strictly non-fatal and diagnostic: the deploy has already succeeded, so a
 * failed probe never fails the pipeline. It only adds information.
 */

import { sleep } from "../../../../../shared/utils/time.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";
import type { RuntimeHint } from "./trigger-deploy.js";

export interface VerifyResult {
  /** True when the app responded with a non-gateway-error status. */
  ok: boolean;
  /** Last HTTP status observed, when the request reached Traefik. */
  status?: number;
  /** Short machine-ish reason: "ok" | "gateway" | "http" | "unreachable" | "skipped". */
  reason: "ok" | "gateway" | "http" | "unreachable" | "skipped";
}

/** Statuses that mean Traefik couldn't reach a healthy backend. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Probe the deployed app URL and report runtime state.
 *
 * Polls a few times because a container can take a moment to bind its port
 * after the deploy reports done. Bounded and short — this is diagnostics, not a
 * readiness gate.
 */
export async function stageVerifyDeploy(params: {
  appUrl: string;
  containerPort: number;
  log: (line: string) => Promise<void>;
  runtimeHint?: RuntimeHint;
  attempts?: number;
  intervalMs?: number;
  requestTimeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}): Promise<VerifyResult> {
  const {
    appUrl,
    containerPort,
    log,
    runtimeHint,
    attempts = 5,
    intervalMs = 6_000,
    requestTimeoutMs = 10_000,
    fetchImpl = fetch,
  } = params;

  if (!appUrl) return { ok: false, reason: "skipped" };

  await log(`[stage:verify] Checking that the app responds at ${appUrl} ...`);

  let lastStatus: number | undefined;
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(appUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: { "User-Agent": "Dockier-Verify/1.0" },
      });
      lastStatus = response.status;

      if (!GATEWAY_STATUSES.has(response.status)) {
        // The container answered — routing and the process are working. A 404 or
        // 401 is still a working deployment (the app chose that response).
        if (response.ok) {
          await log(`[stage:verify] ✓ App is responding (HTTP ${response.status}).`);
          return { ok: true, status: response.status, reason: "ok" };
        }
        await log(
          `[stage:verify] ✓ App is reachable and responded HTTP ${response.status}. ` +
          `Routing works; that status came from your application.`,
        );
        return { ok: true, status: response.status, reason: "http" };
      }

      if (attempt < attempts) {
        await log(`[stage:verify] Attempt ${attempt}/${attempts}: HTTP ${response.status} (container may still be starting)...`);
      }
    } catch (err) {
      lastError = getErrMsg(err);
      if (attempt < attempts) {
        await log(`[stage:verify] Attempt ${attempt}/${attempts}: not reachable yet (${lastError})...`);
      }
    }

    if (attempt < attempts) await sleep(intervalMs);
  }

  // Exhausted attempts — report the failure with an actionable diagnosis.
  if (lastStatus !== undefined && GATEWAY_STATUSES.has(lastStatus)) {
    await log(`[stage:verify] ⚠ The app returned HTTP ${lastStatus} (Bad Gateway) — the build succeeded but nothing is serving traffic.`);
    for (const line of diagnoseGateway(containerPort, runtimeHint)) {
      await log(`[stage:verify] ${line}`);
    }
    return { ok: false, status: lastStatus, reason: "gateway" };
  }

  await log(
    `[stage:verify] ⚠ The app URL was not reachable${lastError ? ` (${lastError})` : ""}. ` +
    `The deployment completed, so this may be a transient startup delay — retry the URL in a minute.`,
  );
  return { ok: false, reason: "unreachable" };
}

/**
 * Explain a gateway error in terms the user can act on.
 *
 * The two real causes: (a) the container has no start command so no process is
 * running, or (b) a process is running but isn't listening on the port Traefik
 * forwards to (wrong port, or bound to localhost instead of 0.0.0.0).
 */
function diagnoseGateway(containerPort: number, hint?: RuntimeHint): string[] {
  const lines: string[] = [];

  if (hint?.platformAdapter) {
    lines.push(
      "Most likely cause: this Astro app is built with a platform adapter (Vercel/Netlify/Cloudflare), " +
      'which produces a serverless handler rather than a Node server. Switch to @astrojs/node with mode: "standalone".',
    );
    return lines;
  }

  const missingStart =
    hint?.kind === "server" && !hint.startCommandApplied && !hint.repoHasStartScript;

  if (missingStart) {
    const suggested = hint?.framework === "astro" ? "node ./dist/server/entry.mjs" : "your server entry point";
    lines.push(
      `Most likely cause: no production start command. This ${hint?.framework ?? "server"} app builds but ` +
      `never starts a process. Add a "start" script to package.json (e.g. "${suggested}") and redeploy.`,
    );
    return lines;
  }

  lines.push(
    `Traefik is forwarding to container port ${containerPort}, but nothing is listening there. Check that ` +
    `your app binds the PORT environment variable (Dockier sets PORT=${containerPort}) and listens on ` +
    `0.0.0.0 rather than localhost.`,
  );
  if (hint?.kind === "static") {
    lines.push("This app was detected as a static site; if it actually needs a server process, that detection may be wrong.");
  }
  return lines;
}

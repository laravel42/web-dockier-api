import { db } from "../shared";
import { pollUntil } from "./poll-until";

export function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export async function appendLog(deploymentId: string, line: string) {
  // Strip null bytes — PostgreSQL text columns reject \0
  const sanitized = line.replace(/\0/g, "");
  await db.exec`UPDATE deployments SET logs = logs || ${sanitized + "\n"} WHERE id = ${deploymentId}`;
}

// ─── Health Check Polling ──────────────────────────────────────────

const HEALTH_CHECK_INTERVAL_MS = 15_000;  // 15 seconds between checks
const HEALTH_CHECK_TIMEOUT_MS = 300_000;  // 5 minutes max
const HEALTH_CHECK_REQUEST_TIMEOUT_MS = 10_000; // 10s per HTTP request

/**
 * Poll the deployed application URL until it returns a non-nginx-default
 * response. Runs inline (awaited) so the deployment stays in `deploying`
 * status until the app is actually serving, or the timeout is reached.
 *
 * Returns true if the app responded with real content, false if it timed out.
 */
export async function waitForAppReady(deploymentId: string, appUrl: string): Promise<boolean> {
  if (!appUrl) return false;

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Health Check ──────────────────`);
  await appendLog(deploymentId, `[${ts()}] ℹ Waiting for application to become reachable...`);

  const result = await pollUntil({
    check: async (attempt) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_REQUEST_TIMEOUT_MS);

        const response = await fetch(appUrl, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "Dockier-HealthCheck/1.0" },
        });
        clearTimeout(timeout);

        if (response.ok) {
          const body = await response.text();
          const isNginxDefault = body.includes("Welcome to nginx") && body.includes("nginx.org");

          if (isNginxDefault) {
            await appendLog(deploymentId, `[${ts()}] ℹ Health check #${attempt}: nginx default page (app still starting...)`);
            return null;
          }
          await appendLog(deploymentId, `[${ts()}] ✓ Health check passed — application is live`);
          return true;
        }
        await appendLog(deploymentId, `[${ts()}] ℹ Health check #${attempt}: HTTP ${response.status} (retrying...)`);
      } catch {
        await appendLog(deploymentId, `[${ts()}] ℹ Health check #${attempt}: not reachable yet (retrying...)`);
      }
      return null;
    },
    intervalMs: HEALTH_CHECK_INTERVAL_MS,
    timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    onTimeout: async () => {
      await appendLog(deploymentId, `[${ts()}] ⚠ Health check timed out after ${HEALTH_CHECK_TIMEOUT_MS / 1000}s — the app may still need a moment`);
    },
  });

  return result.success;
}

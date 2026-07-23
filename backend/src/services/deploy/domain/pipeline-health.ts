/**
 * Pipeline health check stage.
 *
 * Polls the deployed application URL until it responds with a non-default page,
 * or times out. Results are written to the deployment logs.
 */

import { pollUntil } from "./poll-until.js";
import { appendLog } from "./pipeline-helpers.js";
import { logTimestamp as ts } from "../../../shared/utils/time.js";

/**
 * Wait for the deployed application to become reachable.
 *
 * Polls the given URL every 15s for up to 150s. Filters out nginx default
 * pages (common during container startup when the reverse proxy is ready
 * before the app process).
 *
 * Returns true if the app responded successfully.
 */
export async function waitForAppReady(deploymentId: string, appUrl: string): Promise<boolean> {
  if (!appUrl) return false;

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Health Check ──────────────────`);
  await appendLog(deploymentId, `[${ts()}] ℹ Waiting for application to become reachable...`);

  const result = await pollUntil({
    check: async (attempt) => {
      try {
        const response = await fetch(appUrl, {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
          redirect: "follow",
          headers: { "User-Agent": "Dockier-HealthCheck/1.0" },
        });

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
    intervalMs: 15_000,
    timeoutMs: 150_000,
    onTimeout: async () => {
      await appendLog(deploymentId, `[${ts()}] ⚠ Health check timed out after 150s — the app may still need a moment`);
    },
  });

  return result.success;
}

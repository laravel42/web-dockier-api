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
}

/**
 * Trigger deployment and poll until success or failure.
 */
export async function stageTriggerDeploy(params: {
  applicationId: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<DeployResult> {
  const { applicationId, client, log, pollIntervalMs = 5000, timeoutMs = 600_000 } = params;

  await log("[stage:deploy] Triggering deployment...");
  await client.deploy({ applicationId, title: "Dockier deploy" });

  // Poll until done or error
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);

    const app = await client.getApplication(applicationId);
    const status = app.applicationStatus;

    if (status === "done") {
      // Extract app URL (Dokploy generates it from the app name + domain)
      const appUrl = extractAppUrl(app);
      await log(`[stage:deploy] ✓ Deployment successful! URL: ${appUrl || "(pending domain)"}`);
      return { status: "done", appUrl };
    }

    if (status === "error") {
      await log("[stage:deploy] ✗ Deployment failed");
      return { status: "error", appUrl: "" };
    }

    // Still running — continue polling
  }

  // Timeout
  throw new Error(`Deployment timed out after ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * Deploy with retry loop. On failure, invokes Dokploy AI for recovery.
 */
export async function stageDeployWithRetry(params: {
  applicationId: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
  maxAttempts?: number;
  pollIntervalMs?: number;
}): Promise<DeployResult> {
  const { applicationId, client, log, maxAttempts = 3, pollIntervalMs } = params;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await log(`[stage:deploy] Attempt ${attempt}/${maxAttempts}...`);

    const result = await stageTriggerDeploy({
      applicationId,
      client,
      log,
      pollIntervalMs,
    });

    if (result.status === "done") {
      return result;
    }

    // Failed — try Dokploy AI recovery if we have retries left
    if (attempt < maxAttempts) {
      await log("[stage:deploy] Invoking Dokploy AI for error diagnosis...");
      const aiResult = await invokeDokployAI({ applicationId, client, log });

      if (aiResult.fixed) {
        await log(`[stage:deploy] Dokploy AI applied fix: ${aiResult.description}`);
      } else {
        await log("[stage:deploy] Dokploy AI could not determine a fix. Retrying...");
      }
    }
  }

  throw new Error(`Deployment failed after ${maxAttempts} attempts`);
}

// ─── Helpers ─────────────────────────────────────────────────────

function extractAppUrl(app: { appName: string }): string {
  // Dokploy assigns URLs based on appName + configured domain.
  // The exact URL depends on Traefik/domain config in Dokploy.
  // For now, return the app name — the full URL resolution
  // will come from querying the Dokploy domains API.
  return app.appName ? `https://${app.appName}.dokploy.local` : "";
}

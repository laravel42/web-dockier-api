/**
 * Deployment destroy orchestrator.
 *
 * Attempts to resolve an adapter for the provider+strategy combination and
 * delegates to its destroy() method. Falls back to legacy logic if no adapter
 * is found or the adapter doesn't implement destroy().
 */

import { db } from "../shared";
import { getAdapter } from "./adapters";
import type { DestroyContext, DestroyResult as AdapterDestroyResult } from "./adapters/types";

// ─── Types ─────────────────────────────────────────────────────────

export interface DestroyOpts {
  deploymentId: string;
  providerRow: { provider: string; region: string; api_key: string; api_secret: string };
  deploymentRow: { repo: string; deploy_strategy: string; docker_image: string };
}

export interface DestroyResult {
  success: boolean;
  message: string;
}

// ─── Main Orchestrator ─────────────────────────────────────────────

export async function destroy(opts: DestroyOpts): Promise<DestroyResult> {
  const { deploymentId, providerRow, deploymentRow } = opts;

  const repoName = deploymentRow.repo.split("/").pop() || "app";
  const rawAppName = deploymentRow.docker_image
    ? deploymentRow.docker_image.split(":")[0]
    : repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const appName = rawAppName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const region = providerRow.region || "us-east-1";

  const tofuRow = await db.queryRow<{ tofu_script: string }>`
    SELECT tofu_script FROM deployments WHERE id = ${deploymentId}`;
  const tofuScript = tofuRow?.tofu_script || "";

  // Clean up local Docker image to prevent stale image reuse on next deploy
  if (deploymentRow.docker_image) {
    try {
      const { execSync } = await import("node:child_process");
      execSync(`docker rmi ${JSON.stringify(deploymentRow.docker_image)} 2>/dev/null`, { timeout: 15_000, stdio: "pipe" });
    } catch {}
  }

  // Try adapter-based destroy
  try {
    const adapter = getAdapter(providerRow.provider, deploymentRow.deploy_strategy);
    if (adapter.destroy) {
      const destroyCtx: DestroyContext = {
        deploymentId,
        repoName,
        appName,
        region,
        providerCredentials: { apiKey: providerRow.api_key, apiSecret: providerRow.api_secret },
        tofuScript,
        deployStrategy: deploymentRow.deploy_strategy,
        appendLog: async (line: string) => {
          await db.exec`UPDATE deployments SET logs = logs || ${line + "\n"} WHERE id = ${deploymentId}`;
        },
      };

      const result = await adapter.destroy(destroyCtx);
      const t = new Date().toISOString().replace("T", " ").slice(0, 19);
      const log = result.success
        ? `\n[${t}] ✓ Infrastructure destroyed via ${adapter.id}`
        : `\n[${t}] ⚠ Partially destroyed via ${adapter.id}. Errors: ${result.errors.join("; ")}`;
      await markDestroyed(deploymentId, log);
      return { success: result.success, message: result.message };
    }
  } catch {
    // No adapter found for this provider+strategy — fall through to legacy
  }

  // Fallback: mark as destroyed with a warning
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  await markDestroyed(deploymentId, `\n[${t}] ⚠ No adapter destroy available — marked as destroyed but resources may still exist`);
  return { success: true, message: "Marked as destroyed (no adapter destroy available)" };
}

// ─── Helpers ───────────────────────────────────────────────────────

async function markDestroyed(deploymentId: string, logMessage: string): Promise<void> {
  await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', tofu_script = '', docker_image = '', logs = logs || ${logMessage}, updated_at = NOW() WHERE id = ${deploymentId}`;
}


/**
 * Deployment destroy orchestrator.
 *
 * Attempts to resolve an adapter for the provider+strategy combination and
 * delegates to its destroy() method. Falls back to marking as destroyed if
 * no adapter is found or the adapter doesn't implement destroy().
 */

import { getAdapter } from "./adapters/index.js";
import type { DestroyContext } from "./adapters/types.js";
import { logger } from "../../../shared/logger.js";
import { deriveRepoName } from "../../../lib/naming.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";

// ─── Main Orchestrator ─────────────────────────────────────────────

export async function destroyDeployment(deploymentId: string): Promise<{ success: boolean; message: string }> {
  logger.info(`[destroy] Starting destroy for deployment ${deploymentId}`);
  const { data: deployment } = await supabaseAdmin
    .from("deployments")
    .select("id,repo,provider_id,deploy_strategy,docker_image,logs,tofu_script")
    .eq("id", deploymentId)
    .single();
  if (!deployment) return { success: false, message: "Deployment not found" };
  logger.info(`[destroy] Found deployment: repo=${deployment.repo} strategy=${deployment.deploy_strategy} provider_id=${deployment.provider_id}`);

  // Fetch provider credentials
  const { data: providerRow } = await supabaseAdmin
    .from("server_providers")
    .select("provider,region,api_key,api_secret")
    .eq("id", deployment.provider_id)
    .single();
  logger.info(`[destroy] Provider: ${providerRow?.provider} region=${providerRow?.region}`);

  const repoName = deriveRepoName(deployment.repo);
  const region = providerRow?.region || "us-east-1";

  // Clean up local Docker image
  if (deployment.docker_image && /^[a-zA-Z0-9_.:/@-]+$/.test(deployment.docker_image)) {
    try {
      const { execSync } = await import("node:child_process");
      execSync("docker rmi " + JSON.stringify(deployment.docker_image) + " 2>/dev/null", { timeout: 15_000, stdio: "pipe" });
    } catch {}
  }

  // Try adapter-based destroy
  if (providerRow) {
    try {
      const adapter = getAdapter(providerRow.provider, deployment.deploy_strategy);
      if (adapter.destroy) {
        const destroyCtx: DestroyContext = {
          deploymentId,
          repoName,
          appName: repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          region,
          providerCredentials: { apiKey: providerRow.api_key, apiSecret: providerRow.api_secret },
          tofuScript: deployment.tofu_script || "",
          deployStrategy: deployment.deploy_strategy,
          appendLog: async (line: string) => {
            const { data: current } = await supabaseAdmin.from("deployments").select("logs").eq("id", deploymentId).maybeSingle();
            const updatedLogs = (current?.logs || "") + line + "\n";
            await supabaseAdmin.from("deployments").update({ logs: updatedLogs }).eq("id", deploymentId);
          },
        };

        const result = await adapter.destroy(destroyCtx);
        const t = new Date().toISOString().replace("T", " ").slice(0, 19);
        const log = result.success
          ? `\n[${t}] ✓ Infrastructure destroyed via ${adapter.id}`
          : `\n[${t}] ⚠ Partially destroyed via ${adapter.id}. Errors: ${result.errors.join("; ")}`;
        await markDestroyed(deploymentId, deployment.logs, log);
        return { success: result.success, message: result.message };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[destroy] Adapter destroy failed for ${deploymentId}: ${errMsg}`);
      const t = new Date().toISOString().replace("T", " ").slice(0, 19);
      await markDestroyed(deploymentId, deployment.logs, `\n[${t}] ⚠ Destroy error: ${errMsg}`);
      return { success: false, message: `Destroy failed: ${errMsg}` };
    }
  }

  // Fallback: mark as destroyed with a warning
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  await markDestroyed(deploymentId, deployment.logs, `\n[${t}] ⚠ No adapter destroy available — marked as destroyed but resources may still exist`);
  return { success: true, message: "Marked as destroyed (no adapter destroy available)" };
}

// ─── Helpers ───────────────────────────────────────────────────────

async function markDestroyed(deploymentId: string, existingLogs: string, logMessage: string): Promise<void> {
  await supabaseAdmin.from("deployments").update({
    status: "destroyed",
    app_url: "",
    tofu_script: "",
    docker_image: "",
    logs: (existingLogs || "") + logMessage,
    updated_at: new Date().toISOString(),
  }).eq("id", deploymentId);
}

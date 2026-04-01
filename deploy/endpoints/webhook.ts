import { api } from "encore.dev/api";
import { db } from "../shared";
import { appendLog, ts } from "../processor/helpers";

export const awsPipelineWebhook = api(
  { method: "POST", path: "/deploy/webhook/aws-pipeline", auth: false },
  async (params: {
    buildId: string;
    status: "deploying" | "success" | "failed";
    appUrl?: string;
    stackName?: string;
    cfnStatus?: string;
    deployTarget?: string;
    codebuildId?: string;
  }): Promise<{ ok: boolean }> => {
    if (!params.buildId) return { ok: false };

    const row = await db.queryRow<{ id: string; status: string }>`
      SELECT id, status FROM deployments WHERE id = ${params.buildId}`;
    if (!row) return { ok: false };

    if (params.status === "success") {
      const appUrl = params.appUrl || "";
      await db.exec`UPDATE deployments SET status = 'success', app_url = ${appUrl}, updated_at = NOW() WHERE id = ${params.buildId}`;
      await appendLog(params.buildId, `[${ts()}] ✓ AWS pipeline complete — app URL: ${appUrl}`);
    } else if (params.status === "failed") {
      await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${params.buildId}`;
      await appendLog(params.buildId, `[${ts()}] ✗ AWS pipeline failed: ${params.cfnStatus || "unknown"}`);
    } else {
      await appendLog(params.buildId, `[${ts()}] ℹ AWS pipeline: ${params.status} (${params.deployTarget || ""})`);
    }
    return { ok: true };
  }
);

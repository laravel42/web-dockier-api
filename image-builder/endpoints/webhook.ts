// ─── Webhook Endpoint ───

import { api } from "encore.dev/api";
import {
  db, rowToBuild,
  type WebhookPayload,
} from "../shared";

// ─── API: Webhook (called by Lambda when deploy completes) ───

export const webhook = api(
  { expose: true, method: "POST", path: "/image-builder/webhook", auth: false },
  async (params: WebhookPayload): Promise<{ ok: boolean }> => {
    if (!params.buildId) return { ok: false };
    const row = await db.queryRow`SELECT * FROM builds WHERE id = ${params.buildId}`;
    if (!row) return { ok: false };

    if (params.codebuildId) {
      await db.exec`UPDATE builds SET codebuild_id = ${params.codebuildId}, updated_at = NOW() WHERE id = ${params.buildId}`;
    }

    if (params.status === "success") {
      await db.exec`UPDATE builds SET status = 'succeeded', build_metadata = ${JSON.stringify({ appUrl: params.appUrl || "", stackName: params.stackName || "" })}, updated_at = NOW() WHERE id = ${params.buildId}`;
    } else if (params.status === "failed") {
      await db.exec`UPDATE builds SET status = 'failed', status_reason = ${`Deploy failed: ${params.cfnStatus || "unknown"}`}, updated_at = NOW() WHERE id = ${params.buildId}`;
    } else {
      await db.exec`UPDATE builds SET status = 'in_progress', status_reason = ${`Deploying (${params.deployTarget || ""})`}, updated_at = NOW() WHERE id = ${params.buildId}`;
    }
    return { ok: true };
  }
);

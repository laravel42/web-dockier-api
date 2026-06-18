/**
 * Image Builder Webhook Processor
 *
 * Handles incoming build/deploy callback webhooks from CodeBuild/CloudFormation.
 * Extracted from routes.ts to follow the domain delegation pattern used
 * by the deploy service (applyDeploymentWebhookUpdate).
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Database } from "../../../shared/supabase/types.js";
import { composeDeployingReason } from "./orchestrator.js";
import { ImageBuilderError } from "./builds.js";

export interface WebhookPayload {
  buildId: string;
  status: "deploying" | "success" | "failed";
  stackName?: string;
  appUrl?: string;
  cfnStatus?: string;
  deployTarget?: string;
  codebuildId?: string;
}

/**
 * Process an image-builder webhook callback.
 *
 * Looks up the build by ID, applies status/metadata updates, and persists them.
 * Returns `{ success: false }` if the build doesn't exist (webhook for deleted build).
 */
export async function processImageBuilderWebhook(payload: WebhookPayload): Promise<{ success: boolean }> {
  const { data, error: fetchError } = await supabaseAdmin
    .from("builds")
    .select("*")
    .eq("id", payload.buildId)
    .maybeSingle();

  if (fetchError) {
    throw new ImageBuilderError("Database error fetching build", "internal", fetchError);
  }
  if (!data) return { success: false };

  const updates: Database["public"]["Tables"]["builds"]["Update"] = {
    updated_at: new Date().toISOString(),
  };

  if (payload.codebuildId) {
    updates.codebuild_id = payload.codebuildId;
  }

  if (payload.status === "success") {
    updates.status = "succeeded";
    const existingMeta: Record<string, unknown> =
      typeof data.build_metadata === "string" && data.build_metadata
        ? JSON.parse(data.build_metadata)
        : {};
    updates.build_metadata = JSON.stringify({
      ...existingMeta,
      appUrl: payload.appUrl ?? "",
      stackName: payload.stackName ?? "",
    });
  } else if (payload.status === "failed") {
    updates.status = "failed";
    updates.status_reason = `Deploy failed: ${payload.cfnStatus ?? "unknown"}`;
  } else {
    updates.status = "in_progress";
    updates.status_reason = composeDeployingReason(payload.deployTarget);
  }

  const { error: updateError } = await supabaseAdmin
    .from("builds")
    .update(updates)
    .eq("id", payload.buildId);

  if (updateError) {
    throw new ImageBuilderError("Database error updating build", "internal", updateError);
  }

  return { success: true };
}

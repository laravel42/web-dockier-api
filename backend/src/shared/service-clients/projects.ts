/**
 * Projects Service Client
 *
 * Thin cross-service accessor for project configuration data.
 * Used by the deploy pipeline to fetch deploy script and platform
 * without depending directly on the projects domain module.
 */

import { supabaseAdmin } from "../supabase/client.js";
import { logger } from "../logger.js";

export interface ProjectDeployConfig {
  platform: string;
  deployScript: string;
  healthCheckEnabled: boolean;
  healthCheckUrl: string;
}

/**
 * Fetch the deploy-relevant configuration for a project.
 *
 * Returns null if the project doesn't exist or the query fails.
 * Extracts `deployScript` from the JSONB `settings` column and
 * the `platform` column.
 *
 * @example
 * ```ts
 * const config = await getProjectDeployConfig(projectId);
 * if (config?.deployScript) { ... }
 * ```
 */
export async function getProjectDeployConfig(projectId: string): Promise<ProjectDeployConfig | null> {
  if (!projectId) return null;

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("settings, platform")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, projectId }, "[service-clients] Failed to fetch project deploy config");
    return null;
  }
  if (!data) return null;

  let deployScript = "";
  let healthCheckEnabled = false;
  let healthCheckUrl = "";
  if (data.settings && typeof data.settings === "object" && !Array.isArray(data.settings)) {
    const settings = data.settings as Record<string, unknown>;
    deployScript = settings.deployScript as string ?? "";
    healthCheckEnabled = settings.healthCheckEnabled === true;
    healthCheckUrl = settings.healthCheckUrl as string ?? "";
  }

  return {
    platform: (data.platform as string) || "",
    deployScript,
    healthCheckEnabled,
    healthCheckUrl,
  };
}

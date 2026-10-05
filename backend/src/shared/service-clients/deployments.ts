/**
 * Deployments Service Client
 *
 * Thin cross-service accessor for deployment data.
 * Used by commands, network, and domains services that need to
 * locate the active deployment for a project without depending
 * directly on the deploy service's domain layer.
 *
 * This is the canonical point of access — when the underlying table
 * schema or access pattern changes, only this file needs updating.
 */

import { supabaseAdmin } from "../supabase/client.js";
import type { InfraMetadata } from "../../services/deploy/types.js";
import { parseInfra } from "../../services/deploy/types.js";
import { logger } from "../logger.js";

export interface ActiveDeployment {
  id: string;
  providerId: string;
  deployStrategy: string;
  appUrl: string;
  dockerImage: string;
  repo: string;
  infra: InfraMetadata | null;
}

/**
 * Find the latest successful deployment for a project.
 *
 * Returns null if no successful deployment exists for the given
 * project+tenant combination. Consumers should provide their own
 * domain-appropriate error message on null.
 *
 * @example
 * ```ts
 * const deployment = await getActiveDeployment(projectId, tenantId);
 * if (!deployment) throw new Error("No active deployment found");
 * ```
 */
export async function getActiveDeployment(
  projectId: string,
  tenantId: string,
): Promise<ActiveDeployment | null> {
  const result = await lookupActiveDeployment(projectId, tenantId);
  return result.ok ? result.deployment : null;
}

/**
 * Outcome of an active-deployment lookup, distinguishing "the query failed"
 * from "there is no deployment".
 */
export type ActiveDeploymentLookup =
  | { ok: true; deployment: ActiveDeployment | null }
  | { ok: false; error: string };

/**
 * Like `getActiveDeployment`, but reports a query failure instead of folding it
 * into `null`.
 *
 * `getActiveDeployment` cannot tell a caller why it returned null, so a
 * transient database error becomes indistinguishable from "nothing deployed
 * yet". Callers that act on that distinction — a retryable failure versus a
 * genuine unsupported state — must use this instead.
 */
export async function lookupActiveDeployment(
  projectId: string,
  tenantId: string,
): Promise<ActiveDeploymentLookup> {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("id, provider_id, deploy_strategy, app_url, docker_image, repo, infra")
    .eq("project_id", projectId)
    .eq("organization_id", tenantId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, projectId }, "[service-clients] Failed to fetch active deployment");
    return { ok: false, error: error.message || "deployment lookup failed" };
  }
  if (!data) return { ok: true, deployment: null };

  return {
    ok: true,
    deployment: {
      id: data.id,
      providerId: data.provider_id,
      deployStrategy: data.deploy_strategy,
      appUrl: data.app_url,
      dockerImage: data.docker_image,
      repo: data.repo,
      infra: parseInfra(data.infra as Record<string, unknown> | null),
    },
  };
}

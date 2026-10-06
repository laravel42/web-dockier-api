/**
 * Which cloud a static project is hosted on, resolved cheaply.
 *
 * Deliberately NOT `resolveStaticTarget`: that one costs a `DescribeStacks`
 * plus a `GetCallerIdentity`, which is far too much work to validate a string
 * the user just typed into a form. Everything here comes from two database
 * reads and no provider call.
 */

import { supabaseAdmin } from "../../../../shared/supabase/client.js";
import { logger } from "../../../../shared/logger.js";
import { lookupActiveDeployment } from "../../../../shared/service-clients/deployments.js";

export type StaticCloud = "aws" | "gcp";

export interface StaticCloudResolution {
  /** `null` when the project is not a static deployment, or could not be read. */
  cloud: StaticCloud | null;
  /** The CDN hostname (AWS) or load balancer IP (GCP) domains should point at. */
  routeTarget: string | null;
  /** Hostnames the user has acknowledged as ALIAS/ANAME/flattening-capable. */
  apexAliasAck: string[];
}

/** Read the acknowledged-apex list out of `projects.settings`. */
async function readApexAliasAck(projectId: string, tenantId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("settings")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, projectId }, "[domains:static] could not read apex acknowledgements");
    return [];
  }

  const settings = data?.settings as Record<string, unknown> | null | undefined;
  const ack = settings?.apexAliasAck;
  if (!Array.isArray(ack)) return [];
  return ack.filter((v): v is string => typeof v === "string");
}

/**
 * Resolve the cloud, the route target, and the acknowledged apex hostnames.
 *
 * TWO reads, with deliberately OPPOSITE failure rules. Do not unify them:
 *
 *   - `cloud` fails OPEN. If the deployment cannot be read we return `null`,
 *     the apex check does not fire, and the add succeeds — the reconcile
 *     backstop still refuses an unusable domain later. A database blip must not
 *     block a user from adding a perfectly good subdomain.
 *   - `apexAliasAck` fails CLOSED, to `[]`. A failed settings read makes a
 *     previously acknowledged apex invisible, so it is refused again with the
 *     full explanation and the checkbox. The user can re-tick; the alternative
 *     is silently accepting an apex we have no record of them confirming.
 */
export async function resolveStaticCloud(
  projectId: string,
  tenantId: string,
): Promise<StaticCloudResolution> {
  const apexAliasAck = await readApexAliasAck(projectId, tenantId);

  const lookup = await lookupActiveDeployment(projectId, tenantId);
  if (!lookup.ok || !lookup.deployment) {
    return { cloud: null, routeTarget: null, apexAliasAck };
  }

  const deployment = lookup.deployment;
  if (deployment.deployStrategy !== "static") {
    return { cloud: null, routeTarget: null, apexAliasAck };
  }

  const infra = deployment.infra;
  if (!infra) return { cloud: null, routeTarget: null, apexAliasAck };

  // GCP static carries a `cdnIp`; AWS static carries a `distributionDomain`.
  if (infra.cdnIp) {
    return { cloud: "gcp", routeTarget: infra.cdnIp, apexAliasAck };
  }
  if (infra.distributionDomain) {
    return { cloud: "aws", routeTarget: infra.distributionDomain, apexAliasAck };
  }

  // A static deployment whose CDN handle has not been persisted yet — the
  // provider still tells us which cloud it is.
  const provider = infra.provider;
  if (provider === "gcp") return { cloud: "gcp", routeTarget: null, apexAliasAck };
  if (provider === "aws") return { cloud: "aws", routeTarget: null, apexAliasAck };

  return { cloud: null, routeTarget: null, apexAliasAck };
}

/**
 * Which cloud a static project is hosted on, resolved cheaply.
 *
 * Deliberately NOT `resolveStaticTarget`: that one costs a `DescribeStacks`
 * plus a `GetCallerIdentity`, which is far too much work to validate a string
 * the user just typed into a form. Everything here comes from two database
 * reads and no provider call.
 */

import { lookupActiveDeployment } from "../../../../shared/service-clients/deployments.js";
import { listApexAcks } from "../apex-ack.js";

export type StaticCloud = "aws" | "gcp";

export interface StaticCloudResolution {
  /** `null` when the project is not a static deployment, or could not be read. */
  cloud: StaticCloud | null;
  /** The CDN hostname (AWS) or load balancer IP (GCP) domains should point at. */
  routeTarget: string | null;
  /** Hostnames the user has acknowledged as ALIAS/ANAME/flattening-capable. */
  apexAliasAck: string[];
}

/**
 * Resolve the cloud, the route target, and the acknowledged apex hostnames.
 *
 * TWO reads, with deliberately OPPOSITE failure rules. They share the ack
 * helper now, but the rules must not be unified:
 *
 *   - `cloud` fails OPEN. If the deployment cannot be read we return `null`,
 *     the apex check does not fire, and the add succeeds — the reconcile
 *     backstop still refuses an unusable domain later. A database blip must not
 *     block a user from adding a perfectly good subdomain.
 *   - `apexAliasAck` fails CLOSED, to `[]` (inside `listApexAcks`). A failed
 *     settings read makes a previously acknowledged apex invisible, so it is
 *     refused again with the full explanation and the checkbox. The user can
 *     re-tick; the alternative is silently accepting an apex we have no record
 *     of them confirming.
 */
export async function resolveStaticCloud(
  projectId: string,
  tenantId: string,
): Promise<StaticCloudResolution> {
  // The single owner of the `projects.settings` ack read. Fails closed to `[]`
  // on a read error, same as before — only the log level is now `error`, which
  // is right, since an unreadable settings row silently re-refuses a confirmed
  // apex. The `cloud` branch below still fails OPEN, which is why the two reads
  // stay separate even now that they share one helper.
  const apexAliasAck = await listApexAcks(tenantId, projectId);

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

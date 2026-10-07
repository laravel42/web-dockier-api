/**
 * A short-lived memo of `resolveStaticTarget`, for the READ path only.
 *
 * `resolveStaticTarget` costs an STS `GetCallerIdentity` and, when the CDN
 * handle is not on the deployment record, a `DescribeStacks` as well. The
 * attachment view polls every 20 seconds while anything is in flight, so an
 * uncached resolve per request is not acceptable — it would turn one open
 * browser tab into a steady stream of AWS API calls.
 *
 * Deliberately NOT used by the apply path. A reconcile that is about to change
 * a distribution should resolve fresh; 60 seconds of staleness is fine for
 * rendering a progress card and not fine for deciding what to mutate.
 */

import type { ActiveDeployment } from "../../../../shared/service-clients/deployments.js";
import { resolveStaticTarget } from "./target.js";

type Resolution = Awaited<ReturnType<typeof resolveStaticTarget>>;

const TTL_MS = 60_000;

interface Entry {
  at: number;
  resolution: Resolution;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Resolution>>();

export async function resolveStaticTargetCached(params: {
  projectId: string;
  deployment: ActiveDeployment;
}): Promise<Resolution> {
  const { projectId } = params;

  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.resolution;

  // One in-flight resolve per project, so a burst of concurrent renders does
  // not fan out into concurrent STS calls.
  const existing = inFlight.get(projectId);
  if (existing) return await existing;

  const pending = resolveStaticTarget(params)
    .then((resolution) => {
      cache.set(projectId, { at: Date.now(), resolution });
      return resolution;
    })
    .finally(() => {
      inFlight.delete(projectId);
    });

  inFlight.set(projectId, pending);
  return await pending;
}

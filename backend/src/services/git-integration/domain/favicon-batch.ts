/**
 * Favicons for many repos in one request.
 *
 * The list pages asked the single-repo route once per project, against a
 * 30/min per-tenant cap, so a page past 30 projects silently lost its avatars
 * to a 429. One request per page load removes that ceiling entirely.
 *
 * Unlike badges, this cannot be cache-only. A favicon is invalidated on every
 * successful deploy (clearRepoFaviconFromAnalysisCache, called from all three
 * deploy pipelines), so a cache-only batch would drop a project's icon the
 * moment it deployed and leave it missing until someone opened that project.
 * There is no creation-time producer to lean on the way badges have one.
 *
 * So it resolves misses too, but at most RESOLVE_PER_CALL of them, because
 * resolving walks the repo on the git provider and the route has a 45s budget.
 * A page of cold projects therefore fills in over a few visits instead of
 * timing out, and the HTTP cost stays at one request either way.
 */
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import {
  parseJsonField,
  updateAnalysisCache,
  writeAnalysisCache,
  type CacheLogger,
} from "./cache.js";
import { getConnectionForTenant } from "./connections.js";
import { parseRepositoryRef } from "./repo-ref.js";
import {
  isRepoFaviconCacheValid,
  isValidFaviconDataUrl,
  resolveRepoFaviconDataUrl,
  REPO_FAVICON_RESOLVER_VERSION,
  type RepoFaviconCacheEntry,
} from "./repo-favicon.js";

/**
 * How many cache misses one call will resolve. Each is a provider round trip,
 * and the route's budget is 45s.
 * shortcut: a fully cold page of 50 needs several visits to fill, revisit if
 * resolving moves to a background worker.
 */
const RESOLVE_PER_CALL = 6;

export interface FaviconBatchRequest {
  repo: string;
  branch?: string;
  connectionId?: string;
  rootDirectory?: string;
  webDirectory?: string;
}

export interface FaviconBatchResult {
  repo: string;
  branch: string;
  favicon: string | null;
  deployId: string | null;
}

type FaviconCache = { repoFavicon?: RepoFaviconCacheEntry };

/**
 * Newest successful deploy per repo@branch, in one query.
 *
 * The per-repo helper would be one round trip each, which is the fan-out this
 * route exists to remove — moved from HTTP to the database rather than fixed.
 * Rows come back newest first and the first one seen for a key wins.
 *
 * shortcut: capped at 2000 rows, so a tenant with more successful deploys than
 * that across one page of repos can miss an id and re-resolve a favicon it did
 * not need to. Revisit with a `distinct on` RPC if that ever shows up.
 */
async function latestDeployIdsFor(
  tenantId: string,
  repoKeys: string[],
): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from("deployments")
    .select("id, repo, branch")
    .eq("organization_id", tenantId)
    .in("repo", repoKeys)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(2000);

  const latest = new Map<string, string>();
  for (const row of data ?? []) {
    const key = `${row.repo}@${row.branch}`;
    if (!latest.has(key)) latest.set(key, row.id);
  }
  return latest;
}

export async function resolveFaviconsBatch(
  tenantId: string,
  requested: FaviconBatchRequest[],
  logger: CacheLogger,
): Promise<FaviconBatchResult[]> {
  const db = supabaseAdmin;
  const wanted = requested.map((entry) => ({ ...entry, branch: entry.branch || "main" }));
  const repoKeys = [...new Set(wanted.map((entry) => entry.repo))];

  // One read for every row, instead of one per project.
  const { data: rows } = await db
    .from("analysis_cache")
    .select("repo, branch, result")
    .eq("organization_id", tenantId)
    .in("repo", repoKeys);

  const cached = new Map<string, FaviconCache | null>();
  for (const row of rows ?? []) {
    cached.set(`${row.repo}@${row.branch}`, parseJsonField<FaviconCache>(row.result));
  }

  const deployIds = await latestDeployIdsFor(tenantId, repoKeys);

  const results: FaviconBatchResult[] = [];
  const misses: typeof wanted = [];

  for (const entry of wanted) {
    const key = `${entry.repo}@${entry.branch}`;
    const existing = cached.get(key)?.repoFavicon;
    if (!existing) {
      misses.push(entry);
      continue;
    }
    const deployId = deployIds.get(key) ?? null;
    if (isRepoFaviconCacheValid(existing, deployId)) {
      const url = existing.dataUrl;
      results.push({
        repo: entry.repo,
        branch: entry.branch,
        favicon: url && isValidFaviconDataUrl(url) ? url : null,
        deployId,
      });
      continue;
    }
    misses.push(entry);
  }

  // Resolving needs a connection; without one there is nothing to walk.
  const resolvable = misses.filter((entry) => entry.connectionId).slice(0, RESOLVE_PER_CALL);

  const resolved = await Promise.all(
    resolvable.map(async (entry): Promise<FaviconBatchResult | null> => {
      const ref = parseRepositoryRef(entry.repo);
      if (!ref) return null;
      try {
        const deployId = deployIds.get(`${entry.repo}@${entry.branch}`) ?? null;
        const connection = await getConnectionForTenant(entry.connectionId!, tenantId);
        const favicon = await resolveRepoFaviconDataUrl(
          connection,
          { owner: ref.owner, repo: ref.repo, branch: entry.branch },
          { rootDirectory: entry.rootDirectory, webDirectory: entry.webDirectory },
        );
        const previous = cached.get(`${entry.repo}@${entry.branch}`);
        const merged = {
          ...(previous ?? {}),
          repoFavicon: {
            dataUrl: favicon,
            resolvedAt: new Date().toISOString(),
            deployId,
            version: REPO_FAVICON_RESOLVER_VERSION,
          } satisfies RepoFaviconCacheEntry,
        };
        if (previous) {
          await updateAnalysisCache(tenantId, entry.repo, entry.branch, merged as Json, logger);
        } else {
          await writeAnalysisCache(
            { tenantId, repoKey: entry.repo, branch: entry.branch, result: merged as Json },
            logger,
          );
        }
        return { repo: entry.repo, branch: entry.branch, favicon, deployId };
      } catch (err) {
        // One bad repo must not fail the page. Left out of the response, so the
        // caller keeps whatever icon it had and asks again next visit.
        logger.warn(
          { repo: entry.repo, err: err instanceof Error ? err.message : err },
          "[favicon-batch] could not resolve",
        );
        return null;
      }
    }),
  );

  for (const entry of resolved) {
    if (entry) results.push(entry);
  }
  return results;
}

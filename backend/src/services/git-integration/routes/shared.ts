/**
 * Shared utilities for git-integration sub-route modules.
 */

import { getConnectionForTenant } from "../domain/connections.js";
import { type RepoStats } from "../domain/git-provider.js";

/**
 * Get connection for tenant, letting domain errors propagate to the global handler.
 */
export async function requireConnection(connectionId: string, tenantId: string) {
  return await getConnectionForTenant(connectionId, tenantId);
}

export function isPlaceholderStats(stats: RepoStats): boolean {
  return (
    stats.stars === 0
    && stats.forks === 0
    && stats.openIssues === 0
    && stats.totalCommits === 0
    && stats.contributors === 0
    && !stats.lastCommitHash
  );
}

export function needsContributorProfileRefresh(stats: RepoStats, provider: string): boolean {
  if (provider !== "gitlab" && provider !== "gitlab_self_hosted") return false;
  if (!stats.topContributors?.length) return false;
  return stats.topContributors.every((contributor) => !contributor.profileUrl);
}

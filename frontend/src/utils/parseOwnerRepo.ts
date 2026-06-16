/**
 * Core repo URL parser. Extracts owner and repo name from a git URL.
 * Supports GitLab nested groups: group/subgroup/repo → owner=group/subgroup, repo=repo
 */
export function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      const repo = parts[parts.length - 1];
      const owner = parts.slice(0, parts.length - 1).join("/");
      return { owner, repo };
    }
  } catch {
    /* Invalid repo URL */
  }
  return null;
}

/**
 * Returns the repo slug (just the repo name, no owner).
 * Falls back to parsing the raw string if URL parsing fails.
 */
export function getRepoSlug(repoUrl: string): string {
  const parsed = parseOwnerRepo(repoUrl);
  if (parsed) return parsed.repo;
  return repoUrl?.split("/").pop()?.replace(/\.git$/, "") || "—";
}

/**
 * Returns the full "owner/repo" key from a repo URL.
 * Returns null if the URL can't be parsed.
 */
export function getRepoKey(repoUrl: string): string | null {
  const parsed = parseOwnerRepo(repoUrl);
  if (parsed) return `${parsed.owner}/${parsed.repo}`;
  return null;
}

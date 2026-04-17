export function getRepoSlug(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    const path = u.pathname.replace(/^\//, "").replace(/\.git$/, "");
    const parts = path.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 1] : path || "—";
  } catch {
    return repoUrl?.split("/").pop()?.replace(/\.git$/, "") || "—";
  }
}

export function getRepoKey(repoUrl: string): string | null {
  try {
    const u = new URL(repoUrl);
    const path = u.pathname.replace(/^\//, "").replace(/\.git$/, "");
    const parts = path.split("/").filter(Boolean);
    // Must match parseOwnerRepo: full path (owner/subgroup/repo)
    return parts.length >= 2 ? parts.join("/") : null;
  } catch {
    return null;
  }
}

/** Display repo-relative paths; strips temp clone prefixes from legacy absolute paths. */
export function displayFindingPath(filePath: string): string {
  if (!filePath) return filePath;
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized)) {
    return normalized;
  }

  const repoMarker = "/repo/";
  const markerIdx = normalized.indexOf(repoMarker);
  if (markerIdx >= 0) {
    return normalized.slice(markerIdx + repoMarker.length);
  }

  const parts = normalized.split("/");
  const repoIdx = parts.lastIndexOf("repo");
  if (repoIdx >= 0 && repoIdx < parts.length - 1) {
    return parts.slice(repoIdx + 1).join("/");
  }

  return normalized;
}

/**
 * Link to the finding's line in the repository's web UI, for MR and issue bodies.
 * Every host was given GitLab's `/-/blame/` path, a 404 on GitHub and Bitbucket.
 * Anything not GitHub or Bitbucket is treated as GitLab, which covers self-hosted
 * instances. The path goes through displayFindingPath (legacy absolute paths) and
 * is encoded segment by segment, so `#` or spaces in a file name cannot cut it.
 */
export function findingSourceUrl(repository: string, branch: string, filePath: string, line: number): string {
  const base = repository.replace(/\.git$/, "").replace(/\/$/, "");
  const encode = (s: string) => s.split("/").map(encodeURIComponent).join("/");
  const path = encode(displayFindingPath(filePath));
  // Per segment, so `feature/x` keeps its slash the way the hosts expect.
  const ref = encode(branch);
  if (/github/i.test(base)) return `${base}/blame/${ref}/${path}#L${line}`;
  if (/bitbucket/i.test(base)) return `${base}/src/${ref}/${path}#lines-${line}`;
  return `${base}/-/blame/${ref}/${path}#L${line}`;
}

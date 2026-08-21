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

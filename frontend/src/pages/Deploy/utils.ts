export function repoKey(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) return parts.join("/");
  } catch { /* URL parse fallback */ }
  return repoUrl;
}

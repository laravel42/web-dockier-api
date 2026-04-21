// ─── Internal file content fetcher (reusable) ───

export async function fetchRepoFile(provider: string, token: string, endpoint: string, owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  try {
    if (provider === "github") {
      const baseUrl = endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3.raw" },
      });
      if (!res.ok) return null;
      return await res.text();
    } else if (provider === "gitlab" || provider === "gitlabSelfHosted") {
      const baseUrl = endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${owner}/${repo}`);
      const filePath = encodeURIComponent(path);
      const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${encodeURIComponent(branch)}`, {
        headers: { "PRIVATE-TOKEN": token },
      });
      if (!res.ok) return null;
      return await res.text();
    } else if (provider === "bitbucket") {
      const baseUrl = endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories/${owner}/${repo}/src/${encodeURIComponent(branch)}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.text();
    }
  } catch { /* ignore */ }
  return null;
}

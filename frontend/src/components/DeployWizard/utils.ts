export function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      const repo = parts[parts.length - 1];
      const owner = parts.slice(0, parts.length - 1).join("/");
      return { owner, repo };
    }
  } catch {}
  return null;
}

export function parseEnvContent(text: string): Array<{ name: string; value: string }> {
  const rows: Array<{ name: string; value: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    if (name) rows.push({ name, value });
  }
  return rows;
}

export function formatEnvContent(rows: Array<{ name: string; value: string }>): string {
  return rows.map(({ name, value }) => {
    const needsQuotes = /[\s#"'$]/.test(value) || value.includes("=");
    return needsQuotes ? `${name}="${value.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"` : `${name}=${value}`;
  }).join("\n");
}

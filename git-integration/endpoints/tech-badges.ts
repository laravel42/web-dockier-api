import { api } from "encore.dev/api";
import { db } from "../shared";
import { throwProviderError } from "../helpers";
import { detectTechStack } from "../analysis/tech-stack";

interface TechBadge {
  name: string;
  category: string;
  confidence: number;
}

/**
 * Returns language/framework badges for a given repo.
 * Reads from analysis_cache first; if missing, does a lightweight file-tree scan
 * and runs detectTechStack (no AI, no OpenAI credits).
 */
export const getRepoBadges = api(
  { method: "GET", path: "/git/repo-badges", auth: true },
  async (params: { repo: string; branch?: string; connectionId?: string }): Promise<{ badges: TechBadge[] }> => {
    const branch = params.branch || "main";

    // 1. Try cache first
    const cached = await db.queryRow<{ result: string }>`
      SELECT result FROM analysis_cache WHERE repo = ${params.repo} AND branch = ${branch}`;

    if (cached) {
      try {
        const parsed = JSON.parse(cached.result);
        const techStack: TechBadge[] = parsed.techStack || [];
        const badges = techStack.filter(
          (t) => t.confidence >= 70 && t.category !== "database"
        );
        if (badges.length > 0) return { badges: badges.slice(0, 8) };
      } catch { /* fall through */ }
    }

    // 2. No cache — do a lightweight file-tree fetch + detectTechStack
    if (!params.connectionId) return { badges: [] };

    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) return { badges: [] };

    let files: string[] = [];
    const [owner, repo] = params.repo.split("/");
    if (!owner || !repo) return { badges: [] };

    try {
      if (conn.provider === "github") {
        const baseUrl = conn.endpoint || "https://api.github.com";
        const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };
        const treeRes = await fetch(`${baseUrl}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
        if (treeRes.ok) {
          const treeData = await treeRes.json() as any;
          if (Array.isArray(treeData.tree)) {
            files = treeData.tree.filter((f: any) => f.type === "blob").map((f: any) => f.path);
          }
        }
      } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
        const baseUrl = conn.endpoint || "https://gitlab.com";
        const headers = { "PRIVATE-TOKEN": conn.personal_token };
        const projectPath = encodeURIComponent(`${owner}/${repo}`);
        const treeRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100`, { headers });
        if (treeRes.ok) {
          const treeData = await treeRes.json() as any[];
          if (Array.isArray(treeData)) {
            files = treeData.filter((f: any) => f.type === "blob").map((f: any) => f.path);
          }
        }
      } else if (conn.provider === "bitbucket") {
        const baseUrl = conn.endpoint || "https://api.bitbucket.org";
        const headers = { Authorization: `Bearer ${conn.personal_token}` };
        const srcRes = await fetch(`${baseUrl}/2.0/repositories/${owner}/${repo}/src/${branch}/?pagelen=100`, { headers });
        if (srcRes.ok) {
          const srcData = await srcRes.json() as any;
          if (Array.isArray(srcData.values)) {
            files = srcData.values.filter((f: any) => f.type === "commit_file").map((f: any) => f.path);
          }
        }
      }
    } catch { /* ignore */ }

    if (files.length === 0) return { badges: [] };

    const techStack = detectTechStack(files);
    const badges = techStack.filter(
      (t) => t.confidence >= 70 && t.category !== "database"
    );
    return { badges: badges.slice(0, 8) };
  }
);

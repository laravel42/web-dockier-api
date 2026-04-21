import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "../shared";
import { fetchRepoFile } from "../analysis/fetch-file";
import { type SensitiveField, scanSensitiveData } from "../analysis/sensitive-data-scanner";

export const getSensitiveData = api(
  { expose: true, method: "GET", path: "/git/connections/:connectionId/sensitive-data", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string }): Promise<{ sensitiveData: SensitiveField[] }> => {
    const conn = await db.queryRow<{ provider: string; personal_token: string; endpoint: string }>`
      SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");

    const branch = params.branch || "main";

    // Get file tree
    let files: string[] = [];
    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };
      const treeRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers });
      if (treeRes.ok) {
        const treeData = await treeRes.json() as any;
        if (Array.isArray(treeData.tree)) files = treeData.tree.filter((f: any) => f.type === "blob").map((f: any) => f.path);
      }
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const headers = { "PRIVATE-TOKEN": conn.personal_token };
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      let page = 1;
      while (page <= 20) {
        const treeRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100&page=${page}`, { headers });
        if (!treeRes.ok) break;
        const treeData = await treeRes.json() as any[];
        if (!Array.isArray(treeData) || treeData.length === 0) break;
        for (const f of treeData) { if (f.type === "blob") files.push(f.path); }
        if (treeData.length < 100) break;
        page++;
      }
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const headers = { Authorization: `Bearer ${conn.personal_token}` };
      const srcRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/src/${encodeURIComponent(branch)}/?pagelen=100`, { headers });
      if (srcRes.ok) {
        const srcData = await srcRes.json() as any;
        if (Array.isArray(srcData.values)) files = srcData.values.filter((f: any) => f.type === "commit_file").map((f: any) => f.path);
      }
    }

    console.log(`[sensitiveData] Files in repo: ${files.length}`);

    // Match schema/migration/model files
    const schemaPatterns = [
      /migrations?\/.*\.(sql|php)$/i,
      /database\/.*\.(sql|php)$/i,
      /schema\.(sql|prisma|graphql|ts|rb)$/i,
      /models?\.(ts|js|py|rb|php)$/i,
      /models\/.*\.(ts|js|py|rb|php)$/i,
      /entities\/.*\.(ts|js|py|rb|php)$/i,
      /app\/Models\/.*\.php$/i,
      /drizzle\/.*\.ts$/i,
      /prisma\/schema\.prisma$/i,
      /database\/factories\/.*\.php$/i,
      /app\/.*Resource\.php$/i,
      /src\/entity\/.*\.(ts|js)$/i,
      /db\/.*\.(sql|ts|js)$/i,
    ];
    const matched = files.filter(f => schemaPatterns.some(p => p.test(f))).slice(0, 50);
    console.log(`[sensitiveData] Schema files matched: ${matched.length}`, matched.slice(0, 15));

    // Fetch file contents
    const schemaFiles: Record<string, string> = {};
    await Promise.all(matched.map(async (sf) => {
      const content = await fetchRepoFile(conn.provider, conn.personal_token, conn.endpoint || "", params.owner, params.repo, branch, sf);
      if (content) schemaFiles[sf] = content;
    }));

    console.log(`[sensitiveData] Fetched ${Object.keys(schemaFiles).length} files`);

    const sensitiveData = scanSensitiveData(schemaFiles, {});
    console.log(`[sensitiveData] Found ${sensitiveData.length} sensitive fields`);

    return { sensitiveData };
  }
);

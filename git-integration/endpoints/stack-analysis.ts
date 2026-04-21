import { api, APIError } from "encore.dev/api";
import { db } from "../shared";
import { type StackAnalysis, analyzeStack } from "../analysis/stack-scanner";

// ─── Get Stack Analysis (cached) ───

export const getStackAnalysis = api(
  { method: "GET", path: "/git/connections/:connectionId/stack-analysis", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string; projectId?: string }): Promise<{ stack: StackAnalysis | null; cached: boolean }> => {
    const branch = params.branch || "main";
    const repoKey = `${params.owner}/${params.repo}`;

    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");

    // Check cache
    try {
      const cached = await db.queryRow<{ result: string }>`
        SELECT result FROM stack_cache WHERE repo = ${repoKey} AND branch = ${branch}`;
      if (cached) {
        const parsed = typeof cached.result === "string" ? JSON.parse(cached.result) : cached.result;
        return { stack: parsed as StackAnalysis, cached: true };
      }
    } catch (e: any) { console.error(`[stack-analysis] Cache read error: ${e.message}`); }

    // Run analysis
    console.log(`[stack-analysis] Running for ${repoKey}@${branch}...`);
    const stack = await analyzeStack(conn.provider, conn.personal_token, conn.endpoint || "", params.owner, params.repo, branch);
    if (!stack) {
      console.error(`[stack-analysis] Analysis returned null for ${repoKey}`);
      return { stack: null, cached: false };
    }
    console.log(`[stack-analysis] Got ${stack.components.length} components`);

    // Cache result
    try {
      await db.exec`
        INSERT INTO stack_cache (repo, branch, result, created_at, project_id)
        VALUES (${repoKey}, ${branch}, ${JSON.stringify(stack)}::jsonb, NOW(), ${params.projectId || ""})
        ON CONFLICT (repo, branch) DO UPDATE SET result = ${JSON.stringify(stack)}::jsonb, created_at = NOW(), project_id = ${params.projectId || ""}`;
    } catch (e: any) { console.error(`[stack-analysis] Cache write failed: ${e.message}`); }

    return { stack, cached: false };
  }
);

// ─── Invalidate Stack Cache (called on pull, branch switch, project create) ───

export const invalidateStackCache = api(
  { method: "DELETE", path: "/git/stack-cache", auth: true },
  async (params: { repo: string; branch?: string }): Promise<{ done: boolean }> => {
    if (params.branch) {
      await db.exec`DELETE FROM stack_cache WHERE repo = ${params.repo} AND branch = ${params.branch}`;
    } else {
      await db.exec`DELETE FROM stack_cache WHERE repo = ${params.repo}`;
    }
    return { done: true };
  }
);

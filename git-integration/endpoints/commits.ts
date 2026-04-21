import { api, APIError } from "encore.dev/api";
import { db } from "../shared";
import { throwProviderError } from "../helpers";

// ─── Recent Commits ───

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorAvatar: string;
  date: string;
  url: string;
}

interface RecentCommitsResponse {
  commits: CommitInfo[];
}

export const getRecentCommits = api(
  { expose: true, method: "GET", path: "/git/connections/:connectionId/recent-commits", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string; limit?: number }): Promise<RecentCommitsResponse> => {
    const branch = params.branch || "main";
    const limit = Math.min(params.limit || 5, 20);

    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };

      const res = await fetch(
        `${baseUrl}/repos/${params.owner}/${params.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`,
        { headers },
      );
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = (await res.json()) as any[];

      return {
        commits: data.map((c: any) => ({
          hash: c.sha || "",
          shortHash: c.sha?.substring(0, 7) || "",
          message: c.commit?.message?.split("\n")[0] || "",
          author: c.commit?.author?.name || c.author?.login || "",
          authorAvatar: c.author?.avatar_url || "",
          date: c.commit?.committer?.date || c.commit?.author?.date || "",
          url: c.html_url || "",
        })),
      };
    } else if (conn.provider === "gitlab" || conn.provider === "gitlabSelfHosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const headers: Record<string, string> = { "PRIVATE-TOKEN": conn.personal_token };
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);

      const res = await fetch(
        `${baseUrl}/api/v4/projects/${projectPath}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=${limit}`,
        { headers },
      );
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      const data = (await res.json()) as any[];

      return {
        commits: data.map((c: any) => ({
          hash: c.id || "",
          shortHash: c.short_id || c.id?.substring(0, 7) || "",
          message: c.title || c.message?.split("\n")[0] || "",
          author: c.author_name || "",
          authorAvatar: "",
          date: c.committed_date || c.created_at || "",
          url: c.web_url || "",
        })),
      };
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const headers = { Authorization: `Bearer ${conn.personal_token}` };

      const res = await fetch(
        `${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/commits/${encodeURIComponent(branch)}?pagelen=${limit}`,
        { headers },
      );
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      const data = (await res.json()) as any;
      const values = Array.isArray(data.values) ? data.values : [];

      return {
        commits: values.map((c: any) => ({
          hash: c.hash || "",
          shortHash: c.hash?.substring(0, 7) || "",
          message: c.message?.split("\n")[0] || "",
          author: c.author?.user?.display_name || c.author?.raw?.split("<")[0]?.trim() || "",
          authorAvatar: c.author?.user?.links?.avatar?.href || "",
          date: c.date || "",
          url: c.links?.html?.href || "",
        })),
      };
    }

    throw APIError.unimplemented("Commits not supported for this provider");
  },
);

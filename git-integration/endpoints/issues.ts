import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "../shared";

export const createGitIssue = api(
  { expose: true, method: "POST", path: "/git/connections/:connectionId/issues", auth: true },
  async (params: {
    connectionId: string;
    owner: string;
    repo: string;
    title: string;
    body: string;
    assignee?: string;
  }): Promise<{ issueId: string; issueUrl: string; issueNumber: number }> => {
    const authData = getAuthData()!;
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string; app_id: string;
    }>`SELECT provider, personal_token, endpoint, app_id FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");
    if (conn.app_id !== authData.appId) throw APIError.permissionDenied("Not your connection");

    const token = conn.personal_token;

    if (conn.provider === "github") {
      const res = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: params.title, body: params.body, ...(params.assignee ? { assignees: [params.assignee] } : {}) }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${text}`);
      }
      const data = await res.json() as any;
      return { issueId: String(data.id), issueUrl: data.html_url, issueNumber: data.number };
    }

    if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const base = (conn.endpoint || "https://gitlab.com").replace(/\/+$/, "");
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      const res = await fetch(`${base}/api/v4/projects/${projectPath}/issues`, {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: params.title, description: params.body, ...(params.assignee ? { assignee_ids: [Number(params.assignee)] } : {}) }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitLab API error ${res.status}: ${text}`);
      }
      const data = await res.json() as any;
      return { issueId: String(data.id), issueUrl: data.web_url, issueNumber: data.iid };
    }

    if (conn.provider === "bitbucket") {
      const res = await fetch(`https://api.bitbucket.org/2.0/repositories/${params.owner}/${params.repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: params.title,
          content: { raw: params.body },
          kind: "bug",
          priority: "major",
          ...(params.assignee ? { assignee: { username: params.assignee } } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Bitbucket API error ${res.status}: ${text}`);
      }
      const data = await res.json() as any;
      const issueId = String(data.id);
      const issueUrl = data.links?.html?.href || `https://bitbucket.org/${params.owner}/${params.repo}/issues/${issueId}`;
      return { issueId, issueUrl, issueNumber: data.id };
    }

    throw APIError.invalidArgument(`Unsupported provider: ${conn.provider}`);
  }
);

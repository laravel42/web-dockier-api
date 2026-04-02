import { api, APIError } from "encore.dev/api";
import { db } from "../shared";
import { throwProviderError } from "../helpers";

// ─── Pull from Origin ───

export const pullOrigin = api(
  { method: "POST", path: "/git/connections/:connectionId/pull", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch: string; currentHash?: string }): Promise<{ log: string[] }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    const log: string[] = [];
    const branch = params.branch || "main";
    log.push(`$ git pull origin ${branch}`);
    log.push(`From ${conn.endpoint || "remote"}:${params.owner}/${params.repo}`);

    try {
      if (conn.provider === "github") {
        const baseUrl = conn.endpoint || "https://api.github.com";
        const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };
        const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=10`, { headers });
        if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
        const commits = await res.json() as any[];
        if (commits.length === 0 || (params.currentHash && commits[0].sha === params.currentHash)) {
          log.push("Already up to date.");
        } else {
          log.push(` * branch            ${branch} -> FETCH_HEAD`);
          const latest = commits[0];
          const oldest = commits[commits.length - 1];
          log.push(`Updating ${oldest.sha?.substring(0, 7)}..${latest.sha?.substring(0, 7)}`);
          log.push("Fast-forward");
          for (const c of commits) {
            const date = c.commit?.author?.date ? new Date(c.commit.author.date).toLocaleString() : "";
            log.push(` ${c.sha?.substring(0, 7)} ${c.commit?.message?.split("\n")[0] || ""} (${c.commit?.author?.name || "unknown"}, ${date})`);
          }
          // Fetch changed files from latest commit
          try {
            const detailRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/commits/${latest.sha}`, { headers });
            if (detailRes.ok) {
              const detail = await detailRes.json() as any;
              const files = detail.files || [];
              log.push(`  ${files.length} file${files.length !== 1 ? "s" : ""} changed`);
              for (const f of files.slice(0, 20)) {
                const stat = `+${f.additions || 0} -${f.deletions || 0}`;
                log.push(`    ${f.status?.charAt(0)?.toUpperCase() || "M"}  ${f.filename} (${stat})`);
              }
              if (files.length > 20) log.push(`    ... and ${files.length - 20} more files`);
            }
          } catch {}
        }
      } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
        const baseUrl = conn.endpoint || "https://gitlab.com";
        const headers: Record<string, string> = { "PRIVATE-TOKEN": conn.personal_token };
        const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
        const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=10`, { headers });
        if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
        const commits = await res.json() as any[];
        if (commits.length === 0 || (params.currentHash && commits[0].id === params.currentHash)) {
          log.push("Already up to date.");
        } else {
          log.push(` * branch            ${branch} -> FETCH_HEAD`);
          const latest = commits[0];
          const oldest = commits[commits.length - 1];
          log.push(`Updating ${oldest.short_id || oldest.id?.substring(0, 7)}..${latest.short_id || latest.id?.substring(0, 7)}`);
          log.push("Fast-forward");
          for (const c of commits) {
            const date = c.committed_date ? new Date(c.committed_date).toLocaleString() : "";
            log.push(` ${c.short_id || c.id?.substring(0, 7)} ${c.title || c.message?.split("\n")[0] || ""} (${c.author_name || "unknown"}, ${date})`);
          }
          // Fetch diff stats from latest commit
          try {
            const diffRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/commits/${latest.id}/diff?per_page=50`, { headers });
            if (diffRes.ok) {
              const diffs = await diffRes.json() as any[];
              log.push(`  ${diffs.length} file${diffs.length !== 1 ? "s" : ""} changed`);
              for (const d of diffs.slice(0, 20)) {
                const status = d.new_file ? "A" : d.deleted_file ? "D" : d.renamed_file ? "R" : "M";
                log.push(`    ${status}  ${d.new_path || d.old_path}`);
              }
              if (diffs.length > 20) log.push(`    ... and ${diffs.length - 20} more files`);
            }
          } catch {}
        }
      } else if (conn.provider === "bitbucket") {
        const baseUrl = conn.endpoint || "https://api.bitbucket.org";
        const headers = { Authorization: `Bearer ${conn.personal_token}` };
        const res = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/commits/${encodeURIComponent(branch)}?pagelen=10`, { headers });
        if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
        const data = await res.json() as any;
        const commits = data.values || [];
        if (commits.length === 0 || (params.currentHash && commits[0].hash === params.currentHash)) {
          log.push("Already up to date.");
        } else {
          log.push(` * branch            ${branch} -> FETCH_HEAD`);
          log.push("Fast-forward");
          for (const c of commits) {
            const date = c.date ? new Date(c.date).toLocaleString() : "";
            log.push(` ${c.hash?.substring(0, 7)} ${c.message?.split("\n")[0] || ""} (${c.author?.user?.display_name || "unknown"}, ${date})`);
          }
        }
      } else {
        log.push("Provider not supported for pull.");
      }
    } catch (err: any) {
      log.push(`error: ${err.message || "Unknown error"}`);
    }

    return { log };
  }
);

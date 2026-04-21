import { api, APIError } from "encore.dev/api";
import { db } from "../shared";
import { throwProviderError } from "../helpers";

// ─── Repo Stats / KPIs ───

interface ContributorInfo {
  name: string;
  avatarUrl: string;
  commits: number;
  profileUrl: string;
}

interface RepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
  languages: Record<string, number>;
  lastCommitDate: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastCommitHash: string;
  totalCommits: number;
  contributors: number;
  topContributors: ContributorInfo[];
}

export const getRepoStats = api(
  { expose: true, method: "GET", path: "/git/connections/:connectionId/repo-stats", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string; refresh?: boolean; projectId?: string }): Promise<RepoStats> => {
    const branch = params.branch || "main";
    const repoKey = `${params.owner}/${params.repo}`;

    // Check cache (unless refresh requested)
    if (!params.refresh) {
      try {
        const cached = await db.queryRow<{ result: string }>`
          SELECT result FROM stats_cache WHERE repo = ${repoKey} AND branch = ${branch}`;
        if (cached) {
          const parsed = typeof cached.result === "string" ? JSON.parse(cached.result) : cached.result;
          return parsed as RepoStats;
        }
      } catch { /* fall through */ }
    }

    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    // Helper to cache stats before returning
    const cacheAndReturn = async (stats: RepoStats): Promise<RepoStats> => {
      try {
        await db.exec`
          INSERT INTO stats_cache (repo, branch, result, created_at, project_id)
          VALUES (${repoKey}, ${branch}, ${JSON.stringify(stats)}::jsonb, NOW(), ${params.projectId || ""})
          ON CONFLICT (repo, branch) DO UPDATE SET result = ${JSON.stringify(stats)}::jsonb, created_at = NOW(), project_id = ${params.projectId || ""}`;
      } catch { /* ignore */ }
      return stats;
    };

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };

      // Fetch repo info
      const repoRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}`, { headers });
      if (!repoRes.ok) throwProviderError("GitHub", repoRes.status, repoRes.statusText);
      const repoData = await repoRes.json() as any;

      // Fetch latest commit on branch
      const commitsRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, { headers });
      let lastCommitDate = "";
      let lastCommitMessage = "";
      let lastCommitAuthor = "";
      let lastCommitHash = "";
      let totalCommits = 0;
      if (commitsRes.ok) {
        const commits = await commitsRes.json() as any[];
        if (Array.isArray(commits) && commits.length > 0) {
          lastCommitDate = commits[0].commit?.committer?.date || commits[0].commit?.author?.date || "";
          lastCommitMessage = commits[0].commit?.message?.split("\n")[0] || "";
          lastCommitAuthor = commits[0].commit?.author?.name || commits[0].author?.login || "";
          lastCommitHash = commits[0].sha || "";
        }
        // Parse total from Link header (GitHub pagination)
        const link = commitsRes.headers.get("link") || "";
        const match = link.match(/page=(\d+)>; rel="last"/);
        if (match) {
          totalCommits = parseInt(match[1], 10);
        } else {
          // Fallback: use contributors endpoint to estimate commit count
          try {
            const contribRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/contributors?per_page=1&anon=true`, { headers });
            if (contribRes.ok) {
              const contribLink = contribRes.headers.get("link") || "";
              const contribMatch = contribLink.match(/page=(\d+)>; rel="last"/);
              if (contribMatch) {
                // Sum commits from all contributors is complex; use repo stats API instead
              }
            }
          } catch {}
          // Use the commit count from the repo's default branch participation stats
          try {
            const participationRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/stats/participation`, { headers });
            if (participationRes.ok) {
              const participation = await participationRes.json() as any;
              if (Array.isArray(participation.all)) {
                totalCommits = participation.all.reduce((sum: number, n: number) => sum + n, 0);
              }
            }
          } catch {}
        }
      }

      // Fetch languages breakdown
      let language = repoData.language || "";
      let languages: Record<string, number> = {};
      try {
        const langRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/languages`, { headers });
        if (langRes.ok) {
          const langData = await langRes.json() as Record<string, number>;
          if (langData && typeof langData === "object") {
            const total = Object.values(langData).reduce((s, v) => s + v, 0);
            if (total > 0) {
              languages = Object.fromEntries(
                Object.entries(langData).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10])
              );
            }
            if (!language && Object.keys(langData).length > 0) {
              language = Object.keys(langData)[0];
            }
          }
        }
      } catch {}

      // Fetch contributors from commits on the selected branch
      let contributors = 0;
      let topContributors: ContributorInfo[] = [];
      try {
        // Fetch up to 100 recent commits on the branch and aggregate by author
        const commitsForContrib = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100`, { headers });
        if (commitsForContrib.ok) {
          const commits = await commitsForContrib.json() as any[];
          const authorMap = new Map<string, { name: string; avatarUrl: string; commits: number; profileUrl: string }>();
          for (const c of commits) {
            const login = c.author?.login || c.commit?.author?.name || "Anonymous";
            const existing = authorMap.get(login);
            if (existing) {
              existing.commits++;
            } else {
              authorMap.set(login, {
                name: login,
                avatarUrl: c.author?.avatar_url || "",
                commits: 1,
                profileUrl: c.author?.html_url || "",
              });
            }
          }
          topContributors = Array.from(authorMap.values()).sort((a, b) => b.commits - a.commits).slice(0, 20);
          contributors = authorMap.size;
        }
      } catch {}

      return cacheAndReturn({
        stars: repoData.stargazers_count ?? 0,
        forks: repoData.forks_count ?? 0,
        openIssues: repoData.open_issues_count ?? 0,
        watchers: repoData.subscribers_count ?? 0,
        language,
        languages,
        lastCommitDate,
        lastCommitMessage,
        lastCommitAuthor,
        lastCommitHash,
        totalCommits,
        contributors,
        topContributors,
      });
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const headers: Record<string, string> = { "PRIVATE-TOKEN": conn.personal_token };
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);

      const repoRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}?statistics=true`, { headers });
      if (!repoRes.ok) throwProviderError("GitLab", repoRes.status, repoRes.statusText);
      const repoData = await repoRes.json() as any;

      // Fetch latest commit
      const commitsRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=1`, { headers });
      let lastCommitDate = "";
      let lastCommitMessage = "";
      let lastCommitAuthor = "";
      let lastCommitHash = "";
      let totalCommits = 0;
      if (commitsRes.ok) {
        const commits = await commitsRes.json() as any[];
        if (Array.isArray(commits) && commits.length > 0) {
          lastCommitDate = commits[0].committed_date || commits[0].created_at || "";
          lastCommitMessage = commits[0].title || commits[0].message?.split("\n")[0] || "";
          lastCommitAuthor = commits[0].author_name || "";
          lastCommitHash = commits[0].id || commits[0].short_id || "";
        }
        const total = commitsRes.headers.get("x-total");
        totalCommits = total ? parseInt(total, 10) : 0;
      }

      // GitLab statistics.commit_count is more reliable when available
      if (repoData.statistics?.commit_count) {
        totalCommits = repoData.statistics.commit_count;
      }

      // Fetch languages breakdown
      let language = repoData.predominant_language || "";
      let languages: Record<string, number> = {};
      try {
        const langRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/languages`, { headers });
        if (langRes.ok) {
          const langData = await langRes.json() as Record<string, number>;
          if (langData && typeof langData === "object") {
            // GitLab returns percentages directly (e.g. { "TypeScript": 85.5, "CSS": 14.5 })
            languages = Object.fromEntries(
              Object.entries(langData).map(([k, v]) => [k, Math.round(v * 10) / 10])
            );
            if (!language && Object.keys(langData).length > 0) {
              language = Object.keys(langData)[0];
            }
          }
        }
      } catch {}

      // Fetch contributors from commits on the selected branch
      let contributors = 0;
      let topContributors: ContributorInfo[] = [];
      try {
        const contribRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=100`, { headers });
        if (contribRes.ok) {
          const commits = await contribRes.json() as any[];
          const authorMap = new Map<string, { name: string; avatarUrl: string; commits: number; profileUrl: string }>();
          for (const c of commits) {
            const name = c.author_name || "Anonymous";
            const existing = authorMap.get(name);
            if (existing) {
              existing.commits++;
            } else {
              authorMap.set(name, { name, avatarUrl: "", commits: 1, profileUrl: "" });
            }
          }
          topContributors = Array.from(authorMap.values()).sort((a, b) => b.commits - a.commits).slice(0, 20);
          contributors = authorMap.size;
        }
      } catch {}

      // Enrich GitLab contributors with avatar URLs via members API
      try {
        const membersRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/members/all?per_page=100`, { headers });
        if (membersRes.ok) {
          const members = await membersRes.json() as any[];
          const memberMap = new Map(members.map((m: any) => [m.name, { avatar: m.avatar_url || "", web: m.web_url || "" }]));
          topContributors = topContributors.map((c) => {
            const m = memberMap.get(c.name);
            return m ? { ...c, avatarUrl: m.avatar, profileUrl: m.web } : c;
          });
        }
      } catch {}

      return cacheAndReturn({
        stars: repoData.star_count ?? 0,
        forks: repoData.forks_count ?? 0,
        openIssues: repoData.open_issues_count ?? 0,
        watchers: repoData.star_count ?? 0,
        language,
        languages,
        lastCommitDate,
        lastCommitMessage,
        lastCommitAuthor,
        lastCommitHash,
        totalCommits,
        contributors,
        topContributors,
      });
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const headers = { Authorization: `Bearer ${conn.personal_token}` };

      // Fetch repo info
      const repoRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}`, { headers });
      if (!repoRes.ok) throwProviderError("Bitbucket", repoRes.status, repoRes.statusText);
      const repoData = await repoRes.json() as any;

      // Fetch latest commit on branch
      const commitsRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/commits/${encodeURIComponent(branch)}?pagelen=1`, { headers });
      let lastCommitDate = "";
      let lastCommitMessage = "";
      let lastCommitAuthor = "";
      let lastCommitHash = "";
      let totalCommits = 0;
      if (commitsRes.ok) {
        const commitsData = await commitsRes.json() as any;
        if (Array.isArray(commitsData.values) && commitsData.values.length > 0) {
          lastCommitDate = commitsData.values[0].date || "";
          lastCommitMessage = commitsData.values[0].message?.split("\n")[0] || "";
          lastCommitAuthor = commitsData.values[0].author?.user?.display_name || commitsData.values[0].author?.raw?.split("<")[0]?.trim() || "";
          lastCommitHash = commitsData.values[0].hash || "";
        }
        // Bitbucket doesn't provide total count easily; use size if available
        totalCommits = commitsData.size || 0;
      }

      // Fetch watchers count
      let watchers = 0;
      try {
        const watchersRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/watchers?pagelen=0`, { headers });
        if (watchersRes.ok) {
          const watchersData = await watchersRes.json() as any;
          watchers = watchersData.size || 0;
        }
      } catch {}

      // Fetch open issues count
      let openIssues = 0;
      if (repoData.has_issues) {
        try {
          const issuesRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/issues?status=new&status=open&pagelen=0`, { headers });
          if (issuesRes.ok) {
            const issuesData = await issuesRes.json() as any;
            openIssues = issuesData.size || 0;
          }
        } catch { /* ignore */ }
      }

      return cacheAndReturn({
        stars: 0,
        forks: 0,
        openIssues,
        watchers,
        language: repoData.language || "",
        languages: repoData.language ? { [repoData.language]: 100 } : {},
        lastCommitDate,
        lastCommitMessage,
        lastCommitAuthor,
        lastCommitHash,
        totalCommits,
        contributors: 0,
        topContributors: [],
      });
    }

    throw APIError.unimplemented("Stats not supported for this provider");
  }
);

// ─── Invalidate Stats Cache ───

export const invalidateStatsCache = api(
  { expose: true, method: "DELETE", path: "/git/stats-cache", auth: true },
  async (params: { repo: string; branch?: string }): Promise<{ done: boolean }> => {
    if (params.branch) {
      await db.exec`DELETE FROM stats_cache WHERE repo = ${params.repo} AND branch = ${params.branch}`;
    } else {
      await db.exec`DELETE FROM stats_cache WHERE repo = ${params.repo}`;
    }
    return { done: true };
  }
);

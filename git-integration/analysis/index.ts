import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { db } from "../shared";
import { throwProviderError } from "../helpers";
import { type TechStackItem, detectTechStack } from "./tech-stack";
import { type DeployOption, suggestDeployOptions } from "./deploy-options";
import { type DetectedService, detectServices } from "./services";
import { fetchRepoFile } from "./fetch-file";
import { type AIRepoAnalysis, CONFIG_FILES_TO_FETCH, analyzeWithAI } from "./ai-analysis";

interface RepoAnalysis {
  techStack: TechStackItem[];
  deployOptions: DeployOption[];
  detectedServices: DetectedService[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  aiAnalysis?: AIRepoAnalysis;
}

export const analyzeRepo = api(
  { method: "GET", path: "/git/connections/:connectionId/repo-analyze", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string; aiType?: string; aiApiKey?: string }): Promise<RepoAnalysis> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    const branch = params.branch || "main";
    const repoKey = `${params.owner}/${params.repo}`;

    // ── Fetch latest commit SHA (lightweight, single API call) ──
    let latestSha = "";
    try {
      if (conn.provider === "github") {
        const baseUrl = conn.endpoint || "https://api.github.com";
        const res = await fetch(`${baseUrl}/repos/${repoKey}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, {
          headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" },
        });
        if (res.ok) {
          const commits = await res.json() as any[];
          if (commits.length > 0) latestSha = commits[0].sha || "";
        }
      } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
        const baseUrl = conn.endpoint || "https://gitlab.com";
        const projectPath = encodeURIComponent(repoKey);
        const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=1`, {
          headers: { "PRIVATE-TOKEN": conn.personal_token },
        });
        if (res.ok) {
          const commits = await res.json() as any[];
          if (commits.length > 0) latestSha = commits[0].id || "";
        }
      } else if (conn.provider === "bitbucket") {
        const baseUrl = conn.endpoint || "https://api.bitbucket.org";
        const res = await fetch(`${baseUrl}/2.0/repositories/${repoKey}/commits/${encodeURIComponent(branch)}?pagelen=1`, {
          headers: { Authorization: `Bearer ${conn.personal_token}` },
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.values?.length > 0) latestSha = data.values[0].hash || "";
        }
      }
    } catch {}

    // ── Check cache ──
    if (latestSha) {
      try {
        const cached = await db.queryRow<{ result: string }>`
          SELECT result FROM analysis_cache WHERE repo = ${repoKey} AND branch = ${branch} AND commit_sha = ${latestSha}`;
        if (cached) {
          return JSON.parse(cached.result) as RepoAnalysis;
        }
      } catch {}
    }

    let files: string[] = [];
    let repoSize = 0;
    let primaryLanguage = "";

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };

      // Get repo info for size & language
      const repoRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}`, { headers });
      if (!repoRes.ok) throwProviderError("GitHub", repoRes.status, repoRes.statusText);
      const repoData = await repoRes.json() as any;
      repoSize = repoData.size || 0;
      primaryLanguage = repoData.language || "";

      // Get file tree (recursive)
      const treeRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/trees/${branch}?recursive=1`, { headers });
      if (treeRes.ok) {
        const treeData = await treeRes.json() as any;
        if (Array.isArray(treeData.tree)) {
          files = treeData.tree.filter((f: any) => f.type === "blob").map((f: any) => f.path);
        }
      }
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const headers = { "PRIVATE-TOKEN": conn.personal_token };
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);

      // Get repo info
      const repoRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}`, { headers });
      if (!repoRes.ok) throwProviderError("GitLab", repoRes.status, repoRes.statusText);
      const repoData = await repoRes.json() as any;
      primaryLanguage = repoData.predominant_language || "";

      // Get file tree (recursive, paginated)
      let page = 1;
      const maxPages = 20;
      while (page <= maxPages) {
        const treeRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100&page=${page}`, { headers });
        if (!treeRes.ok) break;
        const treeData = await treeRes.json() as any[];
        if (!Array.isArray(treeData) || treeData.length === 0) break;
        for (const f of treeData) {
          if (f.type === "blob") files.push(f.path);
        }
        const nextPage = treeRes.headers.get("x-next-page");
        if (!nextPage || nextPage === "" || treeData.length < 100) break;
        page++;
      }
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const headers = { Authorization: `Bearer ${conn.personal_token}` };

      const srcRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/src/${branch}/?pagelen=100`, { headers });
      if (srcRes.ok) {
        const srcData = await srcRes.json() as any;
        if (Array.isArray(srcData.values)) {
          files = srcData.values.filter((f: any) => f.type === "commit_file").map((f: any) => f.path);
        }
      }
    }

    const techStack = detectTechStack(files);
    const hasDocker = files.some(f => /Dockerfile/i.test(f));
    const hasCi = files.some(f => /\.github\/workflows\/|\.gitlab-ci\.yml|Jenkinsfile|\.circleci/i.test(f));
    const deployOptions = suggestDeployOptions(techStack, hasDocker, repoSize);
    const detectedServices = detectServices(files);

    const detectedLang = techStack.find(t => t.category === "language" || (t.category === "runtime" && t.confidence > 50));
    const effectivePrimaryLanguage = detectedLang?.name || primaryLanguage;

    // ── AI-powered deep analysis (if AI config provided) ──
    let aiAnalysis: AIRepoAnalysis | undefined;
    if (params.aiType && params.aiApiKey) {
      // Fetch key config files from repo
      const configContents: Record<string, string> = {};
      const filesToFetch = CONFIG_FILES_TO_FETCH.filter(cf =>
        files.some(f => f.toLowerCase().endsWith(cf.toLowerCase()) || f.toLowerCase() === cf.toLowerCase())
      );
      // Also fetch Laravel-specific files if detected
      const laravelFiles = ["config/app.php", "config/database.php", "config/queue.php", "config/cache.php", "config/horizon.php", "config/octane.php"];
      const djangoFiles = ["settings.py", "requirements.txt"];
      const allFetchFiles = [...filesToFetch];
      if (techStack.some(t => t.name === "Laravel")) {
        for (const lf of laravelFiles) {
          if (files.some(f => f === lf) && !allFetchFiles.includes(lf)) allFetchFiles.push(lf);
        }
      }
      if (techStack.some(t => t.name === "Django")) {
        for (const df of djangoFiles) {
          if (files.some(f => f.endsWith(df)) && !allFetchFiles.includes(df)) {
            const match = files.find(f => f.endsWith(df));
            if (match) allFetchFiles.push(match);
          }
        }
      }

      // Fetch up to 10 config files in parallel
      const fetchPromises = allFetchFiles.slice(0, 10).map(async (cf) => {
        const actualPath = files.find(f => f.toLowerCase().endsWith(cf.toLowerCase())) || cf;
        const content = await fetchRepoFile(conn.provider, conn.personal_token, conn.endpoint || "", params.owner, params.repo, branch, actualPath);
        if (content) configContents[actualPath] = content;
      });
      await Promise.all(fetchPromises);

      if (Object.keys(configContents).length > 0) {
        const result = await analyzeWithAI(
          params.aiType,
          { apiKey: params.aiApiKey },
          files,
          configContents,
          techStack,
          detectedServices,
        );
        if (result) aiAnalysis = result;
      }
    }

    const result = {
      techStack,
      deployOptions: aiAnalysis?.deployOptions?.length ? aiAnalysis.deployOptions : deployOptions,
      detectedServices,
      repoSize,
      primaryLanguage: effectivePrimaryLanguage,
      hasDocker,
      hasCi,
      aiAnalysis,
    };

    // ── Write to cache ──
    if (latestSha) {
      const id = uuidv4();
      try {
        await db.exec`
          INSERT INTO analysis_cache (id, repo, branch, commit_sha, result, created_at)
          VALUES (${id}, ${repoKey}, ${branch}, ${latestSha}, ${JSON.stringify(result)}::jsonb, NOW())
          ON CONFLICT (repo, branch) DO UPDATE SET commit_sha = ${latestSha}, result = ${JSON.stringify(result)}::jsonb, created_at = NOW()`;
      } catch {}
    }

    return result;
  }
);

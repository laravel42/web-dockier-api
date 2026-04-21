import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, OpenAIApiKey } from "../shared";
import { throwProviderError } from "../helpers";
import { type TechStackItem, detectTechStack } from "./tech-stack";
import { type DeployOption, suggestDeployOptions } from "./deploy-options";
import { type DetectedService, detectServices } from "./services";
import { fetchRepoFile } from "./fetch-file";
import { type AIRepoAnalysis, CONFIG_FILES_TO_FETCH, analyzeWithAI } from "./ai-analysis";
import { type SensitiveField, scanSensitiveData } from "./sensitive-data-scanner";
import { type Dependency, scanDependencies } from "./dependency-scanner";

function parseResult(raw: unknown): RepoAnalysis {
  if (typeof raw === "string") return JSON.parse(raw);
  return raw as RepoAnalysis;
}

interface RepoAnalysis {
  techStack: TechStackItem[];
  deployOptions: DeployOption[];
  detectedServices: DetectedService[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  aiAnalysis?: AIRepoAnalysis;
  sensitiveData?: SensitiveField[];
  dependencies?: Dependency[];
  _scannersRan?: boolean;
}

export const analyzeRepo = api(
  { method: "GET", path: "/git/connections/:connectionId/repo-analyze", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string; aiType?: string; projectId?: string }): Promise<RepoAnalysis> => {
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
        // Try exact SHA match first
        let cached = await db.queryRow<{ result: string }>`
          SELECT result FROM analysis_cache WHERE repo = ${repoKey} AND branch = ${branch} AND commit_sha = ${latestSha}`;
        // Fallback: any cached result for this repo+branch (different commit)
        if (!cached) {
          cached = await db.queryRow<{ result: string }>`
            SELECT result FROM analysis_cache WHERE repo = ${repoKey} AND branch = ${branch} ORDER BY created_at DESC LIMIT 1`;
        }
        if (cached) {
          const parsed = parseResult(cached.result);
          const ai = parsed.aiAnalysis;
          const aiComplete = !!(ai?.sections);
          const scannersRan = parsed._scannersRan === true;
          console.log(`[analyzeRepo] Cache hit: repo=${repoKey} aiComplete=${aiComplete} scannersRan=${scannersRan}`);
          if (!(params.aiType && OpenAIApiKey() && !aiComplete) && scannersRan) {
            return parsed;
          }
        } else {
          console.log(`[analyzeRepo] Cache miss: repo=${repoKey} branch=${branch}`);
        }
      } catch (e: any) { console.log(`[analyzeRepo] Cache error: ${e.message}`); }
    } else {
      // No commit SHA available (git API unreachable) — try cache without SHA match
      try {
        const cached = await db.queryRow<{ result: string }>`
          SELECT result FROM analysis_cache WHERE repo = ${repoKey} AND branch = ${branch} ORDER BY created_at DESC LIMIT 1`;
        if (cached) {
          const parsed = parseResult(cached.result);
          const ai = parsed.aiAnalysis;
          const aiComplete = !!(ai?.sections);
          const scannersRan = parsed._scannersRan === true;
          if (!(params.aiType && OpenAIApiKey() && !aiComplete) && scannersRan) {
            return parsed;
          }
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

    // ── Fetch config files from repo ──
    const configContents: Record<string, string> = {};
    const schemaFiles: Record<string, string> = {};

    if (conn && files.length > 0) {
      const filesToFetch = CONFIG_FILES_TO_FETCH.filter(cf =>
        files.some(f => f.toLowerCase().endsWith(cf.toLowerCase()) || f.toLowerCase() === cf.toLowerCase())
      );
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

      const fetchPromises = allFetchFiles.slice(0, 10).map(async (cf) => {
        const actualPath = files.find(f => f.toLowerCase().endsWith(cf.toLowerCase())) || cf;
        const content = await fetchRepoFile(conn.provider, conn.personal_token, conn.endpoint || "", params.owner, params.repo, branch, actualPath);
        if (content) configContents[actualPath] = content;
      });
      await Promise.all(fetchPromises);

      // Fetch schema/migration/model files
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
      const matchedSchemaFiles = files.filter(f => schemaPatterns.some(p => p.test(f))).slice(0, 30);
      console.log(`[analyzeRepo] Schema files matched: ${matchedSchemaFiles.length}`, matchedSchemaFiles.slice(0, 10));
      const schemaPromises = matchedSchemaFiles.map(async (sf) => {
        const content = await fetchRepoFile(conn.provider, conn.personal_token, conn.endpoint || "", params.owner, params.repo, branch, sf);
        if (content) schemaFiles[sf] = content;
      });
      await Promise.all(schemaPromises);
    }

    // ── AI-powered deep analysis (if OpenAI key is configured) ──
    let aiAnalysis: AIRepoAnalysis | undefined;
    const hasOpenAI = !!OpenAIApiKey();
    console.log(`[analyzeRepo] aiType=${params.aiType} hasOpenAI=${hasOpenAI}`);
    if (params.aiType && hasOpenAI) {
      if (Object.keys(configContents).length > 0 || files.length > 0) {
        const result = await analyzeWithAI(
          params.aiType,
          {},
          files,
          configContents,
          techStack,
          detectedServices,
        );
        if (result) aiAnalysis = result;
      }
    }

    // ── Scan for sensitive data (code-based, no AI) ──
    const sensitiveData = scanSensitiveData(schemaFiles, configContents);
    console.log(`[analyzeRepo] Sensitive data scan: ${Object.keys(schemaFiles).length} schema files, ${Object.keys(configContents).length} config files => ${sensitiveData.length} findings`);

    // ── Scan dependencies for vulnerabilities ──
    const dependencies = await scanDependencies(configContents);

    const result = {
      techStack,
      deployOptions: aiAnalysis?.deployOptions?.length ? aiAnalysis.deployOptions : deployOptions,
      detectedServices,
      repoSize,
      primaryLanguage: effectivePrimaryLanguage,
      hasDocker,
      hasCi,
      aiAnalysis,
      sensitiveData: sensitiveData.length > 0 ? sensitiveData : undefined,
      dependencies: dependencies.length > 0 ? dependencies : undefined,
      _scannersRan: true,
    };

    // ── Write to cache ──
    if (latestSha) {
      const id = uuidv4();
      const authData = getAuthData();
      const appId = authData?.appId || "";
      try {
        await db.exec`
          INSERT INTO analysis_cache (id, repo, branch, commit_sha, result, created_at, app_id, project_id)
          VALUES (${id}, ${repoKey}, ${branch}, ${latestSha}, ${JSON.stringify(result)}::jsonb, NOW(), ${appId}, ${params.projectId || ""})
          ON CONFLICT (repo, branch) DO UPDATE SET commit_sha = ${latestSha}, result = ${JSON.stringify(result)}::jsonb, created_at = NOW(), project_id = ${params.projectId || ""}`;
        console.log(`[analyzeRepo] Cache written: repo=${repoKey} sha=${latestSha}`);
      } catch (e: any) { console.error(`[analyzeRepo] Cache write failed: ${e.message}`); }
    } else {
      console.log(`[analyzeRepo] Skipped cache write: no latestSha`);
    }

    return result;
  }
);

// ─── Clear Analysis Cache ───

export const clearAnalysisCache = api(
  { method: "DELETE", path: "/git/analysis-cache", auth: true },
  async (params: { repo?: string; branch?: string }): Promise<{ deleted: boolean }> => {
    if (params.repo && params.branch) {
      await db.exec`DELETE FROM analysis_cache WHERE repo = ${params.repo} AND branch = ${params.branch}`;
    } else if (params.repo) {
      await db.exec`DELETE FROM analysis_cache WHERE repo = ${params.repo}`;
    } else {
      await db.exec`DELETE FROM analysis_cache`;
    }
    return { deleted: true };
  }
);

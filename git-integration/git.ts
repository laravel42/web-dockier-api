import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";

const db = new SQLDatabase("gitintegration", { migrations: "./migrations" });

// ─── Bedrock secrets ───
const BedrockApiKey = secret("BedrockApiKey");
const BedrockRegion = secret("BedrockRegion");
const BedrockAccountId = secret("BedrockAccountId");

// ─── Interfaces ───

interface GitRepo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

interface GitConnectionResponse {
  id: string;
  userId: string;
  provider: string;
  label: string;
  repoUrl: string;
  endpoint: string;
  createdAt: string;
}

// ─── Store Personal Token ───

export const addConnection = api(
  { method: "POST", path: "/git/connections", auth: true },
  async (params: {
    provider: "github" | "gitlab" | "gitlab_self_hosted" | "bitbucket";
    personalToken: string;
    label: string;
    repoUrl: string;
    endpoint: string;
  }): Promise<GitConnectionResponse> => {
    const authData = getAuthData()!;
    const id = uuidv4();

    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM git_connections WHERE user_id = ${authData.userID} AND provider = ${params.provider} AND label = ${params.label}`;
    if (existing) throw APIError.alreadyExists(`A ${params.provider} connection with label "${params.label}" already exists`);

    await db.exec`
      INSERT INTO git_connections (id, user_id, provider, personal_token, label, repo_url, endpoint, created_at)
      VALUES (${id}, ${authData.userID}, ${params.provider}, ${params.personalToken}, ${params.label}, ${params.repoUrl}, ${params.endpoint || ""}, NOW())`;

    return {
      id, userId: authData.userID, provider: params.provider,
      label: params.label, repoUrl: params.repoUrl, endpoint: params.endpoint || "", createdAt: new Date().toISOString(),
    };
  }
);

// ─── List Connections ───

export const listConnections = api(
  { method: "GET", path: "/git/connections", auth: true },
  async (): Promise<{ connections: GitConnectionResponse[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{
      id: string; user_id: string; provider: string; label: string; repo_url: string; endpoint: string; created_at: Date;
    }>`SELECT id, user_id, provider, label, repo_url, endpoint, created_at
       FROM git_connections WHERE user_id = ${authData.userID} ORDER BY created_at DESC`;

    const connections: GitConnectionResponse[] = [];
    for await (const row of rows) {
      connections.push({
        id: row.id, userId: row.user_id, provider: row.provider,
        label: row.label, repoUrl: row.repo_url, endpoint: row.endpoint, createdAt: row.created_at.toISOString(),
      });
    }
    return { connections };
  }
);

// ─── Delete Connection ───

export const deleteConnection = api(
  { method: "DELETE", path: "/git/connections/:connectionId", auth: true },
  async (params: { connectionId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM git_connections WHERE id = ${params.connectionId}`;
    return { success: true };
  }
);

export const updateConnection = api(
  { method: "PUT", path: "/git/connections/:connectionId", auth: true },
  async (params: { connectionId: string; label: string }): Promise<GitConnectionResponse> => {
    const row = await db.queryRow<{
      id: string; user_id: string; provider: string; label: string; repo_url: string; endpoint: string; created_at: Date;
    }>`SELECT id, user_id, provider, label, repo_url, endpoint, created_at FROM git_connections WHERE id = ${params.connectionId}`;
    if (!row) throw APIError.notFound("Connection not found");

    await db.exec`UPDATE git_connections SET label = ${params.label} WHERE id = ${params.connectionId}`;

    return {
      id: row.id, userId: row.user_id, provider: row.provider,
      label: params.label, repoUrl: row.repo_url, endpoint: row.endpoint, createdAt: row.created_at.toISOString(),
    };
  }
);

// ─── Helper: map provider HTTP errors to proper APIError ───

function throwProviderError(provider: string, status: number, statusText: string): never {
  const msg = `${provider} API error: ${status} ${statusText}`;
  if (status === 401) throw APIError.unauthenticated(`${provider} token is invalid or expired. Please update your connection.`);
  if (status === 403) throw APIError.permissionDenied(`${provider} token lacks required permissions. ${statusText}`);
  if (status === 404) throw APIError.notFound(`${provider} resource not found. ${statusText}`);
  throw APIError.internal(msg);
}

// ─── List Repos from Provider ───

export const listRepos = api(
  { method: "GET", path: "/git/connections/:connectionId/repos", auth: true },
  async (params: { connectionId: string }): Promise<{ repos: GitRepo[] }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    const repos: GitRepo[] = [];

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/user/repos?per_page=100&sort=updated`, {
        headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitHub");
      for (const r of data) {
        repos.push({ name: r.name, fullName: r.full_name, url: r.html_url, defaultBranch: r.default_branch, private: r.private });
      }
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const res = await fetch(`${baseUrl}/api/v4/projects?membership=true&per_page=100&order_by=updated_at`, {
        headers: { "PRIVATE-TOKEN": conn.personal_token },
      });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitLab");
      for (const r of data) {
        repos.push({ name: r.name, fullName: r.path_with_namespace, url: r.web_url, defaultBranch: r.default_branch || "main", private: r.visibility === "private" });
      }
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories?role=member&pagelen=100`, {
        headers: { Authorization: `Bearer ${conn.personal_token}` },
      });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      const data = (await res.json()) as { values?: Array<any> };
      for (const r of data.values || []) {
        repos.push({ name: r.name, fullName: r.full_name, url: r.links.html.href, defaultBranch: r.mainbranch?.name || "main", private: r.is_private });
      }
    }

    return { repos };
  }
);

// ─── Get Branches ───

export const listBranches = api(
  { method: "GET", path: "/git/connections/:connectionId/repo-branches", auth: true },
  async (params: { connectionId: string; owner: string; repo: string }): Promise<{ branches: string[] }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    const branches: string[] = [];

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/branches`, {
        headers: { Authorization: `Bearer ${conn.personal_token}` },
      });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitHub");
      for (const b of data) branches.push(b.name);
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/branches`, {
        headers: { "PRIVATE-TOKEN": conn.personal_token },
      });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitLab");
      for (const b of data) branches.push(b.name);
    }

    return { branches };
  }
);

// ─── Helper: parse owner/repo from URL ───

function parseRepoUrl(url: string): { baseUrl: string; owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return null;
    return { baseUrl: `${u.protocol}//${u.host}`, owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

// ─── Get Branches for a connection (auto from stored repo_url) ───

export const getConnectionBranches = api(
  { method: "GET", path: "/git/connections/:connectionId/branches", auth: true },
  async (params: { connectionId: string }): Promise<{ branches: string[] }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; repo_url: string; endpoint: string;
    }>`SELECT provider, personal_token, repo_url, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");
    if (!conn.repo_url) throw APIError.failedPrecondition("No repo URL configured");

    const parsed = parseRepoUrl(conn.repo_url);
    if (!parsed) throw APIError.invalidArgument("Could not parse owner/repo from URL");

    const branches: string[] = [];

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${parsed.owner}/${parsed.repo}/branches?per_page=100`, {
        headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitHub");
      for (const b of data) branches.push(b.name);
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const gitlabBase = conn.endpoint || (conn.provider === "gitlab_self_hosted" ? parsed.baseUrl : "https://gitlab.com");
      const projectPath = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
      const res = await fetch(`${gitlabBase}/api/v4/projects/${projectPath}/repository/branches?per_page=100`, {
        headers: { "PRIVATE-TOKEN": conn.personal_token },
      });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      const data = await res.json();
      if (!Array.isArray(data)) throw APIError.internal("Unexpected response from GitLab");
      for (const b of data) branches.push(b.name);
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories/${parsed.owner}/${parsed.repo}/refs/branches?pagelen=100`, {
        headers: { Authorization: `Bearer ${conn.personal_token}` },
      });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      const data = (await res.json()) as { values?: Array<{ name: string }> };
      for (const b of data.values || []) branches.push(b.name);
    }

    return { branches };
  }
);

// ─── Pull from Origin ───

export const pullOrigin = api(
  { method: "POST", path: "/git/connections/:connectionId/pull", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch: string }): Promise<{ log: string[] }> => {
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
        if (commits.length === 0) {
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
        if (commits.length === 0) {
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
        if (commits.length === 0) {
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

// ─── Helper: call AI to generate fix ───

async function generateAIFix(aiType: string, aiConfig: Record<string, string>, filePath: string, fileContent: string, finding: { ruleId: string; severity: string; message: string; snippet: string; startLine: number; endLine: number }): Promise<string> {
  const prompt = `You are a senior security engineer. Fix the following security vulnerability in the code.

**File:** \`${filePath}\`
**Rule:** \`${finding.ruleId}\`
**Severity:** ${finding.severity}
**Issue:** ${finding.message}
**Lines:** ${finding.startLine}–${finding.endLine}

**Vulnerable code snippet:**
\`\`\`
${finding.snippet}
\`\`\`

**Full file content:**
\`\`\`
${fileContent}
\`\`\`

Instructions:
1. Fix ONLY the security vulnerability described above.
2. Keep all existing functionality, imports, and code structure intact.
3. Return the COMPLETE fixed file content — every line, not just the changed part.
4. Do NOT include markdown fences, explanations, or commentary — output raw file content only.`;

  // Amazon Bedrock — Bearer auth with API key from Encore secret
  const apiKey = BedrockApiKey();
  if (!apiKey) throw new Error("BedrockApiKey secret is not configured");
  const region = BedrockRegion() || "us-east-1";
  const modelId = aiConfig.model || "us.anthropic.claude-sonnet-4-20250514-v1:0";
  const accountId = BedrockAccountId() || "";
  const modelArn = modelId.startsWith("arn:") ? modelId : `arn:aws:bedrock:${region}:${accountId}:inference-profile/${modelId}`;
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelArn)}/converse`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { temperature: 0.2, maxTokens: 32000 },
    }),
  });
  if (!res.ok) {
    const errBody: any = await res.json().catch(() => ({}));
    throw new Error(`Bedrock ${res.status}: ${errBody.message || errBody.Message || res.statusText}`);
  }
  const data: any = await res.json();
  const raw = data.output?.message?.content?.[0]?.text?.trim() || "";
  return raw.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
}

// ─── Create PR/MR with AI Fix ───

export const createFixMR = api(
  { method: "POST", path: "/git/connections/:connectionId/create-mr", auth: true },
  async (params: {
    connectionId: string;
    owner: string;
    repo: string;
    branch: string;
    filePath: string;
    startLine: number;
    endLine: number;
    ruleId: string;
    severity: string;
    message: string;
    snippet: string;
    aiType?: string;
    aiConfig?: Record<string, string>;
  }): Promise<{ mrUrl: string; mrId: string; mrTitle: string }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    const fixBranch = `fix/${params.ruleId.replace(/[^a-zA-Z0-9._-]/g, "-")}-${Date.now()}`;
    const title = `Fix: [${params.severity.toUpperCase()}] ${params.message.substring(0, 80)}`;
    const hasAI = !!params.aiType;

    const bodyParts = [
      `## Security Fix`,
      ``,
      `**Rule:** \`${params.ruleId}\``,
      `**Severity:** ${params.severity}`,
      `**File:** \`${params.filePath}\` (L${params.startLine}–L${params.endLine})`,
      ``,
      `**Finding:** ${params.message}`,
      ``,
      params.snippet ? `\`\`\`\n${params.snippet}\n\`\`\`` : "",
      ``,
      `---`,
      hasAI ? `*Fix generated by AI (${params.aiType}) from security scan*` : `*Created automatically from security scan*`,
    ];
    const body = bodyParts.filter(Boolean).join("\n");

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" };

      // Get the SHA of the source branch
      const refRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/ref/heads/${encodeURIComponent(params.branch)}`, { headers });
      if (!refRes.ok) throw APIError.internal("Could not get branch ref");
      const refData = await refRes.json() as any;
      const sha = refData.object?.sha;

      // Create the fix branch
      const createRefRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/refs`, {
        method: "POST", headers,
        body: JSON.stringify({ ref: `refs/heads/${fixBranch}`, sha }),
      });
      if (!createRefRes.ok) {
        const err = await createRefRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create branch: ${err.message || createRefRes.statusText}`);
      }

      // If AI is available, fetch file, generate fix, and commit
      if (hasAI) {
        // Get file content
        const fileRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/contents/${encodeURIComponent(params.filePath)}?ref=${encodeURIComponent(fixBranch)}`, { headers });
        if (fileRes.ok) {
          const fileData = await fileRes.json() as any;
          const originalContent = Buffer.from(fileData.content || "", "base64").toString("utf-8");
          const fixedContent = await generateAIFix(params.aiType!, params.aiConfig!, params.filePath, originalContent, params);
          if (fixedContent && fixedContent !== originalContent) {
            // Commit the fix
            await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/contents/${encodeURIComponent(params.filePath)}`, {
              method: "PUT", headers,
              body: JSON.stringify({
                message: `fix: ${params.ruleId} — ${params.message.substring(0, 60)}`,
                content: Buffer.from(fixedContent).toString("base64"),
                sha: fileData.sha,
                branch: fixBranch,
              }),
            });
          }
        }
      }

      // Create the PR
      const prRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/pulls`, {
        method: "POST", headers,
        body: JSON.stringify({ title, body, head: fixBranch, base: params.branch }),
      });
      if (!prRes.ok) {
        const err = await prRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create PR: ${err.message || prRes.statusText}`);
      }
      const pr = await prRes.json() as any;
      return { mrUrl: pr.html_url || "", mrId: String(pr.number || pr.id), mrTitle: title };

    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const headers: Record<string, string> = { "PRIVATE-TOKEN": conn.personal_token, "Content-Type": "application/json" };
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);

      // Verify project exists first
      const projectCheck = await fetch(`${baseUrl}/api/v4/projects/${projectPath}`, { headers });
      if (!projectCheck.ok) {
        // Try URL-encoding with just the repo name (no owner) in case it's a flat namespace
        const altPath = encodeURIComponent(params.repo);
        const altCheck = await fetch(`${baseUrl}/api/v4/projects/${altPath}`, { headers });
        if (!altCheck.ok) {
          throw APIError.notFound(`GitLab project not found: ${params.owner}/${params.repo} (tried both encoded paths). Check the repository URL and token permissions.`);
        }
      }

      // Create the fix branch
      const branchRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/branches`, {
        method: "POST", headers,
        body: JSON.stringify({ branch: fixBranch, ref: params.branch }),
      });
      if (!branchRes.ok) {
        const err = await branchRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create branch: ${err.message || err.error || branchRes.statusText}`);
      }

      // If AI is available, fetch file, generate fix, and commit
      if (hasAI) {
        const fileRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${encodeURIComponent(params.filePath)}?ref=${encodeURIComponent(fixBranch)}`, { headers });
        if (fileRes.ok) {
          const fileData = await fileRes.json() as any;
          const originalContent = Buffer.from(fileData.content || "", "base64").toString("utf-8");
          const fixedContent = await generateAIFix(params.aiType!, params.aiConfig!, params.filePath, originalContent, params);
          if (fixedContent && fixedContent !== originalContent) {
            await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${encodeURIComponent(params.filePath)}`, {
              method: "PUT", headers,
              body: JSON.stringify({
                branch: fixBranch,
                commit_message: `fix: ${params.ruleId} — ${params.message.substring(0, 60)}`,
                content: fixedContent,
                encoding: "text",
              }),
            });
          }
        }
      }

      // Create the MR
      const mrRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/merge_requests`, {
        method: "POST", headers,
        body: JSON.stringify({ source_branch: fixBranch, target_branch: params.branch, title, description: body }),
      });
      if (!mrRes.ok) {
        const err = await mrRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create MR: ${err.message || err.error || mrRes.statusText}`);
      }
      const mr = await mrRes.json() as any;
      return { mrUrl: mr.web_url || "", mrId: String(mr.iid || mr.id), mrTitle: title };

    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, "Content-Type": "application/json" };

      // Create the fix branch
      const branchRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/refs/branches`, {
        method: "POST", headers,
        body: JSON.stringify({ name: fixBranch, target: { hash: params.branch } }),
      });
      if (!branchRes.ok) {
        const err = await branchRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create branch: ${err.error?.message || branchRes.statusText}`);
      }

      // Create the PR
      const prRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/pullrequests`, {
        method: "POST", headers,
        body: JSON.stringify({
          title, description: body,
          source: { branch: { name: fixBranch } },
          destination: { branch: { name: params.branch } },
        }),
      });
      if (!prRes.ok) {
        const err = await prRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create PR: ${err.error?.message || prRes.statusText}`);
      }
      const pr = await prRes.json() as any;
      return { mrUrl: pr.links?.html?.href || "", mrId: String(pr.id), mrTitle: title };
    }

    throw APIError.unimplemented("PR/MR creation not supported for this provider");
  }
);

// ─── Bedrock Model Listing ───

export const listBedrockModels = api(
  { method: "GET", path: "/git/bedrock/models", auth: true },
  async (): Promise<{ models: Array<{ id: string; name: string }> }> => {
    const apiKey = BedrockApiKey();
    if (!apiKey) throw APIError.failedPrecondition("BedrockApiKey secret is not configured");
    const region = BedrockRegion() || "us-east-1";
    const accountId = BedrockAccountId() || "";

    // List inference profiles — these are what you actually invoke
    const profilesRes = await fetch(`https://bedrock.${region}.amazonaws.com/inference-profiles`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (profilesRes.ok) {
      const profilesData: any = await profilesRes.json();
      const profiles = (profilesData.inferenceProfileSummaries || [])
        .filter((p: any) => p.type === "SYSTEM_DEFINED" && p.status === "ACTIVE")
        .map((p: any) => ({
          id: p.inferenceProfileId || p.inferenceProfileArn,
          name: p.inferenceProfileName || p.inferenceProfileId,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      if (profiles.length > 0) return { models: profiles };
    }

    // Fallback: list foundation models and build ARNs
    const res = await fetch(`https://bedrock.${region}.amazonaws.com/foundation-models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw APIError.internal(err?.message || err?.Message || `Bedrock API error: ${res.status}`);
    }
    const data: any = await res.json();
    const models = (data.modelSummaries || [])
      .filter((m: any) => m.inferenceTypesSupported?.includes("ON_DEMAND") && m.outputModalities?.includes("TEXT"))
      .map((m: any) => ({
        id: m.modelId,
        name: `${m.providerName} — ${m.modelName}`,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return { models };
  }
);

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
  { method: "GET", path: "/git/connections/:connectionId/repo-stats", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string }): Promise<RepoStats> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    const branch = params.branch || "main";

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
                Object.entries(langData).map(([k, v]) => [k, Math.round((v / total) * 100)])
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

      return {
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
      };
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
              Object.entries(langData).map(([k, v]) => [k, Math.round(v)])
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

      return {
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
      };
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

      return {
        stars: 0, // Bitbucket doesn't have stars
        forks: 0, // Would need separate API call to /forks
        openIssues: repoData.has_issues ? 0 : 0, // Bitbucket issues need separate query
        watchers,
        language: repoData.language || "",
        languages: repoData.language ? { [repoData.language]: 100 } : {},
        lastCommitDate,
        lastCommitMessage,
        lastCommitAuthor,
        lastCommitHash,
        totalCommits,
        contributors: 0, // Bitbucket doesn't expose contributor count easily
        topContributors: [],
      };
    }

    throw APIError.unimplemented("Stats not supported for this provider");
  }
);

// ─── Repo File Tree ───

interface RepoFile {
  path: string;
  type: "file" | "dir";
  size: number;
}

export const getRepoTree = api(
  { method: "GET", path: "/git/connections/:connectionId/repo-tree", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch?: string }): Promise<{ files: RepoFile[] }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");

    const branch = params.branch || "main";
    const files: RepoFile[] = [];

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json" };
      const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      const data = await res.json() as any;
      for (const item of data.tree || []) {
        if (item.type === "blob") files.push({ path: item.path, type: "file", size: item.size || 0 });
      }
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const headers: Record<string, string> = { "PRIVATE-TOKEN": conn.personal_token };
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      // Paginate through all pages (GitLab defaults to 20 per page, max 100)
      let page = 1;
      const maxPages = 20; // safety cap: 20 pages × 100 = 2000 files
      while (page <= maxPages) {
        const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/tree?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100&page=${page}`, { headers });
        if (!res.ok) {
          if (page === 1) throwProviderError("GitLab", res.status, res.statusText);
          break; // stop paginating on error for subsequent pages
        }
        const data = await res.json() as any[];
        if (!Array.isArray(data) || data.length === 0) break;
        for (const item of data) {
          if (item.type === "blob") files.push({ path: item.path, type: "file", size: 0 });
        }
        // Check x-next-page header or if we got fewer than per_page
        const nextPage = res.headers.get("x-next-page");
        if (!nextPage || nextPage === "" || data.length < 100) break;
        page++;
      }
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const headers = { Authorization: `Bearer ${conn.personal_token}` };
      const res = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/src/${encodeURIComponent(branch)}/?pagelen=100&max_depth=10`, { headers });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      const data = await res.json() as any;
      for (const item of data.values || []) {
        if (item.type === "commit_file") files.push({ path: item.path, type: "file", size: item.size || 0 });
      }
    }

    return { files };
  }
);

// ─── Repo File Content ───

export const getFileContent = api(
  { method: "GET", path: "/git/connections/:connectionId/file-content", auth: true },
  async (params: { connectionId: string; owner: string; repo: string; branch: string; path: string }): Promise<{ content: string }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;
    if (!conn) throw APIError.notFound("Connection not found");

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/contents/${params.path}?ref=${encodeURIComponent(params.branch)}`, {
        headers: { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3.raw" },
      });
      if (!res.ok) throwProviderError("GitHub", res.status, res.statusText);
      return { content: await res.text() };
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);
      const filePath = encodeURIComponent(params.path);
      const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${encodeURIComponent(params.branch)}`, {
        headers: { "PRIVATE-TOKEN": conn.personal_token },
      });
      if (!res.ok) throwProviderError("GitLab", res.status, res.statusText);
      return { content: await res.text() };
    } else if (conn.provider === "bitbucket") {
      const baseUrl = conn.endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/src/${encodeURIComponent(params.branch)}/${params.path}`, {
        headers: { Authorization: `Bearer ${conn.personal_token}` },
      });
      if (!res.ok) throwProviderError("Bitbucket", res.status, res.statusText);
      return { content: await res.text() };
    }

    throw APIError.unimplemented("File content not supported for this provider");
  }
);

// ─── Repo Analysis & Deployment Suggestions ───

interface TechStackItem {
  name: string;
  category: "language" | "framework" | "runtime" | "database" | "tool" | "infra";
  confidence: number; // 0-100
}

interface DeployOption {
  provider: string;
  type: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedMonthlyCost: string;
  bestFor: string;
}

interface DetectedService {
  type: "database" | "cache" | "queue" | "storage" | "search" | "mail" | "broadcasting" | "scheduler";
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
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
}

interface AIRepoAnalysis {
  runtime: string;
  runtimeVersion: string;
  framework: string;
  frameworkVersion: string;
  phpExtensions?: string[];
  nodeVersion?: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  needsScheduler: boolean;
  needsQueueWorker: boolean;
  needsWebsockets: boolean;
  envVars: string[];
  postDeployCommands: string[];
  nginxConfig: "php-fpm" | "reverse-proxy" | "static";
  summary: string;
  deployOptions?: Array<{
    provider: string;
    type: string;
    description: string;
    pros: string[];
    cons: string[];
    estimatedMonthlyCost: string;
    bestFor: string;
  }>;
}

// File-pattern → tech stack detection rules
const TECH_DETECTORS: Array<{ pattern: RegExp; tech: Omit<TechStackItem, "confidence"> & { confidence?: number } }> = [
  // Languages
  { pattern: /package\.json$/i, tech: { name: "Node.js", category: "runtime" } },
  { pattern: /tsconfig\.json$/i, tech: { name: "TypeScript", category: "language" } },
  { pattern: /requirements\.txt$/i, tech: { name: "Python", category: "language" } },
  { pattern: /Pipfile$/i, tech: { name: "Python", category: "language" } },
  { pattern: /pyproject\.toml$/i, tech: { name: "Python", category: "language" } },
  { pattern: /go\.mod$/i, tech: { name: "Go", category: "language" } },
  { pattern: /Cargo\.toml$/i, tech: { name: "Rust", category: "language" } },
  { pattern: /Gemfile$/i, tech: { name: "Ruby", category: "language" } },
  { pattern: /pom\.xml$/i, tech: { name: "Java", category: "language" } },
  { pattern: /build\.gradle/i, tech: { name: "Java", category: "language" } },
  { pattern: /\.csproj$/i, tech: { name: "C#/.NET", category: "language" } },
  { pattern: /composer\.json$/i, tech: { name: "PHP", category: "language" } },
  { pattern: /\.php$/i, tech: { name: "PHP", category: "language", confidence: 80 } },
  { pattern: /mix\.exs$/i, tech: { name: "Elixir", category: "language" } },
  // PHP Frameworks
  { pattern: /artisan$/i, tech: { name: "Laravel", category: "framework" } },
  { pattern: /app\/Http\/Kernel\.php$/i, tech: { name: "Laravel", category: "framework" } },
  { pattern: /routes\/web\.php$/i, tech: { name: "Laravel", category: "framework", confidence: 95 } },
  { pattern: /config\/app\.php$/i, tech: { name: "Laravel", category: "framework", confidence: 85 } },
  { pattern: /config\/twill\.php$/i, tech: { name: "Twill CMS", category: "framework" } },
  { pattern: /config\/twill-navigation\.php$/i, tech: { name: "Twill CMS", category: "framework" } },
  { pattern: /app\/Twill\//i, tech: { name: "Twill CMS", category: "framework", confidence: 95 } },
  { pattern: /symfony\.lock$/i, tech: { name: "Symfony", category: "framework" } },
  { pattern: /config\/bundles\.php$/i, tech: { name: "Symfony", category: "framework", confidence: 85 } },
  { pattern: /wp-config\.php$/i, tech: { name: "WordPress", category: "framework" } },
  { pattern: /wp-content\//i, tech: { name: "WordPress", category: "framework", confidence: 90 } },
  { pattern: /craft\/config\//i, tech: { name: "Craft CMS", category: "framework" } },
  { pattern: /config\/statamic\//i, tech: { name: "Statamic", category: "framework" } },
  { pattern: /config\/filament\.php$/i, tech: { name: "Filament", category: "framework" } },
  { pattern: /app\/Filament\//i, tech: { name: "Filament", category: "framework", confidence: 95 } },
  { pattern: /config\/livewire\.php$/i, tech: { name: "Livewire", category: "framework" } },
  { pattern: /resources\/views\/livewire\//i, tech: { name: "Livewire", category: "framework", confidence: 90 } },
  { pattern: /config\/inertia\.php$/i, tech: { name: "Inertia.js", category: "framework" } },
  // Laravel ecosystem packages
  { pattern: /config\/horizon\.php$/i, tech: { name: "Laravel Horizon", category: "tool" } },
  { pattern: /config\/octane\.php$/i, tech: { name: "Laravel Octane", category: "framework" } },
  { pattern: /config\/reverb\.php$/i, tech: { name: "Laravel Reverb", category: "framework" } },
  { pattern: /config\/telescope\.php$/i, tech: { name: "Laravel Telescope", category: "tool" } },
  { pattern: /config\/sanctum\.php$/i, tech: { name: "Laravel Sanctum", category: "tool" } },
  { pattern: /config\/passport\.php$/i, tech: { name: "Laravel Passport", category: "tool" } },
  { pattern: /config\/jetstream\.php$/i, tech: { name: "Jetstream", category: "framework" } },
  { pattern: /config\/breeze\.php$/i, tech: { name: "Breeze", category: "framework", confidence: 80 } },
  { pattern: /docker-compose\.yml$/i, tech: { name: "Docker Compose", category: "infra" } },
  { pattern: /docker-compose\.sail\.yml$/i, tech: { name: "Laravel Sail", category: "tool" } },
  { pattern: /config\/scout\.php$/i, tech: { name: "Laravel Scout", category: "tool" } },
  { pattern: /config\/broadcasting\.php$/i, tech: { name: "Broadcasting", category: "tool", confidence: 70 } },
  { pattern: /supervisor\.conf$/i, tech: { name: "Supervisor", category: "infra" } },
  { pattern: /supervisord\.conf$/i, tech: { name: "Supervisor", category: "infra" } },
  // JS/TS Frameworks
  { pattern: /next\.config\./i, tech: { name: "Next.js", category: "framework" } },
  { pattern: /nuxt\.config\./i, tech: { name: "Nuxt", category: "framework" } },
  { pattern: /vite\.config\./i, tech: { name: "Vite", category: "tool" } },
  { pattern: /angular\.json$/i, tech: { name: "Angular", category: "framework" } },
  { pattern: /svelte\.config\./i, tech: { name: "SvelteKit", category: "framework" } },
  { pattern: /remix\.config\./i, tech: { name: "Remix", category: "framework" } },
  { pattern: /astro\.config\./i, tech: { name: "Astro", category: "framework" } },
  // Python Frameworks
  { pattern: /manage\.py$/i, tech: { name: "Django", category: "framework" } },
  { pattern: /app\.py$/i, tech: { name: "Flask", category: "framework", confidence: 60 } },
  { pattern: /fastapi/i, tech: { name: "FastAPI", category: "framework", confidence: 60 } },
  // Ruby
  { pattern: /config\/routes\.rb$/i, tech: { name: "Rails", category: "framework" } },
  // Encore
  { pattern: /encore\.app$/i, tech: { name: "Encore.ts", category: "framework" } },
  // Databases
  { pattern: /prisma\/schema\.prisma$/i, tech: { name: "Prisma (PostgreSQL)", category: "database" } },
  { pattern: /drizzle\.config\./i, tech: { name: "Drizzle ORM", category: "database" } },
  { pattern: /\.sql$/i, tech: { name: "SQL Database", category: "database", confidence: 60 } },
  { pattern: /mongod/i, tech: { name: "MongoDB", category: "database", confidence: 50 } },
  { pattern: /redis/i, tech: { name: "Redis", category: "database", confidence: 50 } },
  // Infra / Tools
  { pattern: /Dockerfile$/i, tech: { name: "Docker", category: "infra" } },
  { pattern: /docker-compose/i, tech: { name: "Docker Compose", category: "infra" } },
  { pattern: /\.github\/workflows\//i, tech: { name: "GitHub Actions", category: "tool" } },
  { pattern: /\.gitlab-ci\.yml$/i, tech: { name: "GitLab CI", category: "tool" } },
  { pattern: /Jenkinsfile$/i, tech: { name: "Jenkins", category: "tool" } },
  { pattern: /terraform\//i, tech: { name: "Terraform", category: "infra" } },
  { pattern: /serverless\.yml$/i, tech: { name: "Serverless Framework", category: "infra" } },
  { pattern: /vercel\.json$/i, tech: { name: "Vercel", category: "infra" } },
  { pattern: /netlify\.toml$/i, tech: { name: "Netlify", category: "infra" } },
  { pattern: /fly\.toml$/i, tech: { name: "Fly.io", category: "infra" } },
  { pattern: /render\.yaml$/i, tech: { name: "Render", category: "infra" } },
  { pattern: /kubernetes|k8s/i, tech: { name: "Kubernetes", category: "infra" } },
  // PHP tools
  { pattern: /phpunit\.xml/i, tech: { name: "PHPUnit", category: "tool", confidence: 70 } },
  { pattern: /phpstan\.neon/i, tech: { name: "PHPStan", category: "tool", confidence: 70 } },
  { pattern: /\.env\.example$/i, tech: { name: "Env Config", category: "tool", confidence: 40 } },
  { pattern: /nginx\.conf/i, tech: { name: "Nginx", category: "infra", confidence: 70 } },
  { pattern: /\.htaccess$/i, tech: { name: "Apache", category: "infra", confidence: 70 } },
  // Additional PHP ecosystem
  { pattern: /config\/cashier\.php$/i, tech: { name: "Laravel Cashier", category: "tool" } },
  { pattern: /config\/nova\.php$/i, tech: { name: "Laravel Nova", category: "framework" } },
  { pattern: /config\/pulse\.php$/i, tech: { name: "Laravel Pulse", category: "tool" } },
  { pattern: /config\/pennant\.php$/i, tech: { name: "Laravel Pennant", category: "tool" } },
  { pattern: /config\/socialite\.php$/i, tech: { name: "Laravel Socialite", category: "tool" } },
  { pattern: /phpstan\.neon\.dist$/i, tech: { name: "PHPStan", category: "tool", confidence: 70 } },
  { pattern: /pint\.json$/i, tech: { name: "Laravel Pint", category: "tool", confidence: 60 } },
  { pattern: /rector\.php$/i, tech: { name: "Rector", category: "tool", confidence: 60 } },
  // Additional JS ecosystem
  { pattern: /tailwind\.config\./i, tech: { name: "Tailwind CSS", category: "tool" } },
  { pattern: /postcss\.config\./i, tech: { name: "PostCSS", category: "tool", confidence: 50 } },
  { pattern: /webpack\.config\./i, tech: { name: "Webpack", category: "tool" } },
  { pattern: /turbo\.json$/i, tech: { name: "Turborepo", category: "tool" } },
  { pattern: /pnpm-workspace\.yaml$/i, tech: { name: "pnpm", category: "tool", confidence: 60 } },
  { pattern: /\.nvmrc$/i, tech: { name: "nvm", category: "tool", confidence: 40 } },
  // Go ecosystem
  { pattern: /cmd\/.*\/main\.go$/i, tech: { name: "Go CLI", category: "tool", confidence: 60 } },
  { pattern: /internal\//i, tech: { name: "Go Modules", category: "tool", confidence: 40 } },
  // Rust ecosystem
  { pattern: /Rocket\.toml$/i, tech: { name: "Rocket", category: "framework" } },
  { pattern: /shuttle\.toml$/i, tech: { name: "Shuttle", category: "infra" } },
];

function detectTechStack(files: string[]): TechStackItem[] {
  const found = new Map<string, TechStackItem>();
  for (const file of files) {
    for (const detector of TECH_DETECTORS) {
      if (detector.pattern.test(file) && !found.has(detector.tech.name)) {
        found.set(detector.tech.name, {
          name: detector.tech.name,
          category: detector.tech.category,
          confidence: detector.tech.confidence ?? 90,
        });
      }
    }
  }

  // ── Context-aware adjustments ──
  // When a server-side language (PHP, Python, Ruby, Go, Java, etc.) is the primary backend,
  // Node.js from package.json is likely just for frontend asset tooling (npm/Vite/Webpack).
  // Downgrade Node.js to a tool with lower confidence so deploy options target the real runtime.
  const serverLangs = ["PHP", "Python", "Go", "Ruby", "Java", "Rust", "C#/.NET", "Elixir"];
  const hasServerLang = serverLangs.some(l => found.has(l));
  if (hasServerLang && found.has("Node.js")) {
    // Check if there's an actual Node.js backend (e.g. server.js, index.ts at root)
    const hasNodeBackend = files.some(f =>
      /^(server|index|app)\.(js|ts|mjs)$/i.test(f) ||
      /^src\/(server|index|app)\.(js|ts|mjs)$/i.test(f)
    );
    if (!hasNodeBackend) {
      found.set("Node.js", { name: "Node.js", category: "tool", confidence: 40 });
    }
  }

  // Vite in a PHP project is an asset bundler, not a framework
  const phpFrameworks = ["Laravel", "Symfony", "WordPress", "Craft CMS", "Statamic"];
  const hasPHPFramework = phpFrameworks.some(f => found.has(f));
  if (hasPHPFramework && found.has("Vite")) {
    found.set("Vite", { name: "Vite", category: "tool", confidence: 50 });
  }

  return Array.from(found.values()).sort((a, b) => b.confidence - a.confidence);
}

function suggestDeployOptions(tech: TechStackItem[], hasDocker: boolean, repoSize: number): DeployOption[] {
  const options: DeployOption[] = [];
  const names = new Set(tech.map(t => t.name));
  const techMap = new Map(tech.map(t => [t.name, t]));

  // Node.js counts as a real runtime only if it's not downgraded to a tool
  const nodeIsRuntime = techMap.get("Node.js")?.category === "runtime";
  const hasNode = names.has("Node.js") && nodeIsRuntime;
  const hasPHP = names.has("PHP");
  const hasLaravel = names.has("Laravel");
  const hasWordPress = names.has("WordPress");
  const hasSymfony = names.has("Symfony");
  const hasPHPFramework = hasLaravel || hasWordPress || hasSymfony || names.has("Craft CMS") || names.has("Statamic") || names.has("Twill CMS");
  const isStatic = !hasNode && !hasPHP && !names.has("Python") && !names.has("Go") && !names.has("Ruby") && !names.has("Java") && !names.has("Rust") && !names.has("C#/.NET") && !names.has("Elixir");
  const hasNextjs = names.has("Next.js");
  const hasPython = names.has("Python") || names.has("Django") || names.has("FastAPI") || names.has("Flask");
  const hasEncore = names.has("Encore.ts");
  const hasK8s = names.has("Kubernetes");
  const hasBackend = hasNode || hasPython || hasPHP || names.has("Go") || names.has("Rust") || names.has("Java") || names.has("Ruby") || names.has("C#/.NET") || names.has("Elixir");

  // ─── AWS ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "AWS",
      type: "Elastic Beanstalk",
      description: "Managed platform that auto-handles capacity provisioning, load balancing, and deployment for Docker or native runtimes.",
      pros: ["Supports Docker, Node.js, Python, Java, Go, .NET, Ruby, PHP", "Auto-scaling & load balancing included", "Integrated with RDS, ElastiCache, S3", "No extra charge (pay for underlying EC2/RDS)"],
      cons: ["Complex AWS console & IAM setup", "Slower deployments than PaaS alternatives", "Debugging requires CloudWatch knowledge", "Opinionated environment configuration"],
      estimatedMonthlyCost: "$10 – $50/mo (single instance) | $50 – $200+/mo (load balanced)",
      bestFor: "Teams already on AWS, production workloads needing auto-scaling",
    });
    options.push({
      provider: "AWS",
      type: "ECS Fargate (Container)",
      description: "Serverless container orchestration — run Docker containers without managing servers.",
      pros: ["No server management (serverless containers)", "Fine-grained CPU/memory allocation", "Integrates with ALB, RDS, ECR, CloudWatch", "Scales to zero with Fargate Spot"],
      cons: ["Complex networking (VPC, subnets, security groups)", "Higher cost than EC2 for steady workloads", "Steep learning curve", "Cold starts on scale-from-zero"],
      estimatedMonthlyCost: "$15 – $70/mo (small) | $100 – $500+/mo (production)",
      bestFor: "Containerized microservices, variable traffic workloads",
    });
    options.push({
      provider: "AWS",
      type: "App Runner (Container)",
      description: "Simplified container hosting — deploy from source or container image with minimal config.",
      pros: ["Simplest AWS container option", "Auto-scaling & HTTPS built-in", "Deploy from ECR or GitHub", "No VPC setup required"],
      cons: ["Limited configuration options", "No GPU support", "Fewer integrations than ECS", "Higher per-request cost than Fargate"],
      estimatedMonthlyCost: "$5 – $25/mo (small) | $50 – $200+/mo (production)",
      bestFor: "Simple containerized APIs, teams wanting AWS without complexity",
    });
  }
  if (isStatic || names.has("Vite") || names.has("Astro") || hasNextjs) {
    options.push({
      provider: "AWS",
      type: "Amplify Hosting",
      description: "Managed hosting for static sites and SSR frameworks with CI/CD from Git.",
      pros: ["Git-based CI/CD", "SSR support for Next.js", "Global CDN (CloudFront)", "Free tier (1000 build minutes/mo)"],
      cons: ["Limited build customization", "Slower builds than Vercel/Netlify", "AWS billing complexity", "Less community than Vercel"],
      estimatedMonthlyCost: "Free tier | $5 – $20/mo (typical)",
      bestFor: "Frontend apps on AWS, Next.js SSR on AWS",
    });
  }
  if (hasK8s || (hasDocker && repoSize > 50000)) {
    options.push({
      provider: "AWS",
      type: "EKS (Kubernetes)",
      description: "Managed Kubernetes with deep AWS integration for large-scale container orchestration.",
      pros: ["Full Kubernetes API compatibility", "Deep AWS service integration", "Fargate mode (serverless nodes)", "Enterprise-grade security & compliance"],
      cons: ["$0.10/hr ($73/mo) control plane cost", "Complex setup & networking", "Requires Kubernetes expertise", "Expensive at small scale"],
      estimatedMonthlyCost: "$73/mo (control plane) + $50 – $300+/mo (nodes)",
      bestFor: "Enterprise Kubernetes, large-scale microservices",
    });
  }

  // ─── DigitalOcean ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "DigitalOcean",
      type: "App Platform (Container)",
      description: "Managed PaaS that builds and runs containers from Git with auto-scaling and managed databases.",
      pros: ["Deploy from GitHub/GitLab in clicks", "Built-in managed databases (Postgres, Redis, MySQL)", "Auto-scaling & zero-downtime deploys", "Predictable pricing"],
      cons: ["Less flexible than raw droplets", "Limited regions (8)", "No GPU instances", "Smaller ecosystem than AWS"],
      estimatedMonthlyCost: "$5 – $25/mo (basic) | $25 – $100+/mo (production)",
      bestFor: "Full-stack apps, startups wanting simplicity",
    });
    options.push({
      provider: "DigitalOcean",
      type: "VPS (Droplet)",
      description: "Flexible VPS with predictable pricing — run Docker, K8s, or bare metal.",
      pros: ["Predictable pricing ($4/mo for 512MB)", "Full root access", "Managed databases available", "Good documentation & community"],
      cons: ["Requires server management", "No auto-scaling on basic droplets", "Manual SSL/load balancer setup"],
      estimatedMonthlyCost: "$4 – $12/mo (basic) | $24 – $96/mo (production)",
      bestFor: "Budget-friendly Docker hosting, self-managed servers",
    });
  }
  if (hasK8s || (hasDocker && repoSize > 50000)) {
    options.push({
      provider: "DigitalOcean",
      type: "Managed Kubernetes (DOKS)",
      description: "Managed K8s cluster with simple pricing and integrated container registry.",
      pros: ["Free control plane", "Simple pricing ($12/mo per node)", "Integrated container registry", "1-click marketplace apps"],
      cons: ["Smaller node options than AWS/GCP", "Less enterprise features", "Limited regions"],
      estimatedMonthlyCost: "$12 – $48/mo (per node)",
      bestFor: "Small-to-medium K8s workloads",
    });
  }

  // ─── Hetzner ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Hetzner",
      type: "Cloud Server (VPS)",
      description: "Best price-to-performance VPS in Europe — run Docker containers with full control.",
      pros: ["Cheapest VPS (€3.29/mo for 2GB RAM)", "Excellent performance per dollar", "EU data centers (GDPR friendly)", "ARM64 options available"],
      cons: ["No managed PaaS / app platform", "Requires server administration", "Limited US presence (only Ashburn)", "No managed container service"],
      estimatedMonthlyCost: "€3.29 – €10/mo (VPS) | €40+/mo (dedicated)",
      bestFor: "Cost-optimized European hosting, self-managed Docker",
    });
  }
  if (hasK8s || (hasDocker && repoSize > 30000)) {
    options.push({
      provider: "Hetzner",
      type: "Managed Kubernetes (K8s)",
      description: "Affordable managed Kubernetes with Hetzner's price-performance advantage.",
      pros: ["Cheapest managed K8s available", "Free control plane", "Hetzner Cloud integration", "EU data centers"],
      cons: ["Smaller ecosystem", "Limited regions", "Less enterprise tooling", "Community-driven support"],
      estimatedMonthlyCost: "€3.29+/mo (per node)",
      bestFor: "Budget Kubernetes in Europe",
    });
  }

  // ─── Vultr ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Vultr",
      type: "Cloud Compute / Container",
      description: "High-performance cloud VPS with Kubernetes and container registry support.",
      pros: ["Competitive pricing ($2.50/mo entry)", "32 global locations", "Managed Kubernetes available", "Bare metal & GPU options"],
      cons: ["Smaller community than DO/AWS", "No managed PaaS", "Requires server management", "Support can be slow"],
      estimatedMonthlyCost: "$2.50 – $12/mo (VPS) | $20+/mo (K8s)",
      bestFor: "Global presence on a budget, GPU workloads",
    });
  }

  // ─── Linode (Akamai) ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Linode",
      type: "Cloud Instance / LKE",
      description: "Reliable cloud VPS with managed Kubernetes (LKE) and Akamai CDN integration.",
      pros: ["Predictable pricing ($5/mo for 1GB)", "Free managed Kubernetes control plane", "Akamai CDN integration", "Good support reputation"],
      cons: ["No managed PaaS", "Smaller marketplace than AWS/DO", "Requires server management", "Fewer managed database options"],
      estimatedMonthlyCost: "$5 – $12/mo (VPS) | $12+/mo (LKE node)",
      bestFor: "Reliable VPS hosting, Kubernetes with CDN",
    });
  }

  // ─── UpCloud ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "UpCloud",
      type: "Cloud Server",
      description: "High-performance European cloud with MaxIOPS storage and managed databases.",
      pros: ["MaxIOPS storage (fast I/O)", "EU & US data centers", "Managed databases (Postgres, MySQL, Redis)", "100% uptime SLA"],
      cons: ["No managed container service", "Smaller community", "Requires server management", "Higher entry price than Hetzner"],
      estimatedMonthlyCost: "$5 – $20/mo (VPS) | $30+/mo (production)",
      bestFor: "I/O-intensive workloads, European hosting",
    });
  }

  // ─── Hostinger ───
  if (hasBackend || hasDocker || isStatic) {
    options.push({
      provider: "Hostinger",
      type: "VPS / Cloud Hosting",
      description: "Budget-friendly VPS and managed hosting with global data centers.",
      pros: ["Very affordable ($3.99/mo VPS)", "Managed WordPress hosting", "Global data centers", "Easy control panel"],
      cons: ["Limited advanced features", "No managed containers or K8s", "Shared hosting limitations", "Less developer-focused"],
      estimatedMonthlyCost: "$3.99 – $12/mo (VPS) | $16+/mo (cloud)",
      bestFor: "Budget hosting, WordPress, small projects",
    });
  }

  // ─── Katapult ───
  if (hasBackend || hasDocker) {
    options.push({
      provider: "Katapult",
      type: "Cloud VM",
      description: "Developer-focused cloud with API-first approach and fast VM provisioning.",
      pros: ["Fast VM provisioning (<60s)", "API-first design", "Simple pricing", "UK & EU data centers"],
      cons: ["Smaller provider", "Limited regions", "No managed K8s or PaaS", "Smaller community"],
      estimatedMonthlyCost: "$5 – $20/mo (VM)",
      bestFor: "API-driven infrastructure, UK/EU hosting",
    });
  }

  // ─── Static / Edge (Vercel, Netlify, Cloudflare) ───
  if (isStatic || names.has("Vite") || names.has("Astro")) {
    options.push({
      provider: "Vercel",
      type: "Static / Edge",
      description: "Optimized for frontend frameworks with edge CDN, instant rollbacks, and preview deployments.",
      pros: ["Free tier generous (100GB bandwidth)", "Automatic HTTPS & CDN", "Preview deploys per PR", "Zero config for Vite/Next/Astro"],
      cons: ["Serverless functions have cold starts", "Vendor lock-in on edge functions", "100GB bandwidth limit on free tier"],
      estimatedMonthlyCost: "Free – $20/mo (Pro)",
      bestFor: "Frontend apps, marketing sites, JAMstack",
    });
    options.push({
      provider: "Netlify",
      type: "Static / Edge",
      description: "Similar to Vercel with built-in forms, identity, and serverless functions.",
      pros: ["Free tier with 100GB bandwidth", "Built-in form handling", "Split testing built-in", "Plugin ecosystem"],
      cons: ["Build minutes limited (300/mo free)", "Serverless functions limited to 10s execution", "Less optimized for SSR than Vercel"],
      estimatedMonthlyCost: "Free – $19/mo (Pro)",
      bestFor: "Static sites, blogs, marketing pages",
    });
    options.push({
      provider: "Cloudflare Pages",
      type: "Static / Edge",
      description: "Unlimited bandwidth on free tier with Workers for edge compute.",
      pros: ["Unlimited bandwidth (free)", "Global edge network (300+ cities)", "Workers for server logic", "Fast builds"],
      cons: ["Workers have 10ms CPU limit (free)", "Less framework-specific optimizations", "Smaller ecosystem than Vercel/Netlify"],
      estimatedMonthlyCost: "Free – $5/mo (Workers paid)",
      bestFor: "High-traffic static sites, cost-sensitive projects",
    });
  }

  // ─── Next.js specific ───
  if (hasNextjs) {
    options.push({
      provider: "Vercel",
      type: "Serverless + Edge",
      description: "First-party hosting for Next.js with ISR, edge middleware, and image optimization.",
      pros: ["Best Next.js support (built by same team)", "ISR & on-demand revalidation", "Edge middleware", "Automatic code splitting"],
      cons: ["Can get expensive at scale ($20/seat)", "Vendor lock-in for some features", "Serverless cold starts on free tier"],
      estimatedMonthlyCost: "$0 – $20/mo per seat (Pro)",
      bestFor: "Next.js apps of any size",
    });
  }

  // ─── PaaS (Railway, Render, Fly.io) ───
  if (hasNode && !isStatic) {
    options.push({
      provider: "Railway",
      type: "PaaS (Container)",
      description: "Simple container hosting with built-in PostgreSQL, Redis, and auto-scaling.",
      pros: ["Deploy from GitHub in seconds", "Built-in databases (Postgres, Redis, MySQL)", "Usage-based pricing", "Private networking between services"],
      cons: ["No free tier (trial $5 credit)", "Less control than VPS", "Smaller community than Heroku"],
      estimatedMonthlyCost: "$5 – $20/mo (hobby) | $20+/mo (production)",
      bestFor: "Full-stack Node.js apps with databases",
    });
    options.push({
      provider: "Render",
      type: "PaaS (Container)",
      description: "Heroku alternative with free tier, auto-deploy from Git, and managed databases.",
      pros: ["Free tier for web services", "Auto-deploy from Git", "Managed PostgreSQL & Redis", "Built-in cron jobs"],
      cons: ["Free tier spins down after 15min inactivity", "Limited to 750 hours/mo free", "Slower builds than Railway"],
      estimatedMonthlyCost: "Free – $7/mo (Starter) | $25+/mo (Pro)",
      bestFor: "Side projects, startups, Heroku migration",
    });
    options.push({
      provider: "Fly.io",
      type: "Container (Edge)",
      description: "Run containers close to users globally with built-in Postgres and Upstash Redis.",
      pros: ["Global edge deployment", "Built-in Postgres (Fly Postgres)", "Generous free tier (3 shared VMs)", "WebSocket & long-running process support"],
      cons: ["More complex setup than Railway/Render", "Postgres is user-managed", "Debugging can be harder"],
      estimatedMonthlyCost: "Free – $5/mo (per VM) | $30+/mo (production)",
      bestFor: "Latency-sensitive apps, global user base",
    });
  }

  // ─── Python PaaS ───
  if (hasPython) {
    options.push({
      provider: "Railway",
      type: "PaaS (Container)",
      description: "One-click Python deployment with built-in databases and environment management.",
      pros: ["Auto-detects Python/Django/FastAPI", "Built-in PostgreSQL", "Usage-based pricing", "Easy environment variables"],
      cons: ["No free tier", "Less Python-specific tooling", "Limited cron on hobby plan"],
      estimatedMonthlyCost: "$5 – $20/mo (hobby) | $20+/mo (production)",
      bestFor: "Django, FastAPI, Flask apps",
    });
    options.push({
      provider: "Render",
      type: "PaaS (Container)",
      description: "Free tier Python hosting with managed databases and background workers.",
      pros: ["Free tier available", "Native Python buildpack", "Background workers support", "Managed PostgreSQL"],
      cons: ["Free tier sleeps after inactivity", "Slower cold starts", "Limited compute on free tier"],
      estimatedMonthlyCost: "Free – $7/mo (Starter) | $25+/mo (Pro)",
      bestFor: "Python APIs, Django apps, data services",
    });
  }

  // ─── PHP / Laravel PaaS ───
  if (hasPHP || hasPHPFramework) {
    if (hasLaravel || hasPHPFramework) {
      options.push({
        provider: "Railway",
        type: "PaaS (Container)",
        description: "One-click Laravel/PHP deployment with built-in MySQL, PostgreSQL, and Redis.",
        pros: ["Auto-detects PHP/Laravel", "Built-in MySQL & PostgreSQL", "Usage-based pricing", "Easy environment variables & queues"],
        cons: ["No free tier (trial $5 credit)", "Less PHP-specific tooling than Laravel Forge", "Limited cron on hobby plan"],
        estimatedMonthlyCost: "$5 – $20/mo (hobby) | $20+/mo (production)",
        bestFor: "Laravel, Symfony, PHP apps with databases",
      });
      options.push({
        provider: "Render",
        type: "PaaS (Container)",
        description: "Docker-based PHP hosting with managed databases and background workers.",
        pros: ["Free tier available", "Docker-based PHP support", "Managed PostgreSQL & Redis", "Background workers for queues"],
        cons: ["Free tier sleeps after inactivity", "PHP needs Docker config", "Slower cold starts"],
        estimatedMonthlyCost: "Free – $7/mo (Starter) | $25+/mo (Pro)",
        bestFor: "Laravel APIs, PHP microservices",
      });
      options.push({
        provider: "Fly.io",
        type: "Container (Edge)",
        description: "Run PHP/Laravel containers close to users globally with built-in Postgres.",
        pros: ["Global edge deployment", "Built-in Postgres (Fly Postgres)", "Generous free tier (3 shared VMs)", "Great for Laravel with queues"],
        cons: ["Requires Dockerfile", "Postgres is user-managed", "More complex setup"],
        estimatedMonthlyCost: "Free – $5/mo (per VM) | $30+/mo (production)",
        bestFor: "Latency-sensitive Laravel apps, global user base",
      });
    }
    if (hasWordPress) {
      options.push({
        provider: "Hostinger",
        type: "Managed WordPress",
        description: "Optimized WordPress hosting with LiteSpeed, staging, and automatic updates.",
        pros: ["LiteSpeed web server (fast)", "1-click staging environment", "Automatic WordPress updates", "Free SSL & CDN"],
        cons: ["Limited to WordPress", "Shared resources on lower plans", "Less developer control"],
        estimatedMonthlyCost: "$2.99 – $11.99/mo",
        bestFor: "WordPress sites, blogs, WooCommerce",
      });
    }
  }

  // ─── Encore.ts ───
  if (hasEncore) {
    options.push({
      provider: "Encore Cloud",
      type: "PaaS (Managed)",
      description: "Native hosting for Encore.ts apps with automatic infrastructure provisioning.",
      pros: ["Zero-config deployment", "Auto-provisions databases & pub/sub", "Built-in tracing & monitoring", "Preview environments per PR"],
      cons: ["Encore-specific (vendor lock-in)", "Limited to Encore framework", "Pricing scales with usage"],
      estimatedMonthlyCost: "Free (dev) | $50+/mo (production on AWS/GCP)",
      bestFor: "Encore.ts microservices",
    });
  }

  // Fallback
  if (options.length === 0) {
    options.push({
      provider: "DigitalOcean",
      type: "VPS",
      description: "General-purpose cloud VPS with predictable pricing.",
      pros: ["Simple pricing", "Good documentation", "Managed databases available", "Global data centers"],
      cons: ["Requires server management", "No auto-scaling on basic droplets"],
      estimatedMonthlyCost: "$4 – $24/mo",
      bestFor: "General-purpose hosting",
    });
    options.push({
      provider: "Hetzner",
      type: "VPS",
      description: "Best value VPS hosting in Europe.",
      pros: ["Cheapest VPS available", "Great performance", "EU data centers"],
      cons: ["Requires server management", "Limited US presence"],
      estimatedMonthlyCost: "€3.29 – €10/mo",
      bestFor: "Budget hosting",
    });
  }

  return options;
}

// ─── Service Detection Rules ───

interface ServiceDetector {
  filePattern?: RegExp;
  contentPattern?: RegExp;
  service: Omit<DetectedService, "confidence"> & { confidence?: number };
}

const SERVICE_DETECTORS: ServiceDetector[] = [
  // ── Database ──
  { filePattern: /config\/database\.php$/i, service: { type: "database", name: "MySQL/PostgreSQL", provider: "Laravel DB" } },
  { filePattern: /prisma\/schema\.prisma$/i, service: { type: "database", name: "PostgreSQL", provider: "Prisma" } },
  { filePattern: /drizzle\.config\./i, service: { type: "database", name: "PostgreSQL", provider: "Drizzle ORM" } },
  { filePattern: /knexfile\./i, service: { type: "database", name: "PostgreSQL", provider: "Knex.js" } },
  { filePattern: /sequelize/i, service: { type: "database", name: "PostgreSQL/MySQL", provider: "Sequelize" } },
  { filePattern: /typeorm/i, service: { type: "database", name: "PostgreSQL/MySQL", provider: "TypeORM" } },
  { filePattern: /migrations?\//i, service: { type: "database", name: "SQL Database", provider: "Migrations", confidence: 80 } },
  { filePattern: /\.sql$/i, service: { type: "database", name: "SQL Database", provider: "SQL Files", confidence: 60 } },
  { filePattern: /mongod|mongoose/i, service: { type: "database", name: "MongoDB", provider: "MongoDB" } },
  { filePattern: /settings\.py$/i, service: { type: "database", name: "PostgreSQL", provider: "Django ORM", confidence: 70 } },
  { filePattern: /config\/database\.yml$/i, service: { type: "database", name: "PostgreSQL", provider: "Rails ActiveRecord" } },
  { filePattern: /alembic/i, service: { type: "database", name: "PostgreSQL", provider: "Alembic (SQLAlchemy)" } },
  // ── Cache ──
  { filePattern: /config\/cache\.php$/i, service: { type: "cache", name: "Redis/Memcached", provider: "Laravel Cache" } },
  { filePattern: /redis/i, service: { type: "cache", name: "Redis", provider: "Redis", confidence: 70 } },
  { filePattern: /memcached/i, service: { type: "cache", name: "Memcached", provider: "Memcached" } },
  // ── Queue ──
  { filePattern: /config\/queue\.php$/i, service: { type: "queue", name: "Redis/SQS/Database", provider: "Laravel Queue" } },
  { filePattern: /config\/horizon\.php$/i, service: { type: "queue", name: "Redis Queue", provider: "Laravel Horizon" } },
  { filePattern: /app\/Jobs\//i, service: { type: "queue", name: "Queue Worker", provider: "Laravel Jobs" } },
  { filePattern: /celery/i, service: { type: "queue", name: "Celery", provider: "Celery (Python)" } },
  { filePattern: /bullmq|bull\//i, service: { type: "queue", name: "BullMQ", provider: "BullMQ (Node.js)" } },
  { filePattern: /sidekiq/i, service: { type: "queue", name: "Sidekiq", provider: "Sidekiq (Ruby)" } },
  { filePattern: /rabbitmq/i, service: { type: "queue", name: "RabbitMQ", provider: "RabbitMQ" } },
  // ── Storage ──
  { filePattern: /config\/filesystems\.php$/i, service: { type: "storage", name: "S3/Local", provider: "Laravel Filesystem" } },
  { filePattern: /storage\/app\//i, service: { type: "storage", name: "File Storage", provider: "Local Storage", confidence: 60 } },
  { filePattern: /aws-sdk|@aws-sdk\/client-s3/i, service: { type: "storage", name: "S3", provider: "AWS S3" } },
  { filePattern: /minio/i, service: { type: "storage", name: "MinIO/S3", provider: "MinIO" } },
  { filePattern: /uploads?\//i, service: { type: "storage", name: "File Uploads", provider: "Upload Directory", confidence: 50 } },
  // ── Search ──
  { filePattern: /config\/scout\.php$/i, service: { type: "search", name: "Algolia/Meilisearch", provider: "Laravel Scout" } },
  { filePattern: /elasticsearch|elastic/i, service: { type: "search", name: "Elasticsearch", provider: "Elasticsearch" } },
  { filePattern: /meilisearch/i, service: { type: "search", name: "Meilisearch", provider: "Meilisearch" } },
  { filePattern: /typesense/i, service: { type: "search", name: "Typesense", provider: "Typesense" } },
  // ── Mail ──
  { filePattern: /config\/mail\.php$/i, service: { type: "mail", name: "SMTP/Mailgun/SES", provider: "Laravel Mail" } },
  { filePattern: /app\/Mail\//i, service: { type: "mail", name: "Transactional Email", provider: "Laravel Mailable" } },
  { filePattern: /resources\/views\/(?:emails|mail)\//i, service: { type: "mail", name: "Email Templates", provider: "Email Views" } },
  { filePattern: /nodemailer/i, service: { type: "mail", name: "SMTP", provider: "Nodemailer" } },
  { filePattern: /sendgrid/i, service: { type: "mail", name: "SendGrid", provider: "SendGrid" } },
  { filePattern: /mailgun/i, service: { type: "mail", name: "Mailgun", provider: "Mailgun" } },
  { filePattern: /postmark/i, service: { type: "mail", name: "Postmark", provider: "Postmark" } },
  // ── Broadcasting ──
  { filePattern: /config\/broadcasting\.php$/i, service: { type: "broadcasting", name: "Pusher/Redis/Ably", provider: "Laravel Broadcasting" } },
  { filePattern: /pusher/i, service: { type: "broadcasting", name: "Pusher", provider: "Pusher" } },
  { filePattern: /socket\.io|socketio/i, service: { type: "broadcasting", name: "Socket.IO", provider: "Socket.IO" } },
  { filePattern: /laravel-echo/i, service: { type: "broadcasting", name: "Laravel Echo", provider: "Laravel Echo" } },
  { filePattern: /ably/i, service: { type: "broadcasting", name: "Ably", provider: "Ably" } },
  // ── Scheduler / Cron ──
  { filePattern: /app\/Console\/Kernel\.php$/i, service: { type: "scheduler", name: "Task Scheduler", provider: "Laravel Scheduler" } },
  { filePattern: /crontab|cron/i, service: { type: "scheduler", name: "Cron Jobs", provider: "Cron", confidence: 60 } },
  { filePattern: /node-cron|agenda/i, service: { type: "scheduler", name: "Scheduled Tasks", provider: "Node Cron" } },
];

function detectServices(files: string[]): DetectedService[] {
  const found = new Map<string, DetectedService>();
  for (const file of files) {
    for (const det of SERVICE_DETECTORS) {
      if (det.filePattern && det.filePattern.test(file)) {
        const key = `${det.service.type}:${det.service.name}`;
        if (!found.has(key) || (det.service.confidence ?? 90) > (found.get(key)!.confidence)) {
          found.set(key, {
            type: det.service.type,
            name: det.service.name,
            provider: det.service.provider,
            confidence: det.service.confidence ?? 90,
            configFile: file,
          });
        }
      }
    }
  }
  // Deduplicate by type — keep highest confidence per type
  const byType = new Map<string, DetectedService[]>();
  for (const svc of found.values()) {
    const arr = byType.get(svc.type) || [];
    arr.push(svc);
    byType.set(svc.type, arr);
  }
  const result: DetectedService[] = [];
  for (const [, svcs] of byType) {
    svcs.sort((a, b) => b.confidence - a.confidence);
    // Keep the top entry per type, but merge names if multiple high-confidence
    const top = svcs[0];
    if (svcs.length > 1 && svcs[1].confidence >= 70 && svcs[1].name !== top.name) {
      top.name = `${top.name} + ${svcs[1].name}`;
    }
    result.push(top);
  }
  return result.sort((a, b) => b.confidence - a.confidence);
}

// ─── Internal file content fetcher (reusable) ───

async function fetchRepoFile(provider: string, token: string, endpoint: string, owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  try {
    if (provider === "github") {
      const baseUrl = endpoint || "https://api.github.com";
      const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3.raw" },
      });
      if (!res.ok) return null;
      return await res.text();
    } else if (provider === "gitlab" || provider === "gitlab_self_hosted") {
      const baseUrl = endpoint || "https://gitlab.com";
      const projectPath = encodeURIComponent(`${owner}/${repo}`);
      const filePath = encodeURIComponent(path);
      const res = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${encodeURIComponent(branch)}`, {
        headers: { "PRIVATE-TOKEN": token },
      });
      if (!res.ok) return null;
      return await res.text();
    } else if (provider === "bitbucket") {
      const baseUrl = endpoint || "https://api.bitbucket.org";
      const res = await fetch(`${baseUrl}/2.0/repositories/${owner}/${repo}/src/${encodeURIComponent(branch)}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.text();
    }
  } catch { /* ignore */ }
  return null;
}

// ─── AI-powered repo analysis ───

const CONFIG_FILES_TO_FETCH = [
  "composer.json", "package.json", "Dockerfile", "docker-compose.yml",
  ".env.example", "requirements.txt", "Pipfile", "pyproject.toml",
  "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "build.gradle",
  "nginx.conf", "supervisor.conf", "supervisord.conf",
];

async function analyzeWithAI(
  aiType: string,
  aiConfig: Record<string, string>,
  files: string[],
  configContents: Record<string, string>,
  techStack: TechStackItem[],
  detectedServices: DetectedService[],
): Promise<AIRepoAnalysis | null> {
  const configSummary = Object.entries(configContents)
    .map(([f, c]) => `── ${f} ──\n${c.slice(0, 3000)}`)
    .join("\n\n");

  const prompt = `You are a DevOps architect. Analyze this repository and return a JSON object for deployment configuration.

**Detected tech stack:** ${techStack.map(t => `${t.name} (${t.category})`).join(", ")}
**Detected services:** ${detectedServices.map(s => `${s.name} (${s.type})`).join(", ") || "none"}
**File tree (sample):** ${files.slice(0, 200).join(", ")}

**Config file contents:**
${configSummary}

Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "runtime": "php|node|python|go|ruby|java|rust|dotnet",
  "runtimeVersion": "exact version string e.g. 8.3 or 20",
  "framework": "framework name e.g. Laravel, Next.js, Django",
  "frameworkVersion": "exact version e.g. 11.x",
  "phpExtensions": ["array of required PHP extensions if PHP, else empty"],
  "nodeVersion": "node version if needed for asset building, else empty string",
  "buildCommand": "full build command for production",
  "startCommand": "full start command for production",
  "port": 8080,
  "needsScheduler": true/false,
  "needsQueueWorker": true/false,
  "needsWebsockets": true/false,
  "envVars": ["KEY=default_or_placeholder for essential env vars"],
  "postDeployCommands": ["commands to run after deploy e.g. php artisan migrate --force"],
  "nginxConfig": "php-fpm|reverse-proxy|static",
  "summary": "1-2 sentence summary of the architecture",
  "deployOptions": [
    {
      "provider": "provider name e.g. Hetzner, DigitalOcean, AWS, Vultr, Linode, Vercel, Railway, Render, Fly.io",
      "type": "deployment type e.g. Cloud Server (VPS), App Platform, ECS Fargate, Managed Kubernetes",
      "description": "1-2 sentence description of why this option fits this specific project",
      "pros": ["3-4 specific pros for THIS project, not generic"],
      "cons": ["2-3 specific cons for THIS project, not generic"],
      "estimatedMonthlyCost": "realistic cost range based on detected services",
      "bestFor": "one sentence on when to pick this option"
    }
  ]
}

IMPORTANT for deployOptions:
- Suggest 5-10 realistic options ranked by fit for this specific project
- Consider the detected services (database, cache, queue, etc.) when estimating costs
- For PHP/Laravel projects: prioritize VPS providers (Hetzner, Vultr, DigitalOcean) and PaaS that support PHP well
- For Node.js/Python: include serverless and container options
- For static sites: prioritize Vercel, Netlify, Cloudflare Pages
- Include at least one budget option and one premium/enterprise option
- Be specific about WHY each option fits (or doesn't) based on the actual tech stack and services detected
- Cost estimates should account for: compute + database + cache + storage needs

Be precise with versions — read them from composer.json/package.json/etc.`;

  try {
    const apiKey = BedrockApiKey();
    if (!apiKey) return null;
    const region = BedrockRegion() || "us-east-1";
    const accountId = BedrockAccountId() || "";
    const modelId = "us.anthropic.claude-sonnet-4-20250514-v1:0";
    const modelArn = `arn:aws:bedrock:${region}:${accountId}:inference-profile/${modelId}`;
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelArn)}/converse`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { temperature: 0.1, maxTokens: 4096 },
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text = data.output?.message?.content?.[0]?.text?.trim() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) as AIRepoAnalysis : null;
  } catch (e: any) {
    console.error("AI analysis failed:", e.message);
  }
  return null;
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

// ─── Get Connection Details for Scan (service-to-service) ───

export const getConnectionForScan = api(
  { method: "GET", path: "/git/connections/:connectionId/scan-auth", auth: false },
  async (params: { connectionId: string }): Promise<{ provider: string; token: string; endpoint: string }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    return { provider: conn.provider, token: conn.personal_token, endpoint: conn.endpoint || "" };
  }
);

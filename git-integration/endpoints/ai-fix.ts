import { api, APIError } from "encore.dev/api";
import { db, OpenAIApiKey } from "../shared";
import { throwProviderError } from "../helpers";

// ─── Helper: call OpenAI Chat Completions ───

async function callOpenAI(prompt: string, opts: { temperature?: number; maxTokens?: number } = {}): Promise<string | null> {
  const apiKey = OpenAIApiKey();
  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: opts.temperature ?? 0.2,
      max_completion_tokens: opts.maxTokens ?? 4096,
    }),
  });

  if (!res.ok) {
    const errBody: any = await res.json().catch(() => ({}));
    console.log(`[OpenAI] status=${res.status} error=${errBody.error?.message || res.statusText}`);
    return null;
  }

  const data: any = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

// ─── Helper: AI-summarize a finding into a short title ───

async function summarizeFindingAI(severity: string, message: string, filePath: string, snippet: string): Promise<{ title: string; estimateMinutes: number }> {
  const prompt = `Analyze this security finding and return a JSON object with exactly two fields:
- "title": a concise issue title, max 60 characters, no quotes or markdown
- "estimateMinutes": estimated time in minutes to fix this issue (consider complexity, code changes needed, testing)

Severity: ${severity}
File: ${filePath}
Finding: ${message}${snippet ? `\nCode:\n${snippet}` : ""}

Return ONLY valid JSON, nothing else.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
    const raw = await callOpenAI(prompt, { temperature: 0.3, maxTokens: 200 });
    if (raw) {
      try {
        const cleaned = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        return {
          title: String(parsed.title || "").slice(0, 60),
          estimateMinutes: Math.max(0, Math.round(Number(parsed.estimateMinutes) || 0)),
        };
      } catch { return { title: raw.slice(0, 60), estimateMinutes: 0 }; }
    }
  }
  return { title: "", estimateMinutes: 0 };
}

// ─── Helper: call AI to generate fix ───

async function generateAIFix(filePath: string, fileContent: string, finding: { ruleId: string; severity: string; message: string; snippet: string; startLine: number; endLine: number }): Promise<string> {
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

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
    const raw = await callOpenAI(prompt, { temperature: 0.2, maxTokens: 32000 });
    if (raw) {
      return raw.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
    }
  }
  throw new Error("OpenAI failed to generate fix after retries");
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
    assignee?: string;
    reviewer?: string;
  }): Promise<{ mrUrl: string; mrId: string; mrTitle: string }> => {
    const conn = await db.queryRow<{
      provider: string; personal_token: string; endpoint: string;
    }>`SELECT provider, personal_token, endpoint FROM git_connections WHERE id = ${params.connectionId}`;

    if (!conn) throw APIError.notFound("Connection not found");

    const fixBranch = `fix/${params.ruleId.replace(/[^a-zA-Z0-9._-]/g, "-")}-${Date.now()}`;
    let title = `Fix: [${params.severity.toUpperCase()}] ${params.message.substring(0, 80)}`;
    try {
      const summary = await summarizeFindingAI(params.severity, params.message, params.filePath, params.snippet || "");
      if (summary.title) title = `Fix: ${summary.title}`;
    } catch { /* fallback to default */ }

    const body = params.message;
    const hasAI = !!OpenAIApiKey();

    if (conn.provider === "github") {
      const baseUrl = conn.endpoint || "https://api.github.com";
      const headers = { Authorization: `Bearer ${conn.personal_token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" };

      const refRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/ref/heads/${encodeURIComponent(params.branch)}`, { headers });
      if (!refRes.ok) throw APIError.internal("Could not get branch ref");
      const refData = await refRes.json() as any;
      const sha = refData.object?.sha;

      const createRefRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/git/refs`, {
        method: "POST", headers,
        body: JSON.stringify({ ref: `refs/heads/${fixBranch}`, sha }),
      });
      if (!createRefRes.ok) {
        const err = await createRefRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create branch: ${err.message || createRefRes.statusText}`);
      }

      if (hasAI) {
        const fileRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/contents/${encodeURIComponent(params.filePath)}?ref=${encodeURIComponent(fixBranch)}`, { headers });
        if (fileRes.ok) {
          const fileData = await fileRes.json() as any;
          const originalContent = Buffer.from(fileData.content || "", "base64").toString("utf-8");
          const fixedContent = await generateAIFix(params.filePath, originalContent, params);
          if (fixedContent && fixedContent !== originalContent) {
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

      const prRes = await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/pulls`, {
        method: "POST", headers,
        body: JSON.stringify({ title, body, head: fixBranch, base: params.branch }),
      });
      if (!prRes.ok) {
        const err = await prRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create PR: ${err.message || prRes.statusText}`);
      }
      const pr = await prRes.json() as any;
      if (params.assignee || params.reviewer) {
        const update: Record<string, unknown> = {};
        if (params.assignee) update.assignees = [params.assignee];
        if (params.reviewer) update.reviewers = [params.reviewer];
        await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/pulls/${pr.number}`, {
          method: "PATCH", headers, body: JSON.stringify(update),
        }).catch(() => {});
        if (params.reviewer) {
          await fetch(`${baseUrl}/repos/${params.owner}/${params.repo}/pulls/${pr.number}/requested_reviewers`, {
            method: "POST", headers, body: JSON.stringify({ reviewers: [params.reviewer] }),
          }).catch(() => {});
        }
      }
      return { mrUrl: pr.html_url || "", mrId: String(pr.number || pr.id), mrTitle: title };

    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const baseUrl = conn.endpoint || "https://gitlab.com";
      const headers: Record<string, string> = { "PRIVATE-TOKEN": conn.personal_token, "Content-Type": "application/json" };
      const projectPath = encodeURIComponent(`${params.owner}/${params.repo}`);

      const projectCheck = await fetch(`${baseUrl}/api/v4/projects/${projectPath}`, { headers });
      if (!projectCheck.ok) {
        const altPath = encodeURIComponent(params.repo);
        const altCheck = await fetch(`${baseUrl}/api/v4/projects/${altPath}`, { headers });
        if (!altCheck.ok) {
          throw APIError.notFound(`GitLab project not found: ${params.owner}/${params.repo}`);
        }
      }

      const branchRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/branches`, {
        method: "POST", headers,
        body: JSON.stringify({ branch: fixBranch, ref: params.branch }),
      });
      if (!branchRes.ok) {
        const err = await branchRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create branch: ${err.message || err.error || branchRes.statusText}`);
      }

      if (hasAI) {
        const fileRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${encodeURIComponent(params.filePath)}?ref=${encodeURIComponent(fixBranch)}`, { headers });
        if (fileRes.ok) {
          const fileData = await fileRes.json() as any;
          const originalContent = Buffer.from(fileData.content || "", "base64").toString("utf-8");
          const fixedContent = await generateAIFix(params.filePath, originalContent, params);
          if (fixedContent && fixedContent !== originalContent) {
            await fetch(`${baseUrl}/api/v4/projects/${projectPath}/repository/files/${encodeURIComponent(params.filePath)}`, {
              method: "PUT", headers,
              body: JSON.stringify({
                branch: fixBranch,
                commit_message: title,
                content: fixedContent,
                encoding: "text",
              }),
            });
          }
        }
      }

      const mrBody: Record<string, unknown> = { source_branch: fixBranch, target_branch: params.branch, title, description: body };
      if (params.assignee) mrBody.assignee_ids = [Number(params.assignee)];
      if (params.reviewer) mrBody.reviewer_ids = [Number(params.reviewer)];
      const mrRes = await fetch(`${baseUrl}/api/v4/projects/${projectPath}/merge_requests`, {
        method: "POST", headers,
        body: JSON.stringify(mrBody),
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

      const branchRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/refs/branches`, {
        method: "POST", headers,
        body: JSON.stringify({ name: fixBranch, target: { hash: params.branch } }),
      });
      if (!branchRes.ok) {
        const err = await branchRes.json().catch(() => ({})) as any;
        throw APIError.internal(`Failed to create branch: ${err.error?.message || branchRes.statusText}`);
      }

      const prBody: Record<string, unknown> = {
        title, description: body,
        source: { branch: { name: fixBranch } },
        destination: { branch: { name: params.branch } },
      };
      if (params.reviewer) prBody.reviewers = [{ uuid: params.reviewer }];
      const prRes = await fetch(`${baseUrl}/2.0/repositories/${params.owner}/${params.repo}/pullrequests`, {
        method: "POST", headers,
        body: JSON.stringify(prBody),
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

// ─── Summarize Finding into Short Title ───

export const summarizeFinding = api(
  { method: "POST", path: "/git/ai/summarize-finding", auth: true },
  async (params: { severity: string; message: string; filePath: string; snippet?: string }): Promise<{ title: string; estimateMinutes: number }> => {
    try {
      const result = await summarizeFindingAI(params.severity, params.message, params.filePath, params.snippet || "");
      if (result.title) return result;
    } catch { /* fallback */ }
    return { title: params.message.slice(0, 60), estimateMinutes: 0 };
  }
);

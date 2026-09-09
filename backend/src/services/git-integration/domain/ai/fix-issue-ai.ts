/**
 * AI-powered issue resolution pipeline.
 *
 * Flow:
 * 1. Fetch repo file tree
 * 2. Ask AI to identify which files are relevant to the issue
 * 3. Fetch those files
 * 4. Ask AI to produce fixed file contents
 * 5. Create a branch, commit the changes, open a PR
 */

import type { ConnectionLike, RepoRef } from "../providers/provider-client.js";
import { fetchRepoFile, getRepoFileTree } from "../providers/provider-client.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FixIssueInput {
  owner: string;
  repo: string;
  baseBranch: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
}

export interface FixIssuePlanFile {
  path: string;
  /** Content currently on the base branch — empty for a new file. */
  before: string;
  after: string;
}

/** A generated fix that has not been written anywhere yet. */
export interface FixIssuePlan {
  summary: string;
  prDescription: string;
  branchName: string;
  baseBranch: string;
  issueNumber: number;
  issueTitle: string;
  files: FixIssuePlanFile[];
}

export interface FixIssueResult {
  prUrl: string;
  prNumber: number;
  branchName: string;
  filesChanged: number;
  summary: string;
}

interface AIFileIdentification {
  files: string[];
  reasoning: string;
}

interface AIFileFix {
  path: string;
  content: string;
}

interface AIFixPlan {
  fixes: AIFileFix[];
  summary: string;
  prDescription: string;
}

// ─── OpenAI helpers ──────────────────────────────────────────────────────────

const MAX_FILES_TO_FIX = 5;
const MAX_FILE_SIZE = 50_000; // chars — skip very large files

/**
 * Fetch the repo tree including blob SHAs — used both for AI file identification
 * and as a fallback for reading file content when the Contents API fails.
 */
async function getFileTreeWithShas(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ fileTree: string[]; blobShaMap: Map<string, string> }> {
  if (connection.provider === "github") {
    const origin = connection.endpoint || "https://api.github.com";
    const headers = {
      Authorization: `Bearer ${connection.personal_token}`,
      Accept: "application/vnd.github.v3+json",
    };
    const res = await fetch(
      `${origin}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    );
    if (!res.ok) {
      logger.error(`[AI-FixIssue] Tree fetch failed: ${res.status} ${res.statusText}`);
      throw new Error(`Failed to fetch file tree: GitHub API ${res.status}`);
    }
    const data = (await res.json()) as { tree?: Array<{ path: string; sha: string; type: string }>; truncated?: boolean };
    if (data.truncated) {
      logger.warn("[AI-FixIssue] GitHub tree response was truncated (repo has >100k files)");
    }
    const entries = (data.tree ?? []).filter((e) => e.type === "blob");
    const fileTree = entries.map((e) => e.path);
    const blobShaMap = new Map(entries.map((e) => [e.path, e.sha]));
    return { fileTree, blobShaMap };
  }

  // For non-GitHub providers, use the standard tree function and no blob SHAs
  const ref: RepoRef = { owner, repo, branch };
  const fileTree = await getRepoFileTree(connection, ref);
  return { fileTree, blobShaMap: new Map() };
}

/**
 * Fetch file content directly by blob SHA using the Git Blobs API.
 * This works when the token has git data access but not contents access.
 */
async function fetchBlobByShaWithError(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ content: string | null; error: string }> {
  // Only GitHub supports the Git Blobs API in this way
  const provider = connection.provider?.toLowerCase() || "";
  if (!provider.includes("github")) return { content: null, error: `provider "${connection.provider}" not github` };

  const origin = connection.endpoint || "https://api.github.com";
  const headers = {
    Authorization: `Bearer ${connection.personal_token}`,
    Accept: "application/vnd.github.v3+json",
  };

  const url = `${origin}/repos/${owner}/${repo}/git/blobs/${sha}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const errMsg = `HTTP ${res.status} ${res.statusText}: ${body.slice(0, 200)}`;
      logger.error(`[AI-FixIssue] Blob fetch failed (SHA: ${sha}): ${errMsg}`);
      return { content: null, error: errMsg };
    }
    const data = (await res.json()) as { content?: string; encoding?: string; size?: number };
    if (data.content && data.encoding === "base64") {
      const cleaned = data.content.replace(/\n/g, "");
      return { content: Buffer.from(cleaned, "base64").toString("utf-8"), error: "" };
    }
    if (data.content && data.encoding === "utf-8") {
      return { content: data.content, error: "" };
    }
    const errMsg = `No content. encoding=${data.encoding}, size=${data.size}`;
    logger.warn(`[AI-FixIssue] ${errMsg}`);
    return { content: null, error: errMsg };
  } catch (err) {
    const errMsg = `Exception: ${getErrMsg(err)}`;
    logger.error(`[AI-FixIssue] Blob fetch: ${errMsg}`);
    return { content: null, error: errMsg };
  }
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 8192,
): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    logger.error(`[AI-FixIssue] OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };

  if (data.choices?.[0]?.finish_reason === "length") {
    logger.warn("[AI-FixIssue] Response truncated");
  }

  return data.choices?.[0]?.message?.content?.trim() || null;
}

// ─── Step 1: Identify relevant files ─────────────────────────────────────────

/**
 * Extract file paths explicitly mentioned in the issue title or body.
 * Matches patterns like `src/foo/bar.ts`, `./lib/utils.js`, `path/to/file.tsx`, etc.
 */
function extractMentionedFiles(issueTitle: string, issueBody: string, fileTreeSet: Set<string>): string[] {
  const text = `${issueTitle}\n${issueBody}`;
  // Match file-path-like strings (must contain a / and end with an extension)
  const pathRegex = /(?:^|[\s`"'(,])([.\w/-]+\.\w{1,10})(?:[\s`"'),:]|$)/gm;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(text)) !== null) {
    const candidate = match[1].replace(/^\.?\//, "");
    if (fileTreeSet.has(candidate)) {
      found.push(candidate);
    }
  }
  return [...new Set(found)];
}

async function identifyRelevantFiles(
  apiKey: string,
  model: string,
  issueTitle: string,
  issueBody: string,
  fileTree: string[],
): Promise<AIFileIdentification> {
  const fileTreeSet = new Set(fileTree);

  // Always include files explicitly mentioned in the issue
  const mentionedFiles = extractMentionedFiles(issueTitle, issueBody, fileTreeSet);
  if (mentionedFiles.length > 0) {
    logger.info(`[AI-FixIssue] Files mentioned in issue: ${mentionedFiles.join(", ")}`);
  }

  // If the issue explicitly mentions files and they exist, use those directly
  // (skip the AI call — it's unreliable for this)
  if (mentionedFiles.length > 0 && mentionedFiles.length <= MAX_FILES_TO_FIX) {
    return {
      files: mentionedFiles,
      reasoning: "Files explicitly mentioned in the issue",
    };
  }

  // Filter tree to source files only (skip node_modules, dist, etc.)
  const relevantTree = fileTree.filter((f) => {
    if (f.includes("node_modules/") || f.includes("dist/") || f.includes(".git/")) return false;
    if (f.includes("vendor/") || f.includes("__pycache__/") || f.includes(".next/")) return false;
    if (f.endsWith(".lock") || f.endsWith(".map") || f.endsWith(".min.js")) return false;
    return true;
  });

  // Cap tree size for token limits
  const treeSample = relevantTree.slice(0, 500).join("\n");

  const prompt = `You are a senior developer analyzing a GitHub issue to identify which files need to be modified to fix it.

**Issue #${issueTitle}**

${issueBody || "No description provided."}

**Repository file tree (source files only):**
\`\`\`
${treeSample}
\`\`\`

Identify the files that are most likely to need changes to resolve this issue. Select at most ${MAX_FILES_TO_FIX} files. Prefer source code files over config or test files unless the issue is specifically about configuration or tests.

Return ONLY valid JSON:
{
  "files": ["path/to/file1.ts", "path/to/file2.ts"],
  "reasoning": "Brief explanation of why these files were selected"
}`;

  const result = await callOpenAI(apiKey, model, [{ role: "user", content: prompt }]);
  if (!result) {
    throw new Error("AI failed to identify relevant files");
  }

  try {
    const parsed = JSON.parse(result) as AIFileIdentification;
    if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
      throw new Error("AI returned empty file list");
    }
    return {
      files: parsed.files.slice(0, MAX_FILES_TO_FIX),
      reasoning: parsed.reasoning || "",
    };
  } catch (e) {
    logger.error(`[AI-FixIssue] Failed to parse file identification: ${getErrMsg(e)}`);
    throw new Error("AI failed to identify relevant files");
  }
}

// ─── Step 2: Generate fixes ──────────────────────────────────────────────────

async function generateFixes(
  apiKey: string,
  model: string,
  issueTitle: string,
  issueBody: string,
  fileContents: Array<{ path: string; content: string }>,
): Promise<AIFixPlan> {
  const filesSection = fileContents
    .map((f) => {
      const numbered = f.content
        .split("\n")
        .map((line, i) => `${i + 1}| ${line}`)
        .join("\n");
      return `### ${f.path} (${f.content.split("\n").length} lines)\n\`\`\`\n${numbered}\n\`\`\``;
    })
    .join("\n\n");

  const prompt = `You are a senior developer fixing a GitHub issue. Apply the minimum changes necessary to resolve the issue.

**Issue: ${issueTitle}**

${issueBody || "No description provided."}

**Files (with line numbers):**

${filesSection}

Fix the issue by specifying line-range replacements. For each edit, provide:
- path: the file path
- startLine: first line number to replace (1-indexed, inclusive)
- endLine: last line number to replace (1-indexed, inclusive)
- newCode: the replacement code (plain text, not JSON-escaped — use actual newlines)

Return ONLY valid JSON:
{
  "edits": [
    { "path": "path/to/file.ts", "startLine": 45, "endLine": 52, "newCode": "replacement code here" }
  ],
  "summary": "One sentence describing the fix",
  "prDescription": "A markdown PR description explaining what was changed and why"
}

CRITICAL RULES:
- You can ONLY edit the files shown above — do not reference any other file paths
- The resulting code MUST be syntactically valid — no functions declared inside object literals, no broken structure
- Preserve the structure and indentation of the surrounding code
- Line numbers reference the numbered lines shown above
- newCode replaces lines startLine through endLine (inclusive)
- Apply the minimal change that resolves the issue — do NOT remove or restructure code unrelated to the fix
- Do not add unrelated refactoring
- You can have multiple edits per file — list them in REVERSE line order (highest startLine first) so they don't shift each other
- For security fixes: use well-established patterns (e.g., DOMPurify for XSS, parameterized queries for SQL injection). Never use regex-based sanitization for HTML/XSS.
- If your fix requires a new import or dependency, include that as a separate edit at the top of the file
- VERIFY mentally that after applying your edits, the file will still compile and run correctly`;

  const result = await callOpenAI(apiKey, model, [{ role: "user", content: prompt }], 8192);
  if (!result) {
    throw new Error("AI failed to generate fixes");
  }

  try {
    const parsed = JSON.parse(result) as {
      edits: Array<{ path: string; startLine: number; endLine: number; newCode: string }>;
      summary: string;
      prDescription: string;
    };
    if (!Array.isArray(parsed.edits) || parsed.edits.length === 0) {
      throw new Error("AI returned no edits");
    }

    // Apply edits to produce final file contents
    const fileMap = new Map(fileContents.map((f) => [f.path, f.content]));
    const fixedFiles = new Map<string, string>();

    // Helper to resolve AI-returned paths to actual file paths
    const resolveEditPath = (editPath: string): string | null => {
      if (fileMap.has(editPath)) return editPath;
      const normalized = editPath.replace(/^\.?\//, "");
      if (fileMap.has(normalized)) return normalized;
      // Case-insensitive fallback
      for (const key of fileMap.keys()) {
        if (key.toLowerCase() === normalized.toLowerCase()) return key;
      }
      return null;
    };

    // Group edits by file
    const editsByFile = new Map<string, Array<{ startLine: number; endLine: number; newCode: string }>>();
    for (const edit of parsed.edits) {
      const resolvedPath = resolveEditPath(edit.path);
      if (!resolvedPath) {
        logger.warn(`[AI-FixIssue] Edit references unknown file: "${edit.path}" (available: ${[...fileMap.keys()].join(", ")})`);
        continue;
      }
      const startLine = Number(edit.startLine);
      const endLine = Number(edit.endLine);
      if (isNaN(startLine) || isNaN(endLine) || startLine < 1 || endLine < 1 || startLine > endLine) {
        logger.warn(`[AI-FixIssue] Skipping invalid edit line range: ${edit.startLine}-${edit.endLine} for file ${resolvedPath}`);
        continue;
      }
      const existing = editsByFile.get(resolvedPath) || [];
      existing.push({ startLine, endLine, newCode: edit.newCode });
      editsByFile.set(resolvedPath, existing);
    }

    logger.info(`[AI-FixIssue] Edits grouped into ${editsByFile.size} file(s) from ${parsed.edits.length} edit(s)`);

    for (const [path, edits] of editsByFile) {
      const originalContent = fixedFiles.get(path) ?? fileMap.get(path)!;
      const lines = originalContent.split("\n");

      // Sort edits by startLine descending so later edits don't shift earlier ones
      edits.sort((a, b) => b.startLine - a.startLine);

      for (const edit of edits) {
        const start = Math.max(0, edit.startLine - 1); // convert 1-indexed to 0-indexed
        const end = Math.min(lines.length, edit.endLine); // endLine is inclusive
        const newLines = edit.newCode.split("\n");
        lines.splice(start, end - start, ...newLines);
      }

      fixedFiles.set(path, lines.join("\n"));
    }

    if (fixedFiles.size === 0) {
      const editPaths = parsed.edits.map((e) => e.path).join(", ");
      const availablePaths = [...fileMap.keys()].join(", ");
      throw new Error(`AI edits could not be applied. Edit paths: [${editPaths}]. Available: [${availablePaths}]`);
    }

    // Verify at least one file actually changed
    let hasChanges = false;
    for (const [path, content] of fixedFiles) {
      if (content !== fileMap.get(path)) {
        hasChanges = true;
        break;
      }
    }
    if (!hasChanges) {
      throw new Error("AI edits produced no actual changes to the files");
    }

    const fixes: AIFileFix[] = Array.from(fixedFiles.entries())
      .filter(([path, content]) => content !== fileMap.get(path))
      .map(([path, content]) => ({ path, content }));

    return {
      fixes,
      summary: parsed.summary || "Apply fix for issue",
      prDescription: parsed.prDescription || "",
    };
  } catch (e) {
    const message = getErrMsg(e);
    if (message.includes("could not be applied") ||
        message.includes("no actual changes") ||
        message === "AI returned no edits") {
      throw e;
    }
    logger.error(`[AI-FixIssue] Failed to parse fix plan: ${message}`);
    throw new Error("AI failed to generate a valid fix plan");
  }
}

// ─── Step 3: Commit and open PR ──────────────────────────────────────────────

function buildBranchName(issueNumber: number, issueTitle: string): string {
  const slug = issueTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-5);
  return `fix/${issueNumber}-${slug}-${suffix}`;
}

async function commitMultipleFiles(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  baseBranch: string,
  branchName: string,
  fixes: AIFileFix[],
  commitMessage: string,
): Promise<void> {
  // For GitHub: use the Git Data API to create a single commit with all file changes
  if (connection.provider === "github") {
    const origin = connection.endpoint || "https://api.github.com";
    const headers = {
      Authorization: `Bearer ${connection.personal_token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };

    // Get the base branch SHA
    const refRes = await fetch(`${origin}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, { headers });
    if (!refRes.ok) throw new Error(`Failed to resolve branch ${baseBranch}`);
    const refData = (await refRes.json()) as { object: { sha: string } };
    const baseSha = refData.object.sha;

    // Get the base tree
    const commitRes = await fetch(`${origin}/repos/${owner}/${repo}/git/commits/${baseSha}`, { headers });
    if (!commitRes.ok) throw new Error("Failed to get base commit");
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // Create blobs for each file
    const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const fix of fixes) {
      const blobRes = await fetch(`${origin}/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: fix.content, encoding: "utf-8" }),
      });
      if (!blobRes.ok) throw new Error(`Failed to create blob for ${fix.path}`);
      const blobData = (await blobRes.json()) as { sha: string };
      treeEntries.push({ path: fix.path, mode: "100644", type: "blob", sha: blobData.sha });
    }

    // Create tree
    const treeRes = await fetch(`${origin}/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) throw new Error("Failed to create tree");
    const treeData = (await treeRes.json()) as { sha: string };

    // Create commit
    const newCommitRes = await fetch(`${origin}/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: commitMessage,
        tree: treeData.sha,
        parents: [baseSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error("Failed to create commit");
    const newCommitData = (await newCommitRes.json()) as { sha: string };

    // Create the branch ref
    const createRefRes = await fetch(`${origin}/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: newCommitData.sha }),
    });
    if (!createRefRes.ok) {
      const err = (await createRefRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to create branch ${branchName}`);
    }
    return;
  }

  // For GitLab: use the commits API to commit multiple files at once
  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const origin = connection.endpoint || "https://gitlab.com";
    const headers = { "PRIVATE-TOKEN": connection.personal_token, "Content-Type": "application/json" };
    const project = encodeURIComponent(`${owner}/${repo}`);

    // Create branch first
    const branchRes = await fetch(`${origin}/api/v4/projects/${project}/repository/branches`, {
      method: "POST",
      headers,
      body: JSON.stringify({ branch: branchName, ref: baseBranch }),
    });
    if (!branchRes.ok) {
      const err = (await branchRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to create branch ${branchName}`);
    }

    // Commit all files at once using the Commits API
    const actions = fixes.map((fix) => ({
      action: "update",
      file_path: fix.path,
      content: fix.content,
    }));

    const commitRes = await fetch(`${origin}/api/v4/projects/${project}/repository/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        branch: branchName,
        commit_message: commitMessage,
        actions,
      }),
    });
    if (!commitRes.ok) {
      const err = (await commitRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || "Failed to commit fixes");
    }
    return;
  }

  throw new Error(`AI fix commits are not supported for provider: ${connection.provider}`);
}

async function createPullRequest(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string,
  title: string,
  body: string,
): Promise<{ prUrl: string; prNumber: number }> {
  if (connection.provider === "github") {
    const origin = connection.endpoint || "https://api.github.com";
    const headers = {
      Authorization: `Bearer ${connection.personal_token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };

    const res = await fetch(`${origin}/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        head: branchName,
        base: baseBranch,
        body,
        draft: false,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to create pull request (${res.status})`);
    }

    const data = (await res.json()) as { html_url?: string; number?: number };
    return { prUrl: data.html_url || "", prNumber: data.number || 0 };
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const origin = connection.endpoint || "https://gitlab.com";
    const headers = { "PRIVATE-TOKEN": connection.personal_token, "Content-Type": "application/json" };
    const project = encodeURIComponent(`${owner}/${repo}`);

    const res = await fetch(`${origin}/api/v4/projects/${project}/merge_requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source_branch: branchName,
        target_branch: baseBranch,
        title,
        description: body,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to create merge request (${res.status})`);
    }

    const data = (await res.json()) as { web_url?: string; iid?: number };
    return { prUrl: data.web_url || "", prNumber: data.iid || 0 };
  }

  throw new Error(`Pull requests are not supported for provider: ${connection.provider}`);
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

/**
 * Steps 1-4 of the fix pipeline: read the repo, pick files, generate changes.
 *
 * Performs **no writes**. Split out so the user can see a diff before anything
 * touches their repository — PRODUCT.md promises a preview, and the combined
 * pipeline opened a pull request before anyone had seen a line of it.
 */
export async function planIssueFix(
  connection: ConnectionLike,
  input: FixIssueInput,
  apiKey: string,
  model: string,
): Promise<FixIssuePlan> {
  const { owner, repo, baseBranch, issueNumber, issueTitle, issueBody } = input;

  logger.info(`[AI-FixIssue] Starting fix for issue #${issueNumber}: ${issueTitle}`);
  logger.info(`[AI-FixIssue] Repo: ${owner}/${repo}, branch: "${baseBranch}"`);

  // 1. Fetch repo file tree (with SHAs for direct blob access)
  const ref: RepoRef = { owner, repo, branch: baseBranch };
  const { fileTree, blobShaMap } = await getFileTreeWithShas(connection, owner, repo, baseBranch);
  logger.info(`[AI-FixIssue] File tree has ${fileTree.length} entries (first 5: ${fileTree.slice(0, 5).join(", ")})`);
  logger.info(`[AI-FixIssue] Blob SHA map has ${blobShaMap.size} entries`);
  if (fileTree.length === 0) {
    throw new Error(`Repository file tree is empty. Branch "${baseBranch}" may not exist.`);
  }

  // 2. Identify relevant files
  const identification = await identifyRelevantFiles(apiKey, model, issueTitle, issueBody, fileTree);
  logger.info(`[AI-FixIssue] Identified ${identification.files.length} files: ${identification.files.join(", ")}`);

  // 3. Validate AI file paths against the actual tree and fetch contents
  const fileTreeSet = new Set(fileTree);
  const fileContents: Array<{ path: string; content: string }> = [];
  const fetchErrors: string[] = [];
  for (const filePath of identification.files) {
    // Normalize: strip leading slash or ./ if AI added one
    const normalized = filePath.replace(/^\.?\//, "");

    // Check if the file actually exists in the tree
    const resolvedPath = fileTreeSet.has(normalized)
      ? normalized
      : fileTreeSet.has(filePath)
        ? filePath
        : // Try case-insensitive match as fallback
          fileTree.find((f) => f.toLowerCase() === normalized.toLowerCase()) || null;

    if (!resolvedPath) {
      logger.warn(`[AI-FixIssue] AI identified "${filePath}" but it doesn't exist in the repo tree, skipping`);
      continue;
    }

    // Try fetching with retries (GitHub can rate-limit or flake)
    let content: string | null = null;
    let lastFetchError = "";
    for (let attempt = 1; attempt <= 3 && !content; attempt++) {
      if (attempt > 1) {
        logger.info(`[AI-FixIssue] Retry ${attempt} for "${resolvedPath}"`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      // Try primary fetch method
      try {
        content = await fetchRepoFile(connection, ref, resolvedPath);
        if (!content && attempt === 1) {
          logger.info(`[AI-FixIssue] fetchRepoFile returned null for "${resolvedPath}" (provider: "${connection.provider}", endpoint: "${connection.endpoint || "default"}")`);
        }
      } catch (err) {
        lastFetchError = getErrMsg(err);
      }

      // Fallback: fetch via Git Blobs API
      if (!content) {
        const blobSha = blobShaMap.get(resolvedPath);
        if (blobSha) {
          const result = await fetchBlobByShaWithError(connection, owner, repo, blobSha);
          content = result.content;
          if (!content) lastFetchError = result.error;
        } else {
          lastFetchError = "no blob SHA in map";
        }
      }
    }

    if (content && content.length <= MAX_FILE_SIZE) {
      fileContents.push({ path: resolvedPath, content });
    } else if (content && content.length > MAX_FILE_SIZE) {
      logger.warn(`[AI-FixIssue] Skipping ${resolvedPath} (${content.length} chars, exceeds limit of ${MAX_FILE_SIZE})`);
      fetchErrors.push(`${resolvedPath}: file too large (${content.length} chars, max ${MAX_FILE_SIZE})`);
    } else {
      logger.warn(`[AI-FixIssue] All fetch methods failed for "${resolvedPath}" on branch "${baseBranch}" after 3 attempts. Last error: ${lastFetchError}`);
      fetchErrors.push(`${resolvedPath}: ${lastFetchError}`);
    }
  }

  if (fileContents.length === 0) {
    const tried = identification.files.join(", ");
    const debugInfo = identification.files.map((f) => {
      const norm = f.replace(/^\.?\//, "");
      const inTree = fileTreeSet.has(norm) || fileTreeSet.has(f);
      const hasSha = blobShaMap.has(norm) || blobShaMap.has(f);
      return `${f}(inTree:${inTree},sha:${hasSha})`;
    }).join("; ");
    const errors = fetchErrors.length > 0 ? ` Errors: ${fetchErrors.join("; ")}` : "";
    throw new Error(`Could not read any of the identified files (${tried}) from branch "${baseBranch}". Debug: ${debugInfo}. Tree size: ${fileTree.length}, SHAs: ${blobShaMap.size}.${errors}`);
  }

  // 4. Generate fixes (use a stronger model for code generation if available)
  const fixModel = model.includes("mini") ? model.replace("-mini", "") : model;
  const fixPlan = await generateFixes(apiKey, fixModel, issueTitle, issueBody, fileContents);
  logger.info(`[AI-FixIssue] Generated fixes for ${fixPlan.fixes.length} files (model: ${fixModel})`);

  // Pair each proposed file with the content it replaces, so the client can
  // render a real diff rather than just the new file.
  const originals = new Map(fileContents.map((f) => [f.path, f.content]));
  const branchName = buildBranchName(issueNumber, issueTitle);

  logger.info(`[AI-FixIssue] Planned ${fixPlan.fixes.length} file changes (no writes performed)`);

  return {
    summary: fixPlan.summary,
    prDescription: fixPlan.prDescription,
    branchName,
    baseBranch,
    issueNumber,
    issueTitle,
    files: fixPlan.fixes.map((f) => ({
      path: f.path,
      before: originals.get(f.path) ?? "",
      after: f.content,
    })),
  };
}

/**
 * Steps 5-6: branch, commit, open the pull request.
 *
 * Everything here writes to the user's repository, and it runs only on an
 * explicit second action from the client.
 */
export async function applyIssueFix(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  plan: FixIssuePlan,
): Promise<FixIssueResult> {
  const { baseBranch, branchName, issueNumber, issueTitle, summary, prDescription, files } = plan;

  const commitMessage = `fix: ${issueTitle}\n\n${summary}\n\nCloses #${issueNumber}`;
  const fixes = files.map((f) => ({ path: f.path, content: f.after }));

  await commitMultipleFiles(connection, owner, repo, baseBranch, branchName, fixes, commitMessage);

  const prTitle = `fix: ${issueTitle} (#${issueNumber})`;
  const prBody = [
    prDescription,
    "",
    "---",
    `Closes #${issueNumber}`,
    "",
    "> 🤖 This pull request was generated by Dockier AI. Please review the changes carefully before merging.",
  ].join("\n");

  const { prUrl, prNumber } = await createPullRequest(
    connection, owner, repo, branchName, baseBranch, prTitle, prBody,
  );

  logger.info(`[AI-FixIssue] Created PR #${prNumber}: ${prUrl}`);

  return { prUrl, prNumber, branchName, filesChanged: fixes.length, summary };
}

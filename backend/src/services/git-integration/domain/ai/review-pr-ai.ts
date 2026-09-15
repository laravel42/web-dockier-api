/**
 * AI-powered pull request review.
 *
 * Flow:
 * 1. Fetch PR diff (changed files + patches)
 * 2. Send to AI for code review
 * 3. Post review comments on the PR via GitHub/GitLab API
 */

import type { ConnectionLike } from "../providers/provider-client.js";
import { baseUrl as providerBaseUrl } from "../providers/provider-client.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { callOpenAIChat } from "./openai-client.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReviewPRInput {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prBody: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "suggestion" | "praise";
}

export interface ReviewPRResult {
  summary: string;
  comments: ReviewComment[];
  approved: boolean;
  reviewUrl: string;
}

interface PRFile {
  filename: string;
  status: string;
  patch: string;
  additions: number;
  deletions: number;
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 8192,
): Promise<string | null> {
  return callOpenAIChat({
    apiKey,
    model,
    messages,
    temperature: 0.1,
    maxTokens,
    logTag: "[AI-ReviewPR]",
    truncation: "ignore",
  });
}

// ─── Fetch PR diff ───────────────────────────────────────────────────────────

async function fetchPRFiles(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRFile[]> {
  if (connection.provider === "github" || connection.provider?.toLowerCase()?.includes("github")) {
    const origin = providerBaseUrl(connection.provider, connection.endpoint);
    const headers = {
      Authorization: `Bearer ${connection.personal_token}`,
      Accept: "application/vnd.github.v3+json",
    };

    const res = await fetch(`${origin}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=50`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch PR files: GitHub API ${res.status}`);
    }

    const data = (await res.json()) as Array<{
      filename?: string;
      status?: string;
      patch?: string;
      additions?: number;
      deletions?: number;
    }>;

    return data
      .filter((f) => f.patch) // skip binary files
      .map((f) => ({
        filename: f.filename || "",
        status: f.status || "modified",
        patch: f.patch || "",
        additions: f.additions || 0,
        deletions: f.deletions || 0,
      }));
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const origin = providerBaseUrl(connection.provider, connection.endpoint);
    const headers = { "PRIVATE-TOKEN": connection.personal_token };
    const project = encodeURIComponent(`${owner}/${repo}`);

    const res = await fetch(`${origin}/api/v4/projects/${project}/merge_requests/${prNumber}/diffs?per_page=50`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch MR diffs: GitLab API ${res.status}`);
    }

    const data = (await res.json()) as Array<{
      new_path?: string;
      old_path?: string;
      diff?: string;
      new_file?: boolean;
      deleted_file?: boolean;
    }>;

    return data
      .filter((f) => f.diff)
      .map((f) => ({
        filename: f.new_path || f.old_path || "",
        status: f.new_file ? "added" : f.deleted_file ? "removed" : "modified",
        patch: f.diff || "",
        additions: 0,
        deletions: 0,
      }));
  }

  throw new Error(`PR review not supported for provider: ${connection.provider}`);
}

// ─── Post review ─────────────────────────────────────────────────────────────

async function postGitHubReview(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  prNumber: number,
  summary: string,
  comments: ReviewComment[],
  approved: boolean,
): Promise<string> {
  const origin = providerBaseUrl(connection.provider, connection.endpoint);
  const headers = {
    Authorization: `Bearer ${connection.personal_token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  // Build the review as a formatted comment
  const icon = approved ? "✅" : "⚠️";
  const verdict = approved ? "Approved" : "Changes Requested";
  const bodyParts = [
    `## ${icon} AI Code Review — ${verdict}`,
    "",
    summary,
    "",
  ];

  if (comments.length > 0) {
    bodyParts.push("---");
    bodyParts.push("");
    bodyParts.push("### Findings");
    bodyParts.push("");

    for (const c of comments) {
      const severityIcon = c.severity === "critical" ? "🔴" : c.severity === "warning" ? "🟡" : c.severity === "praise" ? "🟢" : "💡";
      bodyParts.push(`${severityIcon} **${c.severity.toUpperCase()}** — \`${c.path}:${c.line}\``);
      bodyParts.push(`> ${c.body}`);
      bodyParts.push("");
    }
  }

  bodyParts.push("---");
  bodyParts.push("*This review was generated by Dockier AI.*");

  // Post as an issue comment (always visible, no permission issues)
  const res = await fetch(`${origin}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: bodyParts.join("\n") }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to post review comment: ${res.status}`);
  }

  const data = (await res.json()) as { html_url?: string };
  return data.html_url || "";
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

/**
 * Steps 1-3: read the PR and generate review comments.
 *
 * Performs **no writes**. Review comments land publicly on a colleague's pull
 * request; their author should see them first.
 */
export async function generatePRReview(
  connection: ConnectionLike,
  input: ReviewPRInput,
  apiKey: string,
  model: string,
): Promise<Omit<ReviewPRResult, "reviewUrl">> {
  const { owner, repo, prNumber, prTitle, prBody } = input;

  logger.info(`[AI-ReviewPR] Starting review for PR #${prNumber}: ${prTitle}`);

  // 1. Fetch PR diff
  const files = await fetchPRFiles(connection, owner, repo, prNumber);
  if (files.length === 0) {
    throw new Error("No reviewable files in this pull request");
  }

  logger.info(`[AI-ReviewPR] Fetched ${files.length} changed files`);

  // 2. Build diff context (cap total size for token limits)
  const MAX_DIFF_SIZE = 40_000;
  let totalSize = 0;
  const diffSections: string[] = [];
  for (const file of files) {
    const section = `### ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})\n\`\`\`diff\n${file.patch}\n\`\`\``;
    if (totalSize + section.length > MAX_DIFF_SIZE) continue;
    diffSections.push(section);
    totalSize += section.length;
  }

  // 3. AI review
  const fixModel = model || "gpt-4o-mini";
  const prompt = `You are a senior code reviewer. Review this pull request thoroughly.

**PR: ${prTitle} (#${prNumber})**

${prBody || "No description provided."}

**Changed files:**

${diffSections.join("\n\n")}

Review the code for:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code style and best practices
- Missing error handling

Return ONLY valid JSON:
{
  "summary": "Overall review summary (2-3 sentences)",
  "approved": true/false (false if there are critical or warning issues),
  "comments": [
    {
      "path": "path/to/file.ts",
      "line": 42,
      "body": "Description of the issue or suggestion",
      "severity": "critical|warning|suggestion|praise"
    }
  ]
}

Rules:
- "line" should reference a line number from the diff (use the new file line numbers from the + lines)
- Be constructive and specific — explain why something is an issue and suggest a fix
- Use "critical" for bugs/security issues, "warning" for potential problems, "suggestion" for improvements, "praise" for good patterns
- If the code looks good overall, set approved to true and include praise comments`;

  const result = await callOpenAI(apiKey, fixModel, [{ role: "user", content: prompt }]);
  if (!result) {
    throw new Error("AI failed to generate a review");
  }

  let parsed: { summary: string; approved: boolean; comments: ReviewComment[] };
  try {
    parsed = JSON.parse(result) as typeof parsed;
    if (!parsed.summary || !Array.isArray(parsed.comments) || typeof parsed.approved !== "boolean") {
      throw new Error("Invalid response structure");
    }
    // Validate and sanitize comments
    const validSeverities = new Set(["critical", "warning", "suggestion", "praise"]);
    parsed.comments = parsed.comments
      .filter((c) => c && typeof c.path === "string" && typeof c.body === "string")
      .map((c) => ({
        path: String(c.path),
        line: Math.max(0, Number(c.line) || 0),
        body: String(c.body),
        severity: validSeverities.has(c.severity) ? c.severity : "suggestion",
      }));
  } catch (e) {
    logger.error(`[AI-ReviewPR] Failed to parse review: ${getErrMsg(e)}`);
    throw new Error("AI failed to produce a valid review");
  }

  logger.info(`[AI-ReviewPR] Generated ${parsed.comments.length} comments, approved: ${parsed.approved} (nothing posted)`);

  return { summary: parsed.summary, comments: parsed.comments, approved: parsed.approved };
}

/**
 * Step 4: post the review publicly.
 *
 * Runs only on an explicit second action, with the comment set the user
 * approved — which may be a subset of what was generated.
 */
export async function postPRReview(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  prNumber: number,
  summary: string,
  comments: ReviewComment[],
  approved: boolean,
): Promise<{ reviewUrl: string }> {
  if (connection.provider === "github" || connection.provider?.toLowerCase()?.includes("github")) {
    // Unlike the old combined pipeline, a failure here is surfaced rather than
    // swallowed: the user asked to post, so they must learn if it did not.
    const reviewUrl = await postGitHubReview(connection, owner, repo, prNumber, summary, comments, approved);
    logger.info(`[AI-ReviewPR] Posted ${comments.length} comments to PR #${prNumber}`);
    return { reviewUrl };
  }
  throw new Error(`Posting reviews is not supported for provider: ${connection.provider}`);
}

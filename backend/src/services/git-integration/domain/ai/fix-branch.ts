import type { ConnectionLike } from "../providers/provider-client.js";
import { baseUrl as providerBaseUrl } from "../providers/provider-client.js";
import { gitFetch } from "../providers/guarded-fetch.js";

function baseUrl(connection: ConnectionLike): string {
  return providerBaseUrl(connection.provider, connection.endpoint);
}

function githubHeaders(connection: ConnectionLike): Record<string, string> {
  return {
    Authorization: `Bearer ${connection.personal_token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

function gitlabHeaders(connection: ConnectionLike): Record<string, string> {
  return { "PRIVATE-TOKEN": connection.personal_token, "Content-Type": "application/json" };
}

export function sanitizeBranchName(ruleId: string): string {
  const slug = ruleId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36);
  return `dockier/fix-${slug || "finding"}-${suffix}`;
}

/**
 * Best-effort removal of a fix branch whose commit or PR failed, so a retry does
 * not hit "Reference already exists" and the repo is not left with dead branches.
 */
export async function deleteFixBranch(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  const origin = baseUrl(connection);
  try {
    if (connection.provider === "github") {
      // GitHub takes the ref's slashes literally; GitLab wants the branch as one encoded segment.
      const ref = branch.split("/").map(encodeURIComponent).join("/");
      await gitFetch(`${origin}/repos/${owner}/${repo}/git/refs/heads/${ref}`, { method: "DELETE", headers: githubHeaders(connection) });
    } else if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
      const project = encodeURIComponent(`${owner}/${repo}`);
      await gitFetch(`${origin}/api/v4/projects/${project}/repository/branches/${encodeURIComponent(branch)}`, { method: "DELETE", headers: gitlabHeaders(connection) });
    }
  } catch {
    // Cleanup only; the original failure is what the caller reports.
  }
}
async function getGitHubRefSha(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const origin = baseUrl(connection);
  const res = await gitFetch(`${origin}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
    headers: githubHeaders(connection),
  });
  if (!res.ok) {
    throw new Error(`Failed to resolve branch ${branch}: GitHub API ${res.status}`);
  }
  const body = (await res.json()) as { object?: { sha?: string } };
  if (!body.object?.sha) throw new Error(`Branch ${branch} has no commit SHA`);
  return body.object.sha;
}

async function createGitHubBranch(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  branchName: string,
  baseSha: string,
): Promise<void> {
  const origin = baseUrl(connection);
  const res = await gitFetch(`${origin}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: githubHeaders(connection),
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to create branch ${branchName}`);
  }
}

async function getGitHubFileSha(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | undefined> {
  const origin = baseUrl(connection);
  const res = await gitFetch(
    `${origin}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(connection) },
  );
  if (res.status === 404) return undefined; // new file
  if (!res.ok) throw new Error(`Failed to read ${path}: ${connection.provider} API ${res.status}`);
  const body = (await res.json()) as { sha?: string };
  return body.sha;
}

async function commitGitHubFile(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  path: string,
  branchName: string,
  content: string,
  message: string,
  fileSha?: string,
): Promise<void> {
  const origin = baseUrl(connection);
  const res = await gitFetch(`${origin}/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: githubHeaders(connection),
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      branch: branchName,
      ...(fileSha ? { sha: fileSha } : {}),
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to commit ${path}`);
  }
}

async function commitGitLabFile(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  path: string,
  branchName: string,
  baseBranch: string,
  content: string,
  message: string,
): Promise<void> {
  const origin = baseUrl(connection);
  const project = encodeURIComponent(`${owner}/${repo}`);
  const filePath = encodeURIComponent(path);
  const res = await gitFetch(`${origin}/api/v4/projects/${project}/repository/files/${filePath}`, {
    method: "PUT",
    headers: gitlabHeaders(connection),
    body: JSON.stringify({
      branch: branchName,
      // start_branch creates the branch in the same call, so a failed commit leaves no branch behind.
      start_branch: baseBranch,
      content,
      commit_message: message,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to commit ${path}`);
  }
}

export interface CommitFixInput {
  owner: string;
  repo: string;
  baseBranch: string;
  filePath: string;
  fixedContent: string;
  commitMessage: string;
  ruleId: string;
}

export interface CommitFixResult {
  fixBranch: string;
  targetBranch: string;
}

export async function commitFixToBranch(
  connection: ConnectionLike,
  input: CommitFixInput,
): Promise<CommitFixResult> {
  // The branch the file was read from: basing the fix on another branch would revert that branch's other changes.
  const targetBranch = input.baseBranch;
  const fixBranch = sanitizeBranchName(input.ruleId);

  if (connection.provider === "github") {
    const baseSha = await getGitHubRefSha(connection, input.owner, input.repo, targetBranch);
    const fileSha = await getGitHubFileSha(connection, input.owner, input.repo, input.filePath, targetBranch);
    await createGitHubBranch(connection, input.owner, input.repo, fixBranch, baseSha);
    try {
      await commitGitHubFile(
        connection,
        input.owner,
        input.repo,
        input.filePath,
        fixBranch,
        input.fixedContent,
        input.commitMessage,
        fileSha,
      );
    } catch (err) {
      await deleteFixBranch(connection, input.owner, input.repo, fixBranch);
      throw err;
    }
    return { fixBranch, targetBranch };
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    await commitGitLabFile(
      connection,
      input.owner,
      input.repo,
      input.filePath,
      fixBranch,
      targetBranch,
      input.fixedContent,
      input.commitMessage,
    );
    return { fixBranch, targetBranch };
  }

  throw new Error(`AI fix commits are not supported for provider: ${connection.provider}`);
}

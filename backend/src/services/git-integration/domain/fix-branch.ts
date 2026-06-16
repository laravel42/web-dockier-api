import type { ConnectionLike } from "./provider-client.js";

function baseUrl(connection: ConnectionLike): string {
  if (connection.provider === "github") return connection.endpoint || "https://api.github.com";
  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    return connection.endpoint || "https://gitlab.com";
  }
  return connection.endpoint || "https://api.bitbucket.org";
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

export async function getDefaultBranch(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  fallback: string,
): Promise<string> {
  const origin = baseUrl(connection);

  if (connection.provider === "github") {
    const res = await fetch(`${origin}/repos/${owner}/${repo}`, { headers: githubHeaders(connection) });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { default_branch?: string };
    return body.default_branch || fallback;
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    const project = encodeURIComponent(`${owner}/${repo}`);
    const res = await fetch(`${origin}/api/v4/projects/${project}`, { headers: gitlabHeaders(connection) });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { default_branch?: string };
    return body.default_branch || fallback;
  }

  return fallback;
}

async function getGitHubRefSha(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const origin = baseUrl(connection);
  const res = await fetch(`${origin}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
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
  const res = await fetch(`${origin}/repos/${owner}/${repo}/git/refs`, {
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
  const res = await fetch(
    `${origin}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(connection) },
  );
  if (!res.ok) return undefined;
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
  const res = await fetch(`${origin}/repos/${owner}/${repo}/contents/${path}`, {
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

async function createGitLabBranch(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string,
): Promise<void> {
  const origin = baseUrl(connection);
  const project = encodeURIComponent(`${owner}/${repo}`);
  const res = await fetch(`${origin}/api/v4/projects/${project}/repository/branches`, {
    method: "POST",
    headers: gitlabHeaders(connection),
    body: JSON.stringify({ branch: branchName, ref: baseBranch }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to create branch ${branchName}`);
  }
}

async function commitGitLabFile(
  connection: ConnectionLike,
  owner: string,
  repo: string,
  path: string,
  branchName: string,
  content: string,
  message: string,
): Promise<void> {
  const origin = baseUrl(connection);
  const project = encodeURIComponent(`${owner}/${repo}`);
  const filePath = encodeURIComponent(path);
  const res = await fetch(`${origin}/api/v4/projects/${project}/repository/files/${filePath}`, {
    method: "PUT",
    headers: gitlabHeaders(connection),
    body: JSON.stringify({
      branch: branchName,
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
  const targetBranch = await getDefaultBranch(connection, input.owner, input.repo, input.baseBranch);
  const fixBranch = sanitizeBranchName(input.ruleId);

  if (connection.provider === "github") {
    const baseSha = await getGitHubRefSha(connection, input.owner, input.repo, targetBranch);
    await createGitHubBranch(connection, input.owner, input.repo, fixBranch, baseSha);
    const fileSha = await getGitHubFileSha(connection, input.owner, input.repo, input.filePath, targetBranch);
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
    return { fixBranch, targetBranch };
  }

  if (connection.provider === "gitlab" || connection.provider === "gitlab_self_hosted") {
    await createGitLabBranch(connection, input.owner, input.repo, fixBranch, targetBranch);
    await commitGitLabFile(
      connection,
      input.owner,
      input.repo,
      input.filePath,
      fixBranch,
      input.fixedContent,
      input.commitMessage,
    );
    return { fixBranch, targetBranch };
  }

  throw new Error(`AI fix commits are not supported for provider: ${connection.provider}`);
}

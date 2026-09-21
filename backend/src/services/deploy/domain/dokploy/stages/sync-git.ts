/**
 * Stage: Sync Git Credentials
 *
 * Loads git connection credentials from Dockier's database and prepares
 * the parameters needed to configure a Dokploy application with the
 * appropriate git provider. The actual API call happens in configure-app.
 *
 * This stage runs in parallel with provision-server.
 */

import { getGitConnectionCredentials } from "../../../../../shared/service-clients/git-connections.js";
import { buildCloneUrl } from "../../../../../lib/git-url.js";
import type {
  SaveGithubProviderParams,
  SaveGitlabProviderParams,
  SaveCustomGitProviderParams,
} from "../types.js";

export type GitProviderConfig =
  | { type: "github"; params: Omit<SaveGithubProviderParams, "applicationId"> }
  | { type: "gitlab"; params: Omit<SaveGitlabProviderParams, "applicationId"> }
  | { type: "custom"; params: Omit<SaveCustomGitProviderParams, "applicationId"> };

export interface SyncGitResult {
  gitConfig: GitProviderConfig;
}

/**
 * Load git credentials and prepare provider configuration for Dokploy.
 */
export async function stageSyncGit(params: {
  gitConnectionId: string;
  repo: string;
  branch: string;
  log: (line: string) => Promise<void>;
}): Promise<SyncGitResult> {
  const { gitConnectionId, repo, branch, log } = params;

  await log("[stage:sync-git] Loading git connection credentials...");

  const creds = await getGitConnectionCredentials(gitConnectionId);
  if (!creds) {
    throw new Error(`Git connection not found: ${gitConnectionId}`);
  }

  const provider = creds.provider.toLowerCase();
  const [owner, repository] = parseOwnerRepo(repo);

  await log(`[stage:sync-git] Provider: ${provider}, repo: ${owner}/${repository}, branch: ${branch}`);

  let gitConfig: GitProviderConfig;

  if (provider === "github") {
    // Dokploy's native GitHub provider (saveGithubProvider) is built around a
    // GitHub App registered INSIDE Dokploy, keyed by `githubId`. Dockier
    // doesn't have that — it holds a personal access token — and sending an
    // empty githubId fails (same class of problem GitLab had). Use the
    // custom-git provider with a token-authenticated HTTPS clone URL instead,
    // consistent with how GitLab is handled below.
    const cloneUrl = buildCloneUrl({
      provider: "github",
      token: creds.token,
      repo: `${owner}/${repository}`,
      endpoint: creds.endpoint || undefined,
    });

    gitConfig = {
      type: "custom",
      params: {
        customGitUrl: cloneUrl,
        customGitBranch: branch,
        customGitBuildPath: "/",
        enableSubmodules: false,
        watchPaths: [],
      },
    };
  } else if (provider === "gitlab" || provider === "gitlab_self_hosted") {
    // Dokploy's native GitLab provider (saveGitlabProvider) is built around a
    // GitLab OAuth integration registered INSIDE Dokploy, keyed by `gitlabId`
    // and a numeric `gitlabProjectId`. Dockier doesn't have those — it holds a
    // personal access token — and sending empty/zero placeholders makes
    // Dokploy 500. Instead, use the custom-git provider with a token-
    // authenticated HTTPS clone URL. This also handles nested GitLab groups
    // (e.g. "group/subgroup/repo") natively, since the full path lives in the
    // clone URL rather than being split into owner/repository.
    const cloneUrl = buildCloneUrl({
      provider,
      token: creds.token,
      repo: `${owner}/${repository}`,
      endpoint: creds.endpoint || undefined,
    });

    gitConfig = {
      type: "custom",
      params: {
        customGitUrl: cloneUrl,
        customGitBranch: branch,
        customGitBuildPath: "/",
        enableSubmodules: false,
        // Dokploy's saveGitProvider requires watchPaths (non-optional). Empty
        // means "no path-scoped auto-deploy filter" — send [] rather than
        // omitting it, which triggers a 400.
        watchPaths: [],
      },
    };
  } else {
    // For Bitbucket or generic git — use the custom provider. Prefer a
    // token-authenticated clone URL when the provider is one buildCloneUrl
    // supports; otherwise fall back to a plain URL from the endpoint.
    const cloneUrl = tryBuildAuthedUrl(provider, creds.token, `${owner}/${repository}`, creds.endpoint)
      ?? (creds.endpoint
        ? `${creds.endpoint}/${owner}/${repository}.git`
        : `https://github.com/${owner}/${repository}.git`);

    gitConfig = {
      type: "custom",
      params: {
        customGitUrl: cloneUrl,
        customGitBranch: branch,
        customGitBuildPath: "/",
        enableSubmodules: false,
        watchPaths: [],
      },
    };
  }

  await log(`[stage:sync-git] ✓ Git config prepared (${gitConfig.type})`);
  return { gitConfig };
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Build a token-authenticated clone URL when the provider + token are usable,
 * returning null (rather than throwing) for providers buildCloneUrl doesn't
 * support or when no token is available. Lets the caller fall back cleanly.
 */
function tryBuildAuthedUrl(provider: string, token: string, repo: string, endpoint?: string): string | null {
  if (!token) return null;
  try {
    return buildCloneUrl({ provider, token, repo, endpoint: endpoint || undefined });
  } catch {
    return null;
  }
}

function parseOwnerRepo(repo: string): [string, string] {
  // "owner/repo" or "https://github.com/owner/repo"
  const cleaned = repo.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "");
  const parts = cleaned.split("/");
  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join("/")];
  }
  return [cleaned, cleaned];
}

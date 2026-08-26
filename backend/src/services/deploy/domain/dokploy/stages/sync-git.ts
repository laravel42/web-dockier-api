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
    gitConfig = {
      type: "github",
      params: {
        owner,
        repository,
        branch,
        githubId: "", // Will be resolved from Dokploy's registered GitHub App
        enableSubmodules: false,
        triggerType: "push",
      },
    };
  } else if (provider === "gitlab") {
    gitConfig = {
      type: "gitlab",
      params: {
        gitlabOwner: owner,
        gitlabRepository: repository,
        gitlabBranch: branch,
        gitlabBuildPath: "/",
        gitlabId: "", // Will be resolved from Dokploy's registered GitLab integration
        gitlabProjectId: 0, // Needs to be resolved from GitLab API or Dokploy
        gitlabPathNamespace: `${owner}/${repository}`,
        enableSubmodules: false,
      },
    };
  } else {
    // For Bitbucket, Gitea, or generic git — use custom SSH-based provider
    const gitUrl = creds.endpoint
      ? `${creds.endpoint}/${owner}/${repository}.git`
      : `https://github.com/${owner}/${repository}.git`;

    gitConfig = {
      type: "custom",
      params: {
        customGitUrl: gitUrl,
        customGitBranch: branch,
        customGitBuildPath: "/",
        enableSubmodules: false,
      },
    };
  }

  await log(`[stage:sync-git] ✓ Git config prepared (${gitConfig.type})`);
  return { gitConfig };
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseOwnerRepo(repo: string): [string, string] {
  // "owner/repo" or "https://github.com/owner/repo"
  const cleaned = repo.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "");
  const parts = cleaned.split("/");
  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join("/")];
  }
  return [cleaned, cleaned];
}

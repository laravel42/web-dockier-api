/**
 * Stage helper: re-read the compose file inside the pipeline.
 *
 * The same pattern as resolve-runtime: fetch the repo over the git provider API
 * (no clone) and parse it with the shared analyzer, so the deploy acts on what
 * the repo contains NOW rather than on whatever the wizard cached.
 *
 * It exists for one job in particular — the list of `${VAR:?…}` variables the
 * compose file requires. Those make `docker compose` abort when unset, and its
 * error reaches only the build log, which the user cannot read. Deriving the
 * list here lets the deploy refuse up front and name them.
 *
 * It also re-derives the entry port, because the stored one can be stale: a
 * service's Dockerfile `EXPOSE` can change between deploys, and the port is
 * what Dokploy writes into the Traefik loadbalancer label.
 *
 * Best-effort: any failure returns an empty descriptor, so a deploy never
 * breaks because this had a hiccup. The cost of a miss is the loss of the
 * pre-flight check, not a wrong deploy.
 */

import { getGitConnectionCredentials } from "../../../../../shared/service-clients/git-connections.js";
import { type ConnectionLike, type RepoRef, getRepoFileTree } from "../../../../git-integration/domain/providers/provider-client.js";
import { analyzeComposeRepo } from "../../../../git-integration/domain/compose-analysis.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";
import { DOKPLOY_STAGE, stageMarker } from "../../../../../lib/logging.js";

const MARKER = stageMarker(DOKPLOY_STAGE.CONFIGURE_COMPOSE);

export interface ResolvedCompose {
  /** Variables the file marks `${VAR:?…}`; unset ones abort `docker compose`. */
  requiredVars: string[];
  /** Entry port re-derived from the file, when it states one. */
  entryPort?: number;
  /** Entry service suggested by the file, when the project configured none. */
  entryService?: string;
  /** Blocking problems found in the file (missing build contexts, ...). */
  problems: string[];
  /** Advisory findings (no dokploy-network, ...). */
  warnings: string[];
}

const EMPTY: ResolvedCompose = { requiredVars: [], problems: [], warnings: [] };

export async function resolveComposeFile(params: {
  gitConnectionId: string;
  repo: string;
  branch: string;
  /** The compose file the project selected. */
  composePath: string;
  log: (line: string) => Promise<void>;
}): Promise<ResolvedCompose> {
  const { gitConnectionId, repo, branch, composePath, log } = params;

  try {
    const creds = await getGitConnectionCredentials(gitConnectionId);
    if (!creds) return EMPTY;

    const connection: ConnectionLike = {
      provider: creds.provider.toLowerCase(),
      personal_token: creds.token,
      endpoint: creds.endpoint || null,
    };
    const [owner, repository] = parseOwnerRepo(repo);
    const ref: RepoRef = { owner, repo: repository, branch };

    const tree = await getRepoFileTree(connection, ref);
    // Pass the project's chosen path as the preference, so a repo with several
    // compose files is analysed for the one that will actually be deployed.
    const analysis = await analyzeComposeRepo(connection, ref, tree, composePath);
    if (!analysis) return EMPTY;

    if (analysis.path !== composePath) {
      // The configured file is gone from the repo and discovery fell back to
      // another one. Report it rather than silently analysing a different file
      // than the one Dokploy is about to deploy.
      await log(
        `${MARKER} The configured compose file "${composePath}" was not found in the repository ` +
        `(closest match: "${analysis.path}"). The deploy will still use the configured path.`,
      );
      return EMPTY;
    }

    for (const problem of analysis.problems) {
      await log(`${MARKER} ⚠ ${problem}`);
    }
    for (const warning of analysis.warnings) {
      await log(`${MARKER} ⚠ ${warning}`);
    }

    return {
      requiredVars: analysis.requiredVars,
      entryPort: analysis.entryPort,
      entryService: analysis.entryService,
      problems: analysis.problems,
      warnings: analysis.warnings,
    };
  } catch (err) {
    await log(`${MARKER} Could not re-read the compose file (continuing): ${getErrMsg(err)}`);
    return EMPTY;
  }
}

function parseOwnerRepo(repo: string): [string, string] {
  const cleaned = repo.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "");
  const parts = cleaned.split("/");
  if (parts.length >= 2) return [parts[0], parts.slice(1).join("/")];
  return [cleaned, cleaned];
}

/**
 * Repo Analysis Worker
 *
 * Warms `analysis_cache` for a project's repository in the background.
 *
 * Why at creation time: the analysis produces the tech badges the list pages
 * show and the stack detection the deploy wizard reads. Until now the only
 * thing that produced it was `GET /git/repo-badges` itself, on a cache miss —
 * so opening Projects with N uncached projects fired N repository analyses
 * against the git provider, and that route is capped at 30/min per tenant,
 * which silently dropped every badge past the cap. Producing it once, when the
 * project is created, lets the read paths only ever read.
 *
 * Queued rather than inline: runRepoAnalysis walks the repo file tree and
 * fetches manifests, so it would add provider latency to project creation, and
 * a failure there must not fail the create.
 */
import { createWorker, REPO_ANALYSIS_QUEUE } from "../../../shared/database/queue.js";
import { logger } from "../../../shared/logger.js";
import { getConnectionForTenant } from "./connections.js";
import { getHeadCommitSha, runRepoAnalysis } from "./analysis.js";
import { writeAnalysisCache } from "./cache.js";
import { parseRepositoryRef } from "./repo-ref.js";
import type { Json } from "../../../shared/supabase/types.js";

export interface RepoAnalysisJobInput {
  tenantId: string;
  projectId: string;
  connectionId: string;
  /** The repository as stored on the project: a URL, an SSH remote, or owner/repo. */
  repository: string;
  branch: string;
  /** Request id of the originating HTTP call, for log correlation. */
  correlationId?: string;
}

async function handleRepoAnalysis(input: RepoAnalysisJobInput): Promise<void> {
  const { tenantId, projectId, connectionId, repository, branch } = input;

  const ref = parseRepositoryRef(repository);
  if (!ref) {
    logger.warn({ projectId, repository }, "[repo-analysis] cannot derive owner/repo, skipping");
    return;
  }
  const repoKey = `${ref.owner}/${ref.repo}`;

  const connection = await getConnectionForTenant(connectionId, tenantId);
  const repoRef = { owner: ref.owner, repo: ref.repo, branch };
  // The sha this analysis describes, so the read path can tell when the repo
  // has moved on. Fetched alongside, not after: one is a tree walk, the other a
  // single commit, and neither needs the other's result.
  const [result, commitSha] = await Promise.all([
    runRepoAnalysis(connection, repoRef),
    getHeadCommitSha(connection, repoRef),
  ]);

  await writeAnalysisCache(
    { tenantId, repoKey, branch, projectId, commitSha, result: result as unknown as Json },
    logger,
  );

  logger.info(
    { projectId, repoKey, branch, commitSha, techs: result.techStack.length },
    "[repo-analysis] cached",
  );
}

const repoAnalysisWorker = createWorker<RepoAnalysisJobInput>(
  REPO_ANALYSIS_QUEUE,
  handleRepoAnalysis,
);

/** Call once at startup. */
export async function registerRepoAnalysisWorker(): Promise<void> {
  await repoAnalysisWorker.register();
}

/**
 * Queue an analysis for a project's repo. Never throws: the project is usable
 * without it, and the badge route still analyses on demand as a fallback.
 */
export async function enqueueRepoAnalysis(input: RepoAnalysisJobInput): Promise<void> {
  try {
    // Keyed on the project so a repeated create/retry does not queue the walk twice.
    await repoAnalysisWorker.enqueue(input, `repo-analysis:${input.projectId}`);
  } catch (err) {
    logger.warn(
      { projectId: input.projectId, err: err instanceof Error ? err.message : err },
      "[repo-analysis] could not enqueue",
    );
  }
}

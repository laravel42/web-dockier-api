/**
 * Push-to-Deploy
 *
 * Handles incoming Git push events (GitHub/GitLab/Bitbucket webhooks).
 * Matches the push to projects that have pushToDeploy enabled, finds their
 * most recent successful deployment config, and enqueues a new deploy.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { createAndEnqueueDeployment } from "./deployments.js";

export interface GitPushEvent {
  /** Full repo identifier (e.g., "owner/repo") */
  repository: string;
  /** Branch that was pushed to (e.g., "main") */
  branch: string;
  /** Commit SHA of the head after push */
  commitSha?: string;
  /** Git provider: github, gitlab, bitbucket */
  provider?: string;
}

/**
 * Process an incoming git push event.
 *
 * 1. Find projects matching the repo + branch that have pushToDeploy enabled
 * 2. For each project, find the most recent successful deployment
 * 3. Re-deploy using the same provider/strategy/connection configuration
 *
 * Returns the number of deployments triggered.
 */
export async function handleGitPushEvent(event: GitPushEvent): Promise<{ triggered: number }> {
  const { repository, branch } = event;

  // Find projects that match this repo + branch and have pushToDeploy enabled
  const { data: projects, error: projectsError } = await supabaseAdmin
    .from("projects")
    .select("id, organization_id, repository, branch, connection_id, settings")
    .eq("repository", repository)
    .eq("branch", branch);

  if (projectsError) {
    logger.error({ err: projectsError, repository, branch }, "[push-to-deploy] Failed to query projects");
    return { triggered: 0 };
  }

  if (!projects || projects.length === 0) {
    logger.debug({ repository, branch }, "[push-to-deploy] No matching projects found");
    return { triggered: 0 };
  }

  // Filter to projects with pushToDeploy enabled in settings
  const eligibleProjects = projects.filter((p) => {
    if (!p.organization_id) return false;
    const settings = p.settings as Record<string, unknown> | null;
    return settings?.pushToDeploy === true;
  });

  if (eligibleProjects.length === 0) {
    logger.debug({ repository, branch }, "[push-to-deploy] No projects with pushToDeploy enabled");
    return { triggered: 0 };
  }

  let triggered = 0;

  for (const project of eligibleProjects) {
    try {
      await triggerDeployForProject(project, event);
      triggered++;
    } catch (err) {
      logger.error(
        { err, projectId: project.id, repository, branch },
        "[push-to-deploy] Failed to trigger deploy for project",
      );
    }
  }

  logger.info({ repository, branch, triggered, total: eligibleProjects.length }, "[push-to-deploy] Processed push event");
  return { triggered };
}

/**
 * Trigger a new deployment for a project by re-using its most recent
 * successful deployment configuration.
 */
async function triggerDeployForProject(
  project: { id: string; organization_id: string | null; connection_id: string; repository: string; branch: string },
  event: GitPushEvent,
): Promise<void> {
  if (!project.organization_id) {
    logger.warn({ projectId: project.id }, "[push-to-deploy] Project has no organization — skipping");
    return;
  }

  const tenantId = project.organization_id;

  // Find the most recent non-destroyed deployment for this project
  // to re-use its provider, strategy, and connection config
  const { data: lastDeploy, error: deployError } = await supabaseAdmin
    .from("deployments")
    .select("provider_id, git_connection_id, deploy_strategy")
    .eq("project_id", project.id)
    .eq("organization_id", tenantId)
    .not("status", "eq", "destroyed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (deployError) {
    throw new Error(`Failed to find last deployment: ${deployError.message}`);
  }

  if (!lastDeploy) {
    logger.warn({ projectId: project.id }, "[push-to-deploy] No previous deployment found — skipping");
    return;
  }

  await createAndEnqueueDeployment({
    tenantId,
    providerId: lastDeploy.provider_id,
    gitConnectionId: lastDeploy.git_connection_id || project.connection_id,
    projectId: project.id,
    repo: project.repository,
    branch: project.branch,
    deployStrategy: lastDeploy.deploy_strategy || "managed",
    correlationId: `push-to-deploy:${event.commitSha ?? "unknown"}`,
  });

  logger.info(
    { projectId: project.id, repo: project.repository, branch: project.branch },
    "[push-to-deploy] Deploy enqueued",
  );
}

/**
 * Stage: Ensure Dokploy Project
 *
 * Ensures a Dokploy Project exists for the tenant (organization).
 * Creates one if no mapping exists yet. Idempotent — safe to re-run.
 */

import type { DokployClient } from "../client.js";
import type { DokployProject } from "../types.js";
import { getTenantProject, createTenantProject } from "../mappings.js";
export interface EnsureProjectResult {
  dokployProjectId: string;
  dokployEnvironmentId: string;
}

/** Dokploy's reserved name for the default environment created with a project. */
const DEFAULT_ENVIRONMENT_NAME = "production";

/**
 * Resolve the default environment id for a freshly created Dokploy project.
 *
 * `project.create` does not return the environment in a single consistent
 * shape across Dokploy versions: some embed it in `environments[]`, others
 * return it as a sibling `environment` object or a bare `environmentId`, and
 * some return neither. When the create response lacks it, fall back to
 * `project.one`, which reliably returns nested environments, and pick the
 * reserved "production" default (or the first one as a last resort).
 *
 * Throws only if no environment can be resolved from any source.
 */
async function resolveDefaultEnvironmentId(
  project: DokployProject,
  client: DokployClient,
): Promise<string> {
  const fromResponse = pickEnvironmentId(project);
  if (fromResponse) return fromResponse;

  // Fall back to fetching the full project, which returns nested environments.
  const full = await client.getProject(project.projectId);
  const fromFetch = pickEnvironmentId(full);
  if (fromFetch) return fromFetch;

  throw new Error(
    `Dokploy project ${project.projectId} was created but no environment could be resolved ` +
    `from the create response or project.one. Check the Dokploy API version/shape.`,
  );
}

/** Extract an environment id from a project object across the possible shapes. */
function pickEnvironmentId(project: DokployProject): string | null {
  if (project.environmentId) return project.environmentId;
  if (project.environment?.environmentId) return project.environment.environmentId;

  const envs = project.environments ?? [];
  const defaultEnv = envs.find((e) => e.name === DEFAULT_ENVIRONMENT_NAME);
  if (defaultEnv?.environmentId) return defaultEnv.environmentId;
  if (envs[0]?.environmentId) return envs[0].environmentId;

  return null;
}

/**
 * Look up or create the Dokploy Project for this organization.
 */
export async function stageEnsureProject(params: {
  organizationId: string;
  organizationName: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<EnsureProjectResult> {
  const { organizationId, organizationName, client, log } = params;

  await log("[stage:ensure-project] Checking for existing Dokploy project...");

  // Check if we already have a mapping
  const existing = await getTenantProject(organizationId);
  if (existing) {
    await log(`[stage:ensure-project] ✓ Reusing existing project: ${existing.dokployProjectId}`);
    return {
      dokployProjectId: existing.dokployProjectId,
      dokployEnvironmentId: existing.dokployEnvironmentId,
    };
  }

  // Create new project in Dokploy
  await log(`[stage:ensure-project] Creating new Dokploy project for "${organizationName}"...`);
  const project = await client.createProject({ name: organizationName });

  const environmentId = await resolveDefaultEnvironmentId(project, client);

  // Store mapping
  await createTenantProject({
    organizationId,
    dokployProjectId: project.projectId,
    dokployEnvironmentId: environmentId,
  });

  await log(`[stage:ensure-project] ✓ Project created: ${project.projectId}`);
  return {
    dokployProjectId: project.projectId,
    dokployEnvironmentId: environmentId,
  };
}

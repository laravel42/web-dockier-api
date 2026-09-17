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
 * Build the Dokploy project name for an organization.
 *
 * The org id is embedded so the name is globally unique per tenant. Adoption
 * (findExistingProjectByName) matches on this exact string, so two Dockier
 * organizations that happen to share a display name (e.g. two "Demo Workspace"
 * tenants) can never collide onto the same Dokploy project.
 *
 * Format: "<display name> [<org id>]" — display name kept first for
 * human readability in the Dokploy UI.
 */
export function dokployProjectName(organizationName: string, organizationId: string): string {
  return `${organizationName} [${organizationId}]`;
}

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

  // 1. Local mapping is the fast path — one organization → one Dokploy project.
  const existing = await getTenantProject(organizationId);
  if (existing) {
    await log(`[stage:ensure-project] ✓ Reusing existing project: ${existing.dokployProjectId}`);
    return {
      dokployProjectId: existing.dokployProjectId,
      dokployEnvironmentId: existing.dokployEnvironmentId,
    };
  }

  // The Dokploy project name embeds the org id, so it is unique per tenant and
  // adoption can never match another organization's project.
  const projectName = dokployProjectName(organizationName, organizationId);

  // 2. No local mapping — reconcile with Dokploy before creating.
  //
  // A prior run may have created a project in Dokploy but failed before
  // persisting the mapping (e.g. the create succeeded, then the DB write or
  // environment resolution threw). Without this reconciliation, every retry
  // would create ANOTHER project with the same name — which is exactly how
  // the duplicate "Demo Workspace" projects accumulated. Adopt the existing
  // Dokploy project instead of blindly creating a new one.
  const adopted = await findExistingProjectByName(projectName, client);
  const project = adopted ?? (await createNewProject(projectName, client, log));

  if (adopted) {
    await log(`[stage:ensure-project] ✓ Adopted existing Dokploy project by name: ${project.projectId}`);
  }

  const environmentId = await resolveDefaultEnvironmentId(project, client);

  // Persist the mapping. The upsert is keyed on organization_id, so even if two
  // deploys race here they converge on a single row (one org → one project).
  await createTenantProject({
    organizationId,
    dokployProjectId: project.projectId,
    dokployEnvironmentId: environmentId,
  });

  await log(`[stage:ensure-project] ✓ Project ready: ${project.projectId}`);
  return {
    dokployProjectId: project.projectId,
    dokployEnvironmentId: environmentId,
  };
}

/**
 * Find an existing Dokploy project whose name matches the organization.
 * Returns null if none exists. Used to adopt orphaned projects (created by a
 * prior run that failed before persisting the mapping) instead of duplicating.
 */
async function findExistingProjectByName(
  name: string,
  client: DokployClient,
): Promise<DokployProject | null> {
  const projects = await client.listProjects();
  const matches = projects.filter((p) => p.name === name);
  if (matches.length === 0) return null;

  // If prior bugs already produced duplicates, prefer the OLDEST project so
  // repeated runs deterministically converge on the same one rather than
  // ping-ponging between duplicates.
  matches.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return matches[0];
}

/** Create a brand-new Dokploy project for the organization. */
async function createNewProject(
  name: string,
  client: DokployClient,
  log: (line: string) => Promise<void>,
): Promise<DokployProject> {
  await log(`[stage:ensure-project] Creating new Dokploy project for "${name}"...`);
  return client.createProject({ name });
}

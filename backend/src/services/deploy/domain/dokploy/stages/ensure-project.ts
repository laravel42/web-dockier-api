/**
 * Stage: Ensure Dokploy Project
 *
 * Ensures a Dokploy Project exists for the tenant (organization).
 * Creates one if no mapping exists yet. Idempotent — safe to re-run.
 */

import type { DokployClient } from "../client.js";
import { getTenantProject, createTenantProject } from "../mappings.js";
export interface EnsureProjectResult {
  dokployProjectId: string;
  dokployEnvironmentId: string;
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

  const environmentId = project.environments?.[0]?.environmentId ?? "";
  if (!environmentId) {
    throw new Error("Dokploy project created but no default environment was returned");
  }

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

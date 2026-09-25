/**
 * Dokploy Mapping Layer
 *
 * Database operations for the dokploy_* tables that track the relationship
 * between Dockier entities and their Dokploy counterparts.
 *
 * All "getOrCreate" functions are concurrency-safe via INSERT ON CONFLICT.
 */

import { supabaseAdmin } from "../../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery } from "../../../../shared/supabase/query.js";
import { nowIso } from "../../../../shared/utils/time.js";
import { encryptJson, decryptJson } from "../../../../shared/auth/crypto.js";
import { logger } from "../../../../shared/logger.js";

/**
 * Domain error for the Dokploy DB mapping layer.
 *
 * Distinct from the HTTP-transport `DokployError` in `types.ts` (which carries
 * a status code + endpoint). This one plugs into the shared DomainError system
 * so mapping failures get structured logging and correct HTTP mapping like the
 * rest of the app.
 */
export const DokployMappingError = createDomainErrorClass<"not_found" | "internal">("DokployMappingError");
export type DokployMappingError = InstanceType<typeof DokployMappingError>;

// ─── Types ─────────────────────────────────────────────────────────

export interface TenantProjectMapping {
  id: string;
  organizationId: string;
  dokployProjectId: string;
  dokployEnvironmentId: string;
}

export interface ServerMapping {
  id: string;
  projectId: string;
  providerId: string;
  dokployServerId: string;
  serverIp: string;
  instanceId: string | null;
  serverStatus: string;
  /**
   * Dockier-owned SSH private key for this server, decrypted. Present only for
   * servers provisioned after command-execution support (migration 0071) —
   * null for older servers, which cannot run commands until re-provisioned.
   */
  sshPrivateKey: string | null;
}

export interface ApplicationMapping {
  id: string;
  projectId: string;
  dokployApplicationId: string;
  dokployServerId: string | null;
  buildType: string;
  /**
   * Dokploy-assigned application `appName` (the Docker Swarm service name),
   * used to locate the running container for command execution. Null for apps
   * configured before this was persisted.
   */
  appName: string | null;
  /**
   * Container port Traefik must forward to, resolved at deploy time where the
   * builder AND the app's runtime are both known. Consumers must prefer this
   * over re-deriving from `buildType`, which cannot distinguish railpack-Node
   * (3000) from railpack-PHP (80). Null for apps deployed before this was
   * persisted — callers fall back to a buildType guess until the next deploy.
   */
  containerPort: number | null;
}

export interface DatabaseMapping {
  id: string;
  projectId: string;
  serviceType: string;
  engine: string;
  dokployDatabaseId: string;
  dbHost: string;
  dbName: string | null;
  dbUser: string | null;
}

// ─── Tenant Project Mappings ───────────────────────────────────────

/**
 * Get existing Dokploy project mapping for an organization.
 */
export async function getTenantProject(organizationId: string): Promise<TenantProjectMapping | null> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_tenant_projects")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to query dokploy_tenant_projects" });
  if (!data) return null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    dokployProjectId: data.dokploy_project_id,
    dokployEnvironmentId: data.dokploy_environment_id,
  };
}

/**
 * Create a tenant→Dokploy project mapping.
 * Uses ON CONFLICT to handle race conditions from concurrent deploys.
 */
export async function createTenantProject(params: {
  organizationId: string;
  dokployProjectId: string;
  dokployEnvironmentId: string;
}): Promise<TenantProjectMapping> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_tenant_projects")
    .upsert(
      {
        organization_id: params.organizationId,
        dokploy_project_id: params.dokployProjectId,
        dokploy_environment_id: params.dokployEnvironmentId,
      },
      { onConflict: "organization_id" },
    )
    .select("*")
    .single();

  const row = unwrapQuery(data, error, DokployMappingError, {
    internalMsg: "Failed to upsert dokploy_tenant_projects",
  });

  return {
    id: row.id,
    organizationId: row.organization_id,
    dokployProjectId: row.dokploy_project_id,
    dokployEnvironmentId: row.dokploy_environment_id,
  };
}

/**
 * Delete the tenant→project mapping row for an organization.
 *
 * Used to clear a stale mapping when the referenced Dokploy project no longer
 * exists (e.g. it was deleted in the Dokploy UI), so the pipeline can recreate
 * or re-adopt cleanly instead of trusting a dangling reference.
 */
export async function deleteTenantProject(organizationId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dokploy_tenant_projects")
    .delete()
    .eq("organization_id", organizationId);

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to delete dokploy_tenant_projects row" });
}

// ─── Server Mappings ───────────────────────────────────────────────

/**
 * Get existing Dokploy server mapping for a project.
 */
export async function getServer(projectId: string): Promise<ServerMapping | null> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_servers")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to query dokploy_servers" });
  if (!data) return null;

  return {
    id: data.id,
    projectId: data.project_id,
    providerId: data.provider_id,
    dokployServerId: data.dokploy_server_id,
    serverIp: data.server_ip,
    instanceId: data.instance_id,
    serverStatus: data.server_status,
    sshPrivateKey: decryptServerKey(data.ssh_private_key_encrypted, data.project_id),
  };
}

/**
 * Decrypt a stored server SSH private key. Returns null (never throws) when the
 * key is absent or can't be decrypted — command execution then reports the key
 * as unavailable rather than crashing an unrelated flow (e.g. a redeploy that
 * only reads the server mapping to reuse the box).
 */
function decryptServerKey(encrypted: string | null, projectId: string): string | null {
  if (!encrypted) return null;
  try {
    return decryptJson(encrypted) as string;
  } catch (err) {
    logger.warn({ err, projectId }, "[dokploy-mappings] Failed to decrypt server SSH key");
    return null;
  }
}

/**
 * Create or update a server mapping for a project.
 * Uses ON CONFLICT on project_id (unique constraint).
 */
export async function upsertServer(params: {
  projectId: string;
  providerId: string;
  dokployServerId: string;
  serverIp: string;
  instanceId?: string;
  serverStatus?: string;
  /**
   * Dockier-owned SSH private key (plaintext) to persist encrypted. Omit to
   * leave any existing stored key untouched — redeploys that only refresh
   * status/ip must not wipe the key they need for command execution.
   */
  sshPrivateKey?: string;
}): Promise<ServerMapping> {
  const row_ = {
    project_id: params.projectId,
    provider_id: params.providerId,
    dokploy_server_id: params.dokployServerId,
    server_ip: params.serverIp,
    instance_id: params.instanceId ?? null,
    server_status: params.serverStatus ?? "provisioning",
    updated_at: nowIso(),
    // Only touch the key column when a new key is supplied, so redeploys that
    // reuse the box preserve the existing encrypted key.
    ...(params.sshPrivateKey ? { ssh_private_key_encrypted: encryptJson(params.sshPrivateKey) } : {}),
  };

  const { data, error } = await supabaseAdmin
    .from("dokploy_servers")
    .upsert(row_, { onConflict: "project_id" })
    .select("*")
    .single();

  const row = unwrapQuery(data, error, DokployMappingError, {
    internalMsg: "Failed to upsert dokploy_servers",
  });

  return {
    id: row.id,
    projectId: row.project_id,
    providerId: row.provider_id,
    dokployServerId: row.dokploy_server_id,
    serverIp: row.server_ip,
    instanceId: row.instance_id,
    serverStatus: row.server_status,
    sshPrivateKey: decryptServerKey(row.ssh_private_key_encrypted, row.project_id),
  };
}

/**
 * Update server status (e.g., provisioning → ready → error).
 */
export async function updateServerStatus(projectId: string, status: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dokploy_servers")
    .update({ server_status: status, updated_at: nowIso() })
    .eq("project_id", projectId);

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to update dokploy_servers status" });
}

/**
 * Delete the server mapping row for a project (used during teardown).
 */
export async function deleteServerMapping(projectId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dokploy_servers")
    .delete()
    .eq("project_id", projectId);

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to delete dokploy_servers row" });
}

// ─── Application Mappings ──────────────────────────────────────────

/**
 * Get existing Dokploy application mapping for a project.
 */
export async function getApplication(projectId: string): Promise<ApplicationMapping | null> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_applications")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to query dokploy_applications" });
  if (!data) return null;

  return {
    id: data.id,
    projectId: data.project_id,
    dokployApplicationId: data.dokploy_application_id,
    dokployServerId: data.dokploy_server_id,
    buildType: data.build_type,
    appName: data.app_name ?? null,
    containerPort: data.container_port ?? null,
  };
}

/**
 * Create or update an application mapping for a project.
 * Uses ON CONFLICT on project_id (unique constraint).
 */
export async function upsertApplication(params: {
  projectId: string;
  dokployApplicationId: string;
  dokployServerId?: string;
  buildType?: string;
  /**
   * Dokploy-assigned `appName` (Swarm service name). Omit to leave an existing
   * stored value untouched — later upserts (e.g. build-type update) shouldn't
   * clobber it.
   */
  appName?: string;
  /**
   * Resolved container port. Omit to leave an existing stored value untouched.
   */
  containerPort?: number;
}): Promise<ApplicationMapping> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_applications")
    .upsert(
      {
        project_id: params.projectId,
        dokploy_application_id: params.dokployApplicationId,
        dokploy_server_id: params.dokployServerId ?? null,
        build_type: params.buildType ?? "nixpacks",
        updated_at: nowIso(),
        ...(params.appName ? { app_name: params.appName } : {}),
        ...(params.containerPort !== undefined ? { container_port: params.containerPort } : {}),
      },
      { onConflict: "project_id" },
    )
    .select("*")
    .single();

  const row = unwrapQuery(data, error, DokployMappingError, {
    internalMsg: "Failed to upsert dokploy_applications",
  });

  return {
    id: row.id,
    projectId: row.project_id,
    dokployApplicationId: row.dokploy_application_id,
    dokployServerId: row.dokploy_server_id,
    buildType: row.build_type,
    appName: row.app_name ?? null,
    containerPort: row.container_port ?? null,
  };
}

/**
 * Delete the application mapping row for a project (used during teardown).
 */
export async function deleteApplicationMapping(projectId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dokploy_applications")
    .delete()
    .eq("project_id", projectId);

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to delete dokploy_applications row" });
}

// ─── Database Mappings ─────────────────────────────────────────────

function rowToDatabaseMapping(data: Record<string, unknown>): DatabaseMapping {
  return {
    id: data.id as string,
    projectId: data.project_id as string,
    serviceType: data.service_type as string,
    engine: data.engine as string,
    dokployDatabaseId: data.dokploy_database_id as string,
    dbHost: data.db_host as string,
    dbName: (data.db_name as string | null) ?? null,
    dbUser: (data.db_user as string | null) ?? null,
  };
}

/**
 * Get the database mapping for a project + service type (e.g. "database",
 * "cache"). A project may have several rows, one per service type.
 */
export async function getDatabase(projectId: string, serviceType: string): Promise<DatabaseMapping | null> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_databases")
    .select("*")
    .eq("project_id", projectId)
    .eq("service_type", serviceType)
    .maybeSingle();

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to query dokploy_databases" });
  if (!data) return null;
  return rowToDatabaseMapping(data);
}

/**
 * Create or update a database mapping.
 * Uses ON CONFLICT on (project_id, service_type).
 */
export async function upsertDatabase(params: {
  projectId: string;
  serviceType: string;
  engine: string;
  dokployDatabaseId: string;
  dbHost: string;
  dbName?: string | null;
  dbUser?: string | null;
}): Promise<DatabaseMapping> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_databases")
    .upsert(
      {
        project_id: params.projectId,
        service_type: params.serviceType,
        engine: params.engine,
        dokploy_database_id: params.dokployDatabaseId,
        db_host: params.dbHost,
        db_name: params.dbName ?? null,
        db_user: params.dbUser ?? null,
        updated_at: nowIso(),
      },
      { onConflict: "project_id,service_type" },
    )
    .select("*")
    .single();

  const row = unwrapQuery(data, error, DokployMappingError, {
    internalMsg: "Failed to upsert dokploy_databases",
  });
  return rowToDatabaseMapping(row);
}

/**
 * All database mapping rows for a project (one per service type).
 *
 * Teardown needs to enumerate them: Dokploy refuses to remove a server that
 * still hosts services, so every provisioned database must be deleted first.
 */
export async function listDatabases(projectId: string): Promise<DatabaseMapping[]> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_databases")
    .select("*")
    .eq("project_id", projectId);

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to list dokploy_databases rows" });
  return (data ?? []).map(rowToDatabaseMapping);
}

/**
 * Delete all database mapping rows for a project (used during teardown).
 */
export async function deleteDatabaseMappings(projectId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dokploy_databases")
    .delete()
    .eq("project_id", projectId);

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to delete dokploy_databases rows" });
}

/**
 * Delete a SINGLE database mapping row for a project + service type. Used to
 * clear a stale mapping when the referenced Dokploy service no longer exists,
 * so the provision stage recreates just that one service (unlike
 * deleteDatabaseMappings, which clears every row for the project).
 */
export async function deleteDatabaseMapping(projectId: string, serviceType: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dokploy_databases")
    .delete()
    .eq("project_id", projectId)
    .eq("service_type", serviceType);

  throwOnError(error, DokployMappingError, { internalMsg: "Failed to delete dokploy_databases row" });
}

// ─── Composite Get-or-Create Helpers ───────────────────────────────
//
// DEPRECATED — NOT USED BY THE PIPELINE, AND NOT SAFE TO WIRE IN AS-IS.
//
// An earlier comment here claimed these were "the primary API for pipeline
// stages". They are not: nothing outside this file's tests calls them, and the
// live stages (ensure-project, provision-server, configure-app,
// provision-databases) each implement their own reconcile instead.
//
// The difference is the point. Every one of these helpers returns a stored
// mapping WITHOUT verifying the Dokploy/cloud resource it references still
// exists, which is the single defect that produced a string of "reused" a
// deleted project / terminated VM / missing application bugs. Specifically:
//   - getOrCreateTenantProject: no projectExists check, no adopt-by-name, and an
//     optimistic `environments[0]` read for the environment id.
//   - getOrCreateServer: no serverExists / VM liveness check, and it treats a
//     "provisioning" row as reusable.
//   - getOrCreateApplication: no applicationExists check, and it never persists
//     appName — wiring it in would silently break command execution.
//
// Prefer the stage implementations. If these are ever revived, they must adopt
// the same verify-then-reconcile shape first.

import type { DokployClient } from "./client.js";

/**
 * Get or create the Dokploy Project for an organization.
 * Creates a new project in Dokploy if no mapping exists yet.
 */
export async function getOrCreateTenantProject(
  organizationId: string,
  organizationName: string,
  client: DokployClient,
): Promise<TenantProjectMapping> {
  const existing = await getTenantProject(organizationId);
  if (existing) return existing;

  // Create project in Dokploy.
  // NOTE: the create response does not embed the default environment on all
  // Dokploy versions. The live pipeline uses stageEnsureProject(), which
  // resolves it robustly (falling back to project.one). If this helper is ever
  // wired into the pipeline, adopt that same resolution instead of the
  // optimistic `environments[0]` read below.
  const project = await client.createProject({ name: organizationName });
  const environmentId = project.environments?.[0]?.environmentId ?? "";

  // Store mapping (upsert handles race condition if two deploys hit this simultaneously)
  return createTenantProject({
    organizationId,
    dokployProjectId: project.projectId,
    dokployEnvironmentId: environmentId,
  });
}

/**
 * Get or create the Dokploy Server for a project.
 * Requires the server to already be provisioned externally — this only
 * handles the Dockier DB mapping + Dokploy registration.
 */
export async function getOrCreateServer(
  projectId: string,
  params: {
    providerId: string;
    dokployServerId: string;
    serverIp: string;
    instanceId?: string;
  },
): Promise<ServerMapping> {
  const existing = await getServer(projectId);
  if (existing && existing.serverStatus !== "error") return existing;

  return upsertServer({
    projectId,
    providerId: params.providerId,
    dokployServerId: params.dokployServerId,
    serverIp: params.serverIp,
    instanceId: params.instanceId,
    serverStatus: "ready",
  });
}

/**
 * Get or create the Dokploy Application for a project.
 * Creates a new application in Dokploy if no mapping exists yet.
 */
export async function getOrCreateApplication(
  projectId: string,
  params: {
    name: string;
    environmentId: string;
    serverId: string;
    buildType?: string;
  },
  client: DokployClient,
): Promise<ApplicationMapping> {
  const existing = await getApplication(projectId);
  if (existing) return existing;

  // Create application in Dokploy
  const app = await client.createApplication({
    name: params.name,
    environmentId: params.environmentId,
    serverId: params.serverId,
  });

  return upsertApplication({
    projectId,
    dokployApplicationId: app.applicationId,
    dokployServerId: params.serverId,
    buildType: params.buildType ?? "nixpacks",
  });
}

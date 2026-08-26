/**
 * Dokploy Mapping Layer
 *
 * Database operations for the dokploy_* tables that track the relationship
 * between Dockier entities and their Dokploy counterparts.
 *
 * All "getOrCreate" functions are concurrency-safe via INSERT ON CONFLICT.
 */

import { supabaseAdmin } from "../../../../shared/supabase/client.js";

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
}

export interface ApplicationMapping {
  id: string;
  projectId: string;
  dokployApplicationId: string;
  dokployServerId: string | null;
  buildType: string;
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

  if (error) throw new Error(`Failed to query dokploy_tenant_projects: ${error.message}`);
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

  if (error) throw new Error(`Failed to upsert dokploy_tenant_projects: ${error.message}`);

  return {
    id: data.id,
    organizationId: data.organization_id,
    dokployProjectId: data.dokploy_project_id,
    dokployEnvironmentId: data.dokploy_environment_id,
  };
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

  if (error) throw new Error(`Failed to query dokploy_servers: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    projectId: data.project_id,
    providerId: data.provider_id,
    dokployServerId: data.dokploy_server_id,
    serverIp: data.server_ip,
    instanceId: data.instance_id,
    serverStatus: data.server_status,
  };
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
}): Promise<ServerMapping> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_servers")
    .upsert(
      {
        project_id: params.projectId,
        provider_id: params.providerId,
        dokploy_server_id: params.dokployServerId,
        server_ip: params.serverIp,
        instance_id: params.instanceId ?? null,
        server_status: params.serverStatus ?? "provisioning",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to upsert dokploy_servers: ${error.message}`);

  return {
    id: data.id,
    projectId: data.project_id,
    providerId: data.provider_id,
    dokployServerId: data.dokploy_server_id,
    serverIp: data.server_ip,
    instanceId: data.instance_id,
    serverStatus: data.server_status,
  };
}

/**
 * Update server status (e.g., provisioning → ready → error).
 */
export async function updateServerStatus(projectId: string, status: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("dokploy_servers")
    .update({ server_status: status, updated_at: new Date().toISOString() })
    .eq("project_id", projectId);

  if (error) throw new Error(`Failed to update dokploy_servers status: ${error.message}`);
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

  if (error) throw new Error(`Failed to query dokploy_applications: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    projectId: data.project_id,
    dokployApplicationId: data.dokploy_application_id,
    dokployServerId: data.dokploy_server_id,
    buildType: data.build_type,
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
}): Promise<ApplicationMapping> {
  const { data, error } = await supabaseAdmin
    .from("dokploy_applications")
    .upsert(
      {
        project_id: params.projectId,
        dokploy_application_id: params.dokployApplicationId,
        dokploy_server_id: params.dokployServerId ?? null,
        build_type: params.buildType ?? "nixpacks",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to upsert dokploy_applications: ${error.message}`);

  return {
    id: data.id,
    projectId: data.project_id,
    dokployApplicationId: data.dokploy_application_id,
    dokployServerId: data.dokploy_server_id,
    buildType: data.build_type,
  };
}

// ─── Composite Get-or-Create Helpers ───────────────────────────────
// These are the primary API for pipeline stages. They return existing
// mappings or create new ones atomically (via upsert).

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

  // Create project in Dokploy
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

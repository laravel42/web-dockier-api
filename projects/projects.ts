import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

export interface PostDeployCommand {
  command: string;
  enabled: boolean;
  continueOnFailure: boolean;
  timeout?: number;
}

export interface ProjectConfig {
  postDeployCommands?: PostDeployCommand[];
}

interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  platform: string;
  sourceType: string;
  template: string;
  config: ProjectConfig;
  createdAt: string;
}

export const createProject = api(
  { expose: true, method: "POST", path: "/projects", auth: true },
  async (params: { name: string; repository: string; branch: string; connectionId: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig }): Promise<Project> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const sourceType = params.sourceType || "repository";
    const template = params.template || "";
    const config = params.config || {};
    await db.exec`
      INSERT INTO projects (id, app_id, name, repository, branch, connection_id, platform, source_type, template, config, created_at)
      VALUES (${id}, ${authData.appId}, ${params.name}, ${params.repository}, ${params.branch}, ${params.connectionId || ""}, ${params.platform || ""}, ${sourceType}, ${template}, ${JSON.stringify(config)}, NOW())`;
    return { id, name: params.name, repository: params.repository, branch: params.branch, connectionId: params.connectionId || "", platform: params.platform || "", sourceType, template, config, createdAt: new Date().toISOString() };
  }
);

export const getProject = api(
  { expose: true, method: "GET", path: "/projects/:projectId", auth: true },
  async (params: { projectId: string }): Promise<Project> => {
    const authData = getAuthData()!;
    const row = await db.queryRow<{
      id: string; app_id: string; name: string; repository: string; branch: string; connection_id: string; platform: string; source_type: string; template: string; config: string; created_at: Date;
    }>`SELECT id, app_id, name, repository, branch, connection_id, platform, source_type, template, config, created_at FROM projects WHERE id = ${params.projectId}`;
    if (!row) throw APIError.notFound("Project not found");
    if (row.app_id !== authData.appId) throw APIError.permissionDenied("Not your project");
    const config = typeof row.config === "string" ? JSON.parse(row.config) : (row.config || {});
    return { id: row.id, name: row.name, repository: row.repository, branch: row.branch, connectionId: row.connection_id, platform: row.platform, sourceType: row.source_type, template: row.template, config, createdAt: row.created_at.toISOString() };
  }
);

export const listProjects = api(
  { expose: true, method: "GET", path: "/projects", auth: true },
  async (): Promise<{ projects: Project[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{
      id: string; name: string; repository: string; branch: string; connection_id: string; platform: string; source_type: string; template: string; config: string; created_at: Date;
    }>`SELECT id, name, repository, branch, connection_id, platform, source_type, template, config, created_at FROM projects WHERE app_id = ${authData.appId} ORDER BY created_at DESC`;
    const projects: Project[] = [];
    for await (const row of rows) {
      const config = typeof row.config === "string" ? JSON.parse(row.config) : (row.config || {});
      projects.push({ id: row.id, name: row.name, repository: row.repository, branch: row.branch, connectionId: row.connection_id, platform: row.platform, sourceType: row.source_type, template: row.template, config, createdAt: row.created_at.toISOString() });
    }
    return { projects };
  }
);

export const updateProject = api(
  { expose: true, method: "PUT", path: "/projects/:projectId", auth: true },
  async (params: { projectId: string; name?: string; repository?: string; branch?: string; connectionId?: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig }): Promise<Project> => {
    const authData = getAuthData()!;
    const existing = await db.queryRow<{ id: string; app_id: string }>`SELECT id, app_id FROM projects WHERE id = ${params.projectId}`;
    if (!existing) throw APIError.notFound("Project not found");
    if (existing.app_id !== authData.appId) throw APIError.permissionDenied("Not your project");
    if (params.name !== undefined) await db.exec`UPDATE projects SET name = ${params.name}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.repository !== undefined) await db.exec`UPDATE projects SET repository = ${params.repository}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.branch !== undefined) await db.exec`UPDATE projects SET branch = ${params.branch}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.connectionId !== undefined) await db.exec`UPDATE projects SET connection_id = ${params.connectionId}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.platform !== undefined) await db.exec`UPDATE projects SET platform = ${params.platform}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.sourceType !== undefined) await db.exec`UPDATE projects SET source_type = ${params.sourceType}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.template !== undefined) await db.exec`UPDATE projects SET template = ${params.template}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.config !== undefined) {
      // Validate post-deploy commands
      if (params.config.postDeployCommands) {
        if (params.config.postDeployCommands.length > 20) {
          throw APIError.invalidArgument("Maximum 20 post-deploy commands allowed");
        }
        for (const cmd of params.config.postDeployCommands) {
          if (!cmd.command || cmd.command.length > 500) {
            throw APIError.invalidArgument("Each command must be 1-500 characters");
          }
        }
      }
      // Merge with existing config to avoid wiping other fields
      const existingRow = await db.queryRow<{ config: string }>`SELECT config FROM projects WHERE id = ${params.projectId}`;
      const existingConfig = existingRow?.config ? (typeof existingRow.config === "string" ? JSON.parse(existingRow.config) : existingRow.config) : {};
      const mergedConfig = { ...existingConfig, ...params.config };
      await db.exec`UPDATE projects SET config = ${JSON.stringify(mergedConfig)}, updated_at = NOW() WHERE id = ${params.projectId}`;
    }
    const row = await db.queryRow<{ id: string; name: string; repository: string; branch: string; connection_id: string; platform: string; source_type: string; template: string; config: string; created_at: Date }>`SELECT id, name, repository, branch, connection_id, platform, source_type, template, config, created_at FROM projects WHERE id = ${params.projectId}`;
    const config = typeof row!.config === "string" ? JSON.parse(row!.config) : (row!.config || {});
    return { id: row!.id, name: row!.name, repository: row!.repository, branch: row!.branch, connectionId: row!.connection_id, platform: row!.platform, sourceType: row!.source_type, template: row!.template, config, createdAt: row!.created_at.toISOString() };
  }
);

export const deleteProject = api(
  { expose: true, method: "DELETE", path: "/projects/:projectId", auth: true },
  async (params: { projectId: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    const existing = await db.queryRow<{ id: string; app_id: string }>`SELECT id, app_id FROM projects WHERE id = ${params.projectId}`;
    if (!existing) throw APIError.notFound("Project not found");
    if (existing.app_id !== authData.appId) throw APIError.permissionDenied("Not your project");
    await db.exec`DELETE FROM projects WHERE id = ${params.projectId}`;
    return { success: true };
  }
);

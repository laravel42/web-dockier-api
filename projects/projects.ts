import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

interface Project {
  id: string;
  userId: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  platform: string;
  createdAt: string;
}

export const createProject = api(
  { method: "POST", path: "/projects", auth: true },
  async (params: { name: string; repository: string; branch: string; connectionId: string; platform?: string }): Promise<Project> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    await db.exec`
      INSERT INTO projects (id, user_id, name, repository, branch, connection_id, platform, created_at)
      VALUES (${id}, ${authData.userID}, ${params.name}, ${params.repository}, ${params.branch}, ${params.connectionId || ""}, ${params.platform || ""}, NOW())`;
    return { id, userId: authData.userID, name: params.name, repository: params.repository, branch: params.branch, connectionId: params.connectionId || "", platform: params.platform || "", createdAt: new Date().toISOString() };
  }
);
export const getProject = api(
  { method: "GET", path: "/projects/:projectId", auth: true },
  async (params: { projectId: string }): Promise<Project> => {
    const row = await db.queryRow<{
      id: string; user_id: string; name: string; repository: string; branch: string; connection_id: string; platform: string; created_at: Date;
    }>`SELECT id, user_id, name, repository, branch, connection_id, platform, created_at FROM projects WHERE id = ${params.projectId}`;
    if (!row) throw APIError.notFound("Project not found");
    return { id: row.id, userId: row.user_id, name: row.name, repository: row.repository, branch: row.branch, connectionId: row.connection_id, platform: row.platform, createdAt: row.created_at.toISOString() };
  }
);


export const listProjects = api(
  { method: "GET", path: "/projects", auth: true },
  async (): Promise<{ projects: Project[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{
      id: string; user_id: string; name: string; repository: string; branch: string; connection_id: string; platform: string; created_at: Date;
    }>`SELECT id, user_id, name, repository, branch, connection_id, platform, created_at FROM projects WHERE user_id = ${authData.userID} ORDER BY created_at DESC`;
    const projects: Project[] = [];
    for await (const row of rows) {
      projects.push({ id: row.id, userId: row.user_id, name: row.name, repository: row.repository, branch: row.branch, connectionId: row.connection_id, platform: row.platform, createdAt: row.created_at.toISOString() });
    }
    return { projects };
  }
);

export const updateProject = api(
  { method: "PUT", path: "/projects/:projectId", auth: true },
  async (params: { projectId: string; name?: string; repository?: string; branch?: string; connectionId?: string; platform?: string }): Promise<Project> => {
    const existing = await db.queryRow<{ id: string }>`SELECT id FROM projects WHERE id = ${params.projectId}`;
    if (!existing) throw APIError.notFound("Project not found");
    if (params.name !== undefined) await db.exec`UPDATE projects SET name = ${params.name}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.repository !== undefined) await db.exec`UPDATE projects SET repository = ${params.repository}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.branch !== undefined) await db.exec`UPDATE projects SET branch = ${params.branch}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.connectionId !== undefined) await db.exec`UPDATE projects SET connection_id = ${params.connectionId}, updated_at = NOW() WHERE id = ${params.projectId}`;
    if (params.platform !== undefined) await db.exec`UPDATE projects SET platform = ${params.platform}, updated_at = NOW() WHERE id = ${params.projectId}`;
    const row = await db.queryRow<{ id: string; user_id: string; name: string; repository: string; branch: string; connection_id: string; platform: string; created_at: Date }>`SELECT id, user_id, name, repository, branch, connection_id, platform, created_at FROM projects WHERE id = ${params.projectId}`;
    return { id: row!.id, userId: row!.user_id, name: row!.name, repository: row!.repository, branch: row!.branch, connectionId: row!.connection_id, platform: row!.platform, createdAt: row!.created_at.toISOString() };
  }
);

export const deleteProject = api(
  { method: "DELETE", path: "/projects/:projectId", auth: true },
  async (params: { projectId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM projects WHERE id = ${params.projectId}`;
    return { success: true };
  }
);

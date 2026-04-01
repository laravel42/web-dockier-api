import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, type GitConnectionResponse } from "../shared";

export const addConnection = api(
  { method: "POST", path: "/git/connections", auth: true },
  async (params: {
    provider: "github" | "gitlab" | "gitlab_self_hosted" | "bitbucket";
    personalToken: string;
    label: string;
    repoUrl: string;
    endpoint: string;
  }): Promise<GitConnectionResponse> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM git_connections WHERE user_id = ${authData.userID} AND provider = ${params.provider} AND label = ${params.label}`;
    if (existing) throw APIError.alreadyExists(`A ${params.provider} connection with label "${params.label}" already exists`);
    await db.exec`
      INSERT INTO git_connections (id, user_id, provider, personal_token, label, repo_url, endpoint, created_at)
      VALUES (${id}, ${authData.userID}, ${params.provider}, ${params.personalToken}, ${params.label}, ${params.repoUrl}, ${params.endpoint || ""}, NOW())`;
    return { id, userId: authData.userID, provider: params.provider, label: params.label, repoUrl: params.repoUrl, endpoint: params.endpoint || "", createdAt: new Date().toISOString() };
  }
);

export const listConnections = api(
  { method: "GET", path: "/git/connections", auth: true },
  async (): Promise<{ connections: GitConnectionResponse[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{ id: string; user_id: string; provider: string; label: string; repo_url: string; endpoint: string; created_at: Date }>`
      SELECT id, user_id, provider, label, repo_url, endpoint, created_at FROM git_connections WHERE user_id = ${authData.userID} ORDER BY created_at DESC`;
    const connections: GitConnectionResponse[] = [];
    for await (const row of rows) {
      connections.push({ id: row.id, userId: row.user_id, provider: row.provider, label: row.label, repoUrl: row.repo_url, endpoint: row.endpoint, createdAt: row.created_at.toISOString() });
    }
    return { connections };
  }
);

export const deleteConnection = api(
  { method: "DELETE", path: "/git/connections/:connectionId", auth: true },
  async (params: { connectionId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM git_connections WHERE id = ${params.connectionId}`;
    return { success: true };
  }
);

export const updateConnection = api(
  { method: "PUT", path: "/git/connections/:connectionId", auth: true },
  async (params: { connectionId: string; label: string }): Promise<GitConnectionResponse> => {
    const row = await db.queryRow<{ id: string; user_id: string; provider: string; label: string; repo_url: string; endpoint: string; created_at: Date }>`
      SELECT id, user_id, provider, label, repo_url, endpoint, created_at FROM git_connections WHERE id = ${params.connectionId}`;
    if (!row) throw APIError.notFound("Connection not found");
    await db.exec`UPDATE git_connections SET label = ${params.label} WHERE id = ${params.connectionId}`;
    return { id: row.id, userId: row.user_id, provider: row.provider, label: params.label, repoUrl: row.repo_url, endpoint: row.endpoint, createdAt: row.created_at.toISOString() };
  }
);

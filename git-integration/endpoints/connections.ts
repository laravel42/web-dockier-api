import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, type GitConnectionResponse } from "../shared";

export const addConnection = api(
  { expose: true, method: "POST", path: "/git/connections", auth: true },
  async (params: {
    provider: "github" | "gitlab" | "gitlabSelfHosted" | "bitbucket";
    personalToken: string;
    label: string;
    repoUrl: string;
    endpoint: string;
  }): Promise<GitConnectionResponse> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    console.log(`[addConnection] provider=${params.provider} label=${params.label} appId=${authData.appId} endpoint=${params.endpoint}`);
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM git_connections WHERE app_id = ${authData.appId} AND provider = ${params.provider} AND label = ${params.label}`;
    if (existing) throw APIError.alreadyExists(`A ${params.provider} connection with label "${params.label}" already exists`);
    await db.exec`
      INSERT INTO git_connections (id, app_id, provider, personal_token, label, repo_url, endpoint, created_at)
      VALUES (${id}, ${authData.appId}, ${params.provider}, ${params.personalToken}, ${params.label}, ${params.repoUrl}, ${params.endpoint || ""}, NOW())`;
    // Verify it was persisted
    const verify = await db.queryRow<{ id: string }>`SELECT id FROM git_connections WHERE id = ${id}`;
    console.log(`[addConnection] inserted id=${id} verified=${!!verify}`);
    return { id, provider: params.provider, label: params.label, repoUrl: params.repoUrl, endpoint: params.endpoint || "", createdAt: new Date().toISOString() };
  }
);

export const listConnections = api(
  { expose: true, method: "GET", path: "/git/connections", auth: true },
  async (): Promise<{ connections: GitConnectionResponse[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{ id: string; provider: string; label: string; repo_url: string; endpoint: string; created_at: Date }>`
      SELECT id, provider, label, repo_url, endpoint, created_at FROM git_connections WHERE app_id = ${authData.appId} ORDER BY created_at DESC`;
    const connections: GitConnectionResponse[] = [];
    for await (const row of rows) {
      connections.push({ id: row.id, provider: row.provider, label: row.label, repoUrl: row.repo_url, endpoint: row.endpoint, createdAt: row.created_at.toISOString() });
    }
    return { connections };
  }
);

export const deleteConnection = api(
  { expose: true, method: "DELETE", path: "/git/connections/:connectionId", auth: true },
  async (params: { connectionId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM git_connections WHERE id = ${params.connectionId}`;
    return { success: true };
  }
);

export const updateConnection = api(
  { expose: true, method: "PUT", path: "/git/connections/:connectionId", auth: true },
  async (params: { connectionId: string; label: string }): Promise<GitConnectionResponse> => {
    const row = await db.queryRow<{ id: string; provider: string; label: string; repo_url: string; endpoint: string; created_at: Date }>`
      SELECT id, provider, label, repo_url, endpoint, created_at FROM git_connections WHERE id = ${params.connectionId}`;
    if (!row) throw APIError.notFound("Connection not found");
    await db.exec`UPDATE git_connections SET label = ${params.label} WHERE id = ${params.connectionId}`;
    return { id: row.id, provider: row.provider, label: params.label, repoUrl: row.repo_url, endpoint: row.endpoint, createdAt: row.created_at.toISOString() };
  }
);

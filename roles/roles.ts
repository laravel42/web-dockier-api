import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
}

export const createRole = api(
  { method: "POST", path: "/roles", auth: true },
  async (params: { name: string; description?: string; permissions: string[] }): Promise<Role> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    await db.exec`INSERT INTO roles (id, user_id, name, description, permissions, created_at)
      VALUES (${id}, ${authData.userID}, ${params.name}, ${params.description || ""}, ${params.permissions}, NOW())`;
    return { id, name: params.name, description: params.description || "", permissions: params.permissions, createdAt: new Date().toISOString() };
  }
);

export const listRoles = api(
  { method: "GET", path: "/roles", auth: true },
  async (): Promise<{ roles: Role[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{ id: string; name: string; description: string; permissions: string[]; created_at: Date }>`
      SELECT id, name, description, permissions, created_at FROM roles WHERE user_id = ${authData.userID} ORDER BY created_at DESC`;
    const roles: Role[] = [];
    for await (const r of rows) roles.push({ id: r.id, name: r.name, description: r.description, permissions: r.permissions || [], createdAt: r.created_at.toISOString() });
    return { roles };
  }
);

export const deleteRole = api(
  { method: "DELETE", path: "/roles/:roleId", auth: true },
  async (params: { roleId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM roles WHERE id = ${params.roleId}`;
    return { success: true };
  }
);

export const updateRole = api(
  { method: "PUT", path: "/roles/:roleId", auth: true },
  async (params: { roleId: string; name?: string; description?: string; permissions?: string[] }): Promise<Role> => {
    const existing = await db.queryRow<{ id: string }>`SELECT id FROM roles WHERE id = ${params.roleId}`;
    if (!existing) throw APIError.notFound("Role not found");
    if (params.name !== undefined) await db.exec`UPDATE roles SET name = ${params.name} WHERE id = ${params.roleId}`;
    if (params.description !== undefined) await db.exec`UPDATE roles SET description = ${params.description} WHERE id = ${params.roleId}`;
    if (params.permissions !== undefined) await db.exec`UPDATE roles SET permissions = ${params.permissions} WHERE id = ${params.roleId}`;
    const row = await db.queryRow<{ id: string; name: string; description: string; permissions: string[]; created_at: Date }>`
      SELECT id, name, description, permissions, created_at FROM roles WHERE id = ${params.roleId}`;
    return { id: row!.id, name: row!.name, description: row!.description, permissions: row!.permissions || [], createdAt: row!.created_at.toISOString() };
  }
);

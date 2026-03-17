import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { v4 as uuidv4 } from "uuid";

const db = new SQLDatabase("groups", { migrations: "./migrations" });

// ─── Interfaces ───

interface Group {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
}

interface GroupMember {
  userId: string;
  groupId: string;
  roleId: string;
  roleName: string;
  joinedAt: string;
}

// ─── Groups CRUD ───

export const createGroup = api(
  { method: "POST", path: "/groups", auth: true },
  async (params: {
    name: string;
    description?: string;
  }): Promise<Group> => {
    const id = uuidv4();
    const desc = params.description || "";
    await db.exec`
      INSERT INTO groups (id, name, description, created_at)
      VALUES (${id}, ${params.name}, ${desc}, NOW())`;
    return { id, name: params.name, description: desc, createdAt: new Date().toISOString() };
  }
);

export const listGroups = api(
  { method: "GET", path: "/groups", auth: true },
  async (): Promise<{ groups: Group[] }> => {
    const rows = db.query<{
      id: string; name: string; description: string; created_at: Date;
    }>`SELECT id, name, description, created_at FROM groups ORDER BY created_at DESC`;

    const groups: Group[] = [];
    for await (const row of rows) {
      groups.push({
        id: row.id, name: row.name, description: row.description,
        createdAt: row.created_at.toISOString(),
      });
    }
    return { groups };
  }
);

export const getGroup = api(
  { method: "GET", path: "/groups/:groupId", auth: true },
  async (params: { groupId: string }): Promise<Group> => {
    const row = await db.queryRow<{
      id: string; name: string; description: string; created_at: Date;
    }>`SELECT id, name, description, created_at FROM groups WHERE id = ${params.groupId}`;
    if (!row) throw APIError.notFound("Group not found");
    return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at.toISOString() };
  }
);

export const updateGroup = api(
  { method: "PUT", path: "/groups/:groupId", auth: true },
  async (params: { groupId: string; name?: string; description?: string }): Promise<Group> => {
    if (params.name) await db.exec`UPDATE groups SET name = ${params.name} WHERE id = ${params.groupId}`;
    if (params.description !== undefined) await db.exec`UPDATE groups SET description = ${params.description} WHERE id = ${params.groupId}`;
    return getGroup({ groupId: params.groupId });
  }
);

export const deleteGroup = api(
  { method: "DELETE", path: "/groups/:groupId", auth: true },
  async (params: { groupId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM groups WHERE id = ${params.groupId}`;
    return { success: true };
  }
);

// ─── Roles CRUD ───

export const createRole = api(
  { method: "POST", path: "/roles", auth: true },
  async (params: { name: string; description?: string; permissions: string[] }): Promise<Role> => {
    const id = uuidv4();
    const desc = params.description || "";
    const perms = JSON.stringify(params.permissions);
    await db.exec`
      INSERT INTO roles (id, name, description, permissions, created_at)
      VALUES (${id}, ${params.name}, ${desc}, ${perms}, NOW())`;
    return { id, name: params.name, description: desc, permissions: params.permissions, createdAt: new Date().toISOString() };
  }
);

export const listRoles = api(
  { method: "GET", path: "/roles", auth: true },
  async (): Promise<{ roles: Role[] }> => {
    const rows = db.query<{
      id: string; name: string; description: string; permissions: string; created_at: Date;
    }>`SELECT id, name, description, permissions, created_at FROM roles ORDER BY name`;

    const roles: Role[] = [];
    for await (const row of rows) {
      roles.push({
        id: row.id, name: row.name, description: row.description,
        permissions: JSON.parse(row.permissions),
        createdAt: row.created_at.toISOString(),
      });
    }
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
    if (params.permissions !== undefined) await db.exec`UPDATE roles SET permissions = ${JSON.stringify(params.permissions)} WHERE id = ${params.roleId}`;
    const row = await db.queryRow<{ id: string; name: string; description: string; permissions: string; created_at: Date }>`SELECT id, name, description, permissions, created_at FROM roles WHERE id = ${params.roleId}`;
    return { id: row!.id, name: row!.name, description: row!.description, permissions: JSON.parse(row!.permissions), createdAt: row!.created_at.toISOString() };
  }
);

// ─── Group Membership ───

export const addMember = api(
  { method: "POST", path: "/groups/:groupId/members", auth: true },
  async (params: { groupId: string; userId: string; roleId: string }): Promise<GroupMember> => {
    const id = uuidv4();
    await db.exec`
      INSERT INTO group_members (id, group_id, user_id, role_id, joined_at)
      VALUES (${id}, ${params.groupId}, ${params.userId}, ${params.roleId}, NOW())`;

    const role = await db.queryRow<{ name: string }>`SELECT name FROM roles WHERE id = ${params.roleId}`;
    return {
      userId: params.userId, groupId: params.groupId,
      roleId: params.roleId, roleName: role?.name || "",
      joinedAt: new Date().toISOString(),
    };
  }
);

export const listMembers = api(
  { method: "GET", path: "/groups/:groupId/members", auth: true },
  async (params: { groupId: string }): Promise<{ members: GroupMember[] }> => {
    const rows = db.query<{
      user_id: string; group_id: string; role_id: string; role_name: string; joined_at: Date;
    }>`SELECT gm.user_id, gm.group_id, gm.role_id, r.name as role_name, gm.joined_at
       FROM group_members gm JOIN roles r ON gm.role_id = r.id
       WHERE gm.group_id = ${params.groupId}`;

    const members: GroupMember[] = [];
    for await (const row of rows) {
      members.push({
        userId: row.user_id, groupId: row.group_id,
        roleId: row.role_id, roleName: row.role_name,
        joinedAt: row.joined_at.toISOString(),
      });
    }
    return { members };
  }
);

export const removeMember = api(
  { method: "DELETE", path: "/groups/:groupId/members/:userId", auth: true },
  async (params: { groupId: string; userId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM group_members WHERE group_id = ${params.groupId} AND user_id = ${params.userId}`;
    return { success: true };
  }
);

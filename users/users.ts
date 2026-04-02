import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { getAuthData } from "~encore/auth";
import { db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");
initDb(DatabaseUrl());

// ─── Interfaces ───

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  country: string;
  language: string;
  timezone: string;
  createdAt: string;
}

interface UpdateUserParams {
  userId: string;
  name?: string;
  avatarUrl?: string;
  country?: string;
  language?: string;
  timezone?: string;
}

interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
}

interface ListUsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

// ─── Helpers ───

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  country: string;
  language: string;
  timezone: string;
  created_at: Date;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url || undefined,
    country: row.country,
    language: row.language,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}

async function ensureUser(userId: string): Promise<UserRow> {
  let user = await db.queryRow<UserRow>`
    SELECT id, email, name, avatar_url, country, language, timezone, created_at FROM users WHERE id = ${userId}`;
  if (user) return user;

  const authData = getAuthData();
  if (!authData || authData.userID !== userId) {
    throw APIError.notFound("User not found");
  }

  await db.exec`
    INSERT INTO users (id, email, name, created_at)
    VALUES (${authData.userID}, ${authData.email}, '', NOW())
    ON CONFLICT (id) DO NOTHING`;

  user = await db.queryRow<UserRow>`
    SELECT id, email, name, avatar_url, country, language, timezone, created_at FROM users WHERE id = ${userId}`;
  if (!user) throw APIError.notFound("User not found");
  return user;
}

// ─── Create User ───

export const createUser = api(
  { method: "POST", path: "/users", auth: true },
  async (params: {
    email: string;
    name: string;
    country?: string;
    language?: string;
    timezone?: string;
  }): Promise<User> => {
    const { v4: uuidv4 } = await import("uuid");
    const id = uuidv4();

    const existing = await db.queryRow<{ id: string }>`SELECT id FROM users WHERE email = ${params.email}`;
    if (existing) throw APIError.alreadyExists("A user with this email already exists");

    await db.exec`
      INSERT INTO users (id, email, name, country, language, timezone, created_at)
      VALUES (${id}, ${params.email}, ${params.name}, ${params.country || ""}, ${params.language || "en"}, ${params.timezone || "UTC"}, NOW())`;

    const row = await db.queryRow<UserRow>`
      SELECT id, email, name, avatar_url, country, language, timezone, created_at FROM users WHERE id = ${id}`;
    if (!row) throw APIError.internal("Failed to create user");
    return toUser(row);
  }
);

// ─── Get User ───

export const getUser = api(
  { method: "GET", path: "/users/:userId", auth: true },
  async (params: { userId: string }): Promise<User> => {
    return toUser(await ensureUser(params.userId));
  }
);

// ─── List Users ───

export const listUsers = api(
  { method: "GET", path: "/users", auth: true },
  async (params: ListUsersParams): Promise<ListUsersResponse> => {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    let users: User[];
    let total: number;

    if (params.search) {
      const searchPattern = `%${params.search}%`;
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int as count FROM users
        WHERE name ILIKE ${searchPattern} OR email ILIKE ${searchPattern}`;
      total = countRow?.count || 0;

      const rows = db.query<{
        id: string;
        email: string;
        name: string;
        avatar_url: string | null;
        country: string;
        language: string;
        timezone: string;
        created_at: Date;
      }>`SELECT id, email, name, avatar_url, country, language, timezone, created_at FROM users
         WHERE name ILIKE ${searchPattern} OR email ILIKE ${searchPattern}
         ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      users = [];
      for await (const row of rows) {
        users.push({
          id: row.id,
          email: row.email,
          name: row.name,
          avatarUrl: row.avatar_url || undefined,
          country: row.country,
          language: row.language,
          timezone: row.timezone,
          createdAt: row.created_at.toISOString(),
        });
      }
    } else {
      const countRow = await db.queryRow<{ count: number }>`
        SELECT COUNT(*)::int as count FROM users`;
      total = countRow?.count || 0;

      const rows = db.query<{
        id: string;
        email: string;
        name: string;
        avatar_url: string | null;
        country: string;
        language: string;
        timezone: string;
        created_at: Date;
      }>`SELECT id, email, name, avatar_url, country, language, timezone, created_at FROM users
         ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      users = [];
      for await (const row of rows) {
        users.push({
          id: row.id,
          email: row.email,
          name: row.name,
          avatarUrl: row.avatar_url || undefined,
          country: row.country,
          language: row.language,
          timezone: row.timezone,
          createdAt: row.created_at.toISOString(),
        });
      }
    }

    return { users, total, page, limit };
  }
);

// ─── Update User ───

export const updateUser = api(
  { method: "PUT", path: "/users/:userId", auth: true },
  async (params: UpdateUserParams): Promise<User> => {
    await ensureUser(params.userId);

    if (params.name !== undefined) {
      await db.exec`UPDATE users SET name = ${params.name}, updated_at = NOW() WHERE id = ${params.userId}`;
    }
    if (params.avatarUrl !== undefined) {
      await db.exec`UPDATE users SET avatar_url = ${params.avatarUrl}, updated_at = NOW() WHERE id = ${params.userId}`;
    }
    if (params.country !== undefined) {
      await db.exec`UPDATE users SET country = ${params.country}, updated_at = NOW() WHERE id = ${params.userId}`;
    }
    if (params.language !== undefined) {
      await db.exec`UPDATE users SET language = ${params.language}, updated_at = NOW() WHERE id = ${params.userId}`;
    }
    if (params.timezone !== undefined) {
      await db.exec`UPDATE users SET timezone = ${params.timezone}, updated_at = NOW() WHERE id = ${params.userId}`;
    }

    const updated = await db.queryRow<UserRow>`
      SELECT id, email, name, avatar_url, country, language, timezone, created_at FROM users WHERE id = ${params.userId}`;
    if (!updated) throw APIError.notFound("User not found");
    return toUser(updated);
  }
);

// ─── Delete User ───

export const deleteUser = api(
  { method: "DELETE", path: "/users/:userId", auth: true },
  async (params: { userId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM users WHERE id = ${params.userId}`;
    return { success: true };
  }
);

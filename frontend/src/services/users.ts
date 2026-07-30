import { request } from "./request";
import { buildQuery } from "./query";

export const usersApi = {
  list: (params?: { limit?: number; offset?: number; search?: string }) =>
    request<{
      users: Array<{
        id: string;
        email: string;
        name: string;
        avatarUrl?: string;
        roleId: string;
        roleName: string;
        isOwner: boolean;
        createdAt: string;
      }>;
      pagination: { total: number; limit: number; offset: number };
    }>(`/users${buildQuery(params)}`),

  get: (userId: string) =>
    request<{
      id: string;
      email: string;
      name: string;
      avatarUrl?: string;
      country: string;
      language: string;
      timezone: string;
      roleId: string;
      roleName: string;
      createdAt: string;
    }>(`/users/${userId}`),

  create: (data: { email: string; name: string; password?: string; country?: string; language?: string; timezone?: string; roleId?: string }) =>
    request("/users", { method: "POST", body: JSON.stringify(data) }),

  update: (userId: string, data: { name?: string; avatarUrl?: string; country?: string; language?: string; timezone?: string; roleId?: string }) =>
    request(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (userId: string) =>
    request(`/users/${userId}`, { method: "DELETE" }),
};

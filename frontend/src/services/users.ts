import { request } from "./request";

export const usersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.search) qs.set("search", params.search);
    const q = qs.toString();
    return request<{
      users: Array<{
        id: string;
        email: string;
        name: string;
        avatarUrl?: string;
        roleId: string;
        roleName: string;
        createdAt: string;
      }>;
      total: number;
    }>(`/users${q ? `?${q}` : ""}`);
  },

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
      body: JSON.stringify({ userId, ...data }),
    }),

  delete: (userId: string) =>
    request(`/users/${userId}`, { method: "DELETE" }),
};

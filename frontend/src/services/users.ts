import { request } from "./request";

export const usersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    request<{
      users: Array<{
        id: string;
        email: string;
        name: string;
        avatarUrl?: string;
        createdAt: string;
      }>;
      total: number;
    }>(`/users?${new URLSearchParams(params as Record<string, string>)}`),

  get: (userId: string) =>
    request<{
      id: string;
      email: string;
      name: string;
      avatarUrl?: string;
      country: string;
      language: string;
      timezone: string;
      createdAt: string;
    }>(`/users/${userId}`),

  create: (data: { email: string; name: string; country?: string; language?: string; timezone?: string }) =>
    request("/users", { method: "POST", body: JSON.stringify(data) }),

  update: (userId: string, data: { name?: string; avatarUrl?: string; country?: string; language?: string; timezone?: string }) =>
    request(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ userId, ...data }),
    }),

  delete: (userId: string) =>
    request(`/users/${userId}`, { method: "DELETE" }),
};

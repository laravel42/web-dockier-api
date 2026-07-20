import { request } from "./request";
import type { Project, ProjectConfig } from "../types";

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ListProjectsParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export const projectsApi = {
  list: (params?: ListProjectsParams) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    if (params?.search) searchParams.set("search", params.search);
    const qs = searchParams.toString();
    return request<{ projects: Project[]; pagination: PaginationMeta }>(
      `/projects${qs ? `?${qs}` : ""}`,
    );
  },

  get: (projectId: string) =>
    request<Project>(`/projects/${projectId}`),

  create: (data: { name: string; repository: string; branch: string; connectionId: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig }) =>
    request("/projects", { method: "POST", body: JSON.stringify(data) }),

  update: (projectId: string, data: { name?: string; repository?: string; branch?: string; connectionId?: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig; settings?: Record<string, unknown> }) =>
    request<Project>(`/projects/${projectId}`, { method: "PUT", body: JSON.stringify({ projectId, ...data }) }),

  delete: (projectId: string) =>
    request(`/projects/${projectId}`, { method: "DELETE" }),
};

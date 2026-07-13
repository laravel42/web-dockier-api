import { request } from "./request";
import type { Project, ProjectConfig } from "../types";

export const projectsApi = {
  list: () =>
    request<{ projects: Project[] }>("/projects"),

  get: (projectId: string) =>
    request<Project>(`/projects/${projectId}`),

  create: (data: { name: string; repository: string; branch: string; connectionId: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig }) =>
    request("/projects", { method: "POST", body: JSON.stringify(data) }),

  update: (projectId: string, data: { name?: string; repository?: string; branch?: string; connectionId?: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig; settings?: Record<string, unknown> }) =>
    request<Project>(`/projects/${projectId}`, { method: "PUT", body: JSON.stringify({ projectId, ...data }) }),

  delete: (projectId: string) =>
    request(`/projects/${projectId}`, { method: "DELETE" }),
};

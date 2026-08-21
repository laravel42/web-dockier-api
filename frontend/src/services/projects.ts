import { request } from "./request";
import { buildQuery } from "./query";
import type { Project, ProjectConfig, PaginationMeta } from "../types";

export interface ListProjectsParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export const projectsApi = {
  list: (params?: ListProjectsParams) =>
    request<{ projects: Project[]; pagination: PaginationMeta }>(
      `/projects${buildQuery(params)}`,
    ),

  get: (projectId: string) =>
    request<Project>(`/projects/${projectId}`),

  create: (data: { name: string; repository: string; branch: string; connectionId: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig }) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),

  update: (projectId: string, data: { name?: string; repository?: string; branch?: string; connectionId?: string; platform?: string; sourceType?: string; template?: string; config?: ProjectConfig; settings?: Record<string, unknown> }) =>
    request<Project>(`/projects/${projectId}`, { method: "PUT", body: JSON.stringify({ projectId, ...data }) }),

  delete: (projectId: string) =>
    request<{ success: true }>(`/projects/${projectId}`, { method: "DELETE" }),

  /**
   * Tear down all cloud infrastructure for a project (keeps the project +
   * deployment history). Reversible: a subsequent deploy recreates resources.
   */
  teardownInfrastructure: (projectId: string) =>
    request<{
      status: "torn_down" | "partial" | "nothing_to_tear_down";
      message: string;
      perStack: Array<{ stackName: string; success: boolean; message: string; errors: string[] }>;
    }>(`/projects/${projectId}/infrastructure/teardown`, { method: "POST" }),
};

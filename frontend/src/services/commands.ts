import { request } from "./request";
import { buildQuery } from "./query";
import type { Command, PaginationMeta } from "../types";

export const commandsApi = {
  run: (projectId: string, command: string) =>
    request<Command>(`/projects/${encodeURIComponent(projectId)}/commands`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),

  list: (projectId: string, params?: { limit?: number; offset?: number }) =>
    request<{ commands: Command[]; pagination: PaginationMeta }>(
      `/projects/${encodeURIComponent(projectId)}/commands${buildQuery({ limit: params?.limit ?? 20, offset: params?.offset ?? 0 })}`,
    ),

  get: (projectId: string, commandId: string) =>
    request<Command>(`/projects/${encodeURIComponent(projectId)}/commands/${encodeURIComponent(commandId)}`),

  delete: (projectId: string, commandId: string) =>
    request(`/projects/${encodeURIComponent(projectId)}/commands/${encodeURIComponent(commandId)}`, { method: "DELETE" }),
};

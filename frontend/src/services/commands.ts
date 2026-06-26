import { request } from "./request";

export interface Command {
  id: string;
  projectId: string;
  userId: string;
  command: string;
  status: "running" | "finished" | "failed" | "timed_out";
  output: string;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export const commandsApi = {
  run: (projectId: string, command: string) =>
    request<Command>(`/projects/${encodeURIComponent(projectId)}/commands`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),

  list: (projectId: string, params?: { limit?: number; offset?: number }) =>
    request<{ commands: Command[]; total: number }>(
      `/projects/${encodeURIComponent(projectId)}/commands?limit=${params?.limit ?? 20}&offset=${params?.offset ?? 0}`,
    ),

  get: (projectId: string, commandId: string) =>
    request<Command>(`/projects/${encodeURIComponent(projectId)}/commands/${encodeURIComponent(commandId)}`),

  delete: (projectId: string, commandId: string) =>
    request(`/projects/${encodeURIComponent(projectId)}/commands/${encodeURIComponent(commandId)}`, { method: "DELETE" }),
};

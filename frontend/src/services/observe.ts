import { request } from "./request";
import { buildQuery } from "./query";
import type {
  Heartbeat,
  HeartbeatFrequency,
  HeartbeatGracePeriod,
  LogType,
  LogEntry,
  ActivityEntry,
  PaginationMeta,
} from "../types";

export const observeApi = {
  // Heartbeats
  listHeartbeats: (projectId: string) =>
    request<{ heartbeats: Heartbeat[] }>(
      `/projects/${encodeURIComponent(projectId)}/heartbeats`,
    ),

  createHeartbeat: (
    projectId: string,
    data: { name: string; frequency: HeartbeatFrequency; gracePeriod: HeartbeatGracePeriod },
  ) =>
    request<Heartbeat>(`/projects/${encodeURIComponent(projectId)}/heartbeats`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteHeartbeat: (projectId: string, heartbeatId: string) =>
    request(`/projects/${encodeURIComponent(projectId)}/heartbeats/${encodeURIComponent(heartbeatId)}`, {
      method: "DELETE",
    }),

  // Logs
  getLog: (projectId: string, logType: LogType) =>
    request<LogEntry>(
      `/projects/${encodeURIComponent(projectId)}/logs/${encodeURIComponent(logType)}`,
    ),

  clearLog: (projectId: string, logType: LogType) =>
    request(`/projects/${encodeURIComponent(projectId)}/logs/${encodeURIComponent(logType)}`, {
      method: "DELETE",
    }),

  // Activity
  listActivity: (projectId: string, params?: { limit?: number; offset?: number; search?: string }) =>
    request<{ activity: ActivityEntry[]; pagination: PaginationMeta }>(
      `/projects/${encodeURIComponent(projectId)}/activity${buildQuery({ limit: params?.limit ?? 50, offset: params?.offset ?? 0, search: params?.search })}`,
    ),
};

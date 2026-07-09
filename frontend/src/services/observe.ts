import { request } from "./request";

// ─── Types ───

export type HeartbeatFrequency =
  | "every_minute"
  | "every_5_minutes"
  | "every_10_minutes"
  | "every_15_minutes"
  | "every_30_minutes"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export type HeartbeatGracePeriod =
  | "after_1_minute"
  | "after_5_minutes"
  | "after_10_minutes"
  | "after_15_minutes"
  | "after_30_minutes"
  | "after_1_hour";

export type HeartbeatStatus = "healthy" | "missed" | "waiting";

export interface Heartbeat {
  id: string;
  projectId: string;
  name: string;
  frequency: HeartbeatFrequency;
  gracePeriod: HeartbeatGracePeriod;
  status: HeartbeatStatus;
  lastPingedAt: string | null;
  pingUrl: string;
  createdAt: string;
  updatedAt: string;
}

export type LogType = "site" | "nginx_access" | "nginx_error";

export interface LogEntry {
  type: LogType;
  content: string;
  size: number;
  lastModified: string | null;
}

export type ActivityEventType =
  | "deploy_started"
  | "deploy_completed"
  | "deploy_failed"
  | "command_run"
  | "config_changed"
  | "env_updated"
  | "heartbeat_missed"
  | "heartbeat_recovered"
  | "log_cleared"
  | "project_updated"
  | "domain_added"
  | "domain_removed"
  | "security_rule_added"
  | "security_rule_removed";

export interface ActivityEntry {
  id: string;
  projectId: string;
  userId: string | null;
  actorName: string | null;
  eventType: ActivityEventType;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── API ───

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
  listActivity: (projectId: string, params?: { limit?: number; offset?: number; search?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(params?.limit ?? 50));
    searchParams.set("offset", String(params?.offset ?? 0));
    if (params?.search) searchParams.set("search", params.search);
    return request<{ activity: ActivityEntry[]; total: number }>(
      `/projects/${encodeURIComponent(projectId)}/activity?${searchParams.toString()}`,
    );
  },
};

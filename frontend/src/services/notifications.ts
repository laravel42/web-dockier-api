import { request } from "./request";
import { buildQuery } from "./query";

export type NotificationDeployMetadata = {
  kind: "deploy";
  repo: string;
  branch: string;
  commit?: string;
  appUrl?: string;
  deployId?: string;
};

export type NotificationScanMetadata = {
  kind: "scan";
  repo: string;
  branch: string;
  commit?: string;
  projectId?: string;
  scanId?: string;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    totalFindings?: number;
  };
};

export type NotificationMetadata = NotificationDeployMetadata | NotificationScanMetadata;

export interface Notification {
  id: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata | null;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  listChannels: () =>
    request<{
      channels: Array<{
        id: string;
        type: string;
        config: Record<string, string>;
        enabled: boolean;
        createdAt: string;
      }>;
    }>("/notifications/channels"),

  addChannel: (data: {
    type: string;
    config: Record<string, string>;
  }) =>
    request("/notifications/channels", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  toggleChannel: (channelId: string, enabled: boolean) =>
    request(`/notifications/channels/${channelId}/toggle`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),

  deleteChannel: (channelId: string) =>
    request(`/notifications/channels/${channelId}`, { method: "DELETE" }),

  list: (params?: { unreadOnly?: boolean; limit?: number; offset?: number }) =>
    request<{
      notifications: Notification[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/notifications${buildQuery({ unreadOnly: params?.unreadOnly ? "true" : undefined, limit: params?.limit, offset: params?.offset })}`),

  markRead: (notificationId: string) =>
    request(`/notifications/${notificationId}/read`, { method: "PUT" }),

  markAllRead: () =>
    request<{ success: boolean; updated: number }>("/notifications/mark-all-read", { method: "PUT" }),

  send: (data: {
    userId: string;
    title: string;
    message: string;
    channels?: string[];
  }) =>
    request("/notifications/send", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

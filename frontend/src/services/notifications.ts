import { request } from "./request";

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

  list: (params?: { unreadOnly?: boolean; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.unreadOnly) searchParams.set("unreadOnly", "true");
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    return request<{
      notifications: Notification[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/notifications${qs ? `?${qs}` : ""}`);
  },

  markRead: (notificationId: string) =>
    request(`/notifications/${notificationId}/read`, { method: "PUT" }),

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

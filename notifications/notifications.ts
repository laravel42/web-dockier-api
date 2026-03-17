import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { Topic, Subscription } from "encore.dev/pubsub";
import { secret } from "encore.dev/config";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";

const db = new SQLDatabase("notifications", { migrations: "./migrations" });

const SmtpHost = secret("SmtpHost");
const SmtpPort = secret("SmtpPort");
const SmtpUser = secret("SmtpUser");
const SmtpPass = secret("SmtpPass");
const SlackWebhookUrl = secret("SlackWebhookUrl");

// ─── Interfaces ───

interface NotificationChannel {
  id: string;
  userId: string;
  type: "email" | "slack" | "webhook" | "in_app";
  config: Record<string, string>;
  enabled: boolean;
  createdAt: string;
}

interface Notification {
  id: string;
  userId: string;
  channel: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface SendNotificationParams {
  userId: string;
  title: string;
  message: string;
  channels?: string[]; // channel types to send to; defaults to all enabled
}

// ─── Pub/Sub Topic ───

export interface NotificationEvent {
  userId: string;
  title: string;
  message: string;
  channelType: string;
  channelConfig: Record<string, string>;
}

export const notificationTopic = new Topic<NotificationEvent>("notifications", {
  deliveryGuarantee: "at-least-once",
});

// ─── Channel Management ───

export const addChannel = api(
  { method: "POST", path: "/notifications/channels", auth: true },
  async (params: {
    type: "email" | "slack" | "webhook" | "in_app";
    config: Record<string, string>;
  }): Promise<NotificationChannel> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");
    const id = uuidv4();
    const configJson = JSON.stringify(params.config);

    await db.exec`
      INSERT INTO notification_channels (id, user_id, type, config, enabled, created_at)
      VALUES (${id}, ${authData.userID}, ${params.type}, ${configJson}, true, NOW())`;

    return {
      id, userId: authData.userID, type: params.type,
      config: params.config, enabled: true, createdAt: new Date().toISOString(),
    };
  }
);

export const listChannels = api(
  { method: "GET", path: "/notifications/channels", auth: true },
  async (): Promise<{ channels: NotificationChannel[] }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");
    const rows = db.query<{
      id: string; user_id: string; type: string; config: string; enabled: boolean; created_at: Date;
    }>`SELECT id, user_id, type, config, enabled, created_at
       FROM notification_channels WHERE user_id = ${authData.userID}`;

    const channels: NotificationChannel[] = [];
    for await (const row of rows) {
      channels.push({
        id: row.id, userId: row.user_id,
        type: row.type as NotificationChannel["type"],
        config: JSON.parse(row.config), enabled: row.enabled,
        createdAt: row.created_at.toISOString(),
      });
    }
    return { channels };
  }
);

export const toggleChannel = api(
  { method: "PUT", path: "/notifications/channels/:channelId/toggle", auth: true },
  async (params: { channelId: string; enabled: boolean }): Promise<{ success: boolean }> => {
    await db.exec`UPDATE notification_channels SET enabled = ${params.enabled} WHERE id = ${params.channelId}`;
    return { success: true };
  }
);

export const deleteChannel = api(
  { method: "DELETE", path: "/notifications/channels/:channelId", auth: true },
  async (params: { channelId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM notification_channels WHERE id = ${params.channelId}`;
    return { success: true };
  }
);

// ─── Send Notification ───

export const send = api(
  { method: "POST", path: "/notifications/send", auth: true },
  async (params: SendNotificationParams): Promise<{ sent: number }> => {
    const rows = db.query<{
      type: string; config: string;
    }>`SELECT type, config FROM notification_channels
       WHERE user_id = ${params.userId} AND enabled = true`;

    let sent = 0;
    for await (const row of rows) {
      if (params.channels && !params.channels.includes(row.type)) continue;

      await notificationTopic.publish({
        userId: params.userId,
        title: params.title,
        message: params.message,
        channelType: row.type,
        channelConfig: JSON.parse(row.config),
      });
      sent++;
    }

    // Always store in-app notification
    await db.exec`
      INSERT INTO notifications (id, user_id, channel, title, message, read, created_at)
      VALUES (${uuidv4()}, ${params.userId}, 'in_app', ${params.title}, ${params.message}, false, NOW())`;

    return { sent };
  }
);

// ─── List In-App Notifications ───

export const listNotifications = api(
  { method: "GET", path: "/notifications", auth: true },
  async (params: { unreadOnly?: boolean }): Promise<{ notifications: Notification[] }> => {
    const authData = getAuthData();
    if (!authData) throw APIError.unauthenticated("Not authenticated");

    const rows = params.unreadOnly
      ? db.query<{
          id: string; user_id: string; channel: string; title: string; message: string; read: boolean; created_at: Date;
        }>`SELECT id, user_id, channel, title, message, read, created_at
           FROM notifications WHERE user_id = ${authData.userID} AND read = false ORDER BY created_at DESC LIMIT 50`
      : db.query<{
          id: string; user_id: string; channel: string; title: string; message: string; read: boolean; created_at: Date;
        }>`SELECT id, user_id, channel, title, message, read, created_at
           FROM notifications WHERE user_id = ${authData.userID} ORDER BY created_at DESC LIMIT 50`;

    const notifications: Notification[] = [];
    for await (const row of rows) {
      notifications.push({
        id: row.id, userId: row.user_id, channel: row.channel,
        title: row.title, message: row.message, read: row.read,
        createdAt: row.created_at.toISOString(),
      });
    }
    return { notifications };
  }
);

export const markRead = api(
  { method: "PUT", path: "/notifications/:notificationId/read", auth: true },
  async (params: { notificationId: string }): Promise<{ success: boolean }> => {
    await db.exec`UPDATE notifications SET read = true WHERE id = ${params.notificationId}`;
    return { success: true };
  }
);

// ─── Pub/Sub Subscriber - Process notification delivery ───

const _ = new Subscription(notificationTopic, "notification-processor", {
  handler: async (event: NotificationEvent) => {
    switch (event.channelType) {
      case "email":
        console.log(`[EMAIL] To: ${event.channelConfig.email} | ${event.title}: ${event.message}`);
        // In production, integrate with SMTP/SES here
        break;
      case "slack":
        try {
          await fetch(event.channelConfig.webhookUrl || SlackWebhookUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: `*${event.title}*\n${event.message}` }),
          });
        } catch (e) {
          console.error("Slack notification failed:", e);
        }
        break;
      case "webhook":
        try {
          await fetch(event.channelConfig.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: event.title, message: event.message, userId: event.userId }),
          });
        } catch (e) {
          console.error("Webhook notification failed:", e);
        }
        break;
      case "in_app":
        // Already stored in DB during send
        break;
    }
  },
});

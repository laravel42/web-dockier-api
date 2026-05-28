import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../../../shared/supabase/client.js";

export type NotificationsErrorCode = "not_found" | "forbidden" | "bad_request" | "internal";

export class NotificationsError extends Error {
  constructor(
    message: string,
    public readonly code: NotificationsErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NotificationsError";
  }
}

// ─── Channels ────────────────────────────────────────────────────────────────

export type ChannelType = "email" | "slack" | "webhook" | "in_app";

export interface CreateChannelParams {
  tenantId: string;
  type: ChannelType;
  config: Record<string, string>;
}

export async function createChannel(params: CreateChannelParams) {
  const { tenantId, type, config } = params;
  if (!tenantId) throw new NotificationsError("Tenant ID is required", "bad_request");

  const id = uuidv4();
  const now = new Date().toISOString();
  const payload = {
    id,
    organization_id: tenantId,
    type,
    config: JSON.stringify(config),
    enabled: true,
    created_at: now,
  };
  const { error } = await supabaseAdmin.from("notification_channels").insert(payload);
  if (error) {
    if (error.code === "23505") throw new NotificationsError("A channel of this type already exists", "bad_request");
    throw new NotificationsError("Failed to create channel", "internal", error);
  }
  return { id, type, config, enabled: true, createdAt: now };
}

export async function listChannels(tenantId: string) {
  if (!tenantId) throw new NotificationsError("Tenant ID is required", "bad_request");
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .select("id,type,config,enabled,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new NotificationsError("Failed to list channels", "internal", error);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: row.type,
    config: typeof row.config === "string" ? JSON.parse(row.config) : row.config,
    enabled: row.enabled,
    createdAt: row.created_at,
  }));
}

export async function toggleChannel(channelId: string, tenantId: string, enabled: boolean) {
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .update({ enabled })
    .eq("id", channelId)
    .eq("organization_id", tenantId)
    .select("id");
  if (error) throw new NotificationsError("Failed to toggle channel", "internal", error);
  if (!data || data.length === 0) throw new NotificationsError("Channel not found", "not_found");
}

export async function deleteChannel(channelId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .delete()
    .eq("id", channelId)
    .eq("organization_id", tenantId)
    .select("id");
  if (error) throw new NotificationsError("Failed to delete channel", "internal", error);
  if (!data || data.length === 0) throw new NotificationsError("Channel not found", "not_found");
}

// ─── Send ────────────────────────────────────────────────────────────────────

export interface SendNotificationParams {
  tenantId: string;
  title: string;
  message: string;
  channels?: string[];
}

export async function sendNotification(params: SendNotificationParams): Promise<{ sent: number }> {
  const { tenantId, title, message, channels: filterChannels } = params;
  if (!tenantId) throw new NotificationsError("Tenant ID is required", "bad_request");

  // 1. Store in-app notification first to ensure consistency before performing external side-effects
  const { error: insertError } = await supabaseAdmin.from("notifications").insert({
    id: uuidv4(),
    organization_id: tenantId,
    channel: "in_app",
    title,
    message,
    read: false,
    created_at: new Date().toISOString(),
  });
  if (insertError) throw new NotificationsError("Failed to store notification", "internal", insertError);

  // 2. Fetch enabled channels
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .select("id,type,config,enabled")
    .eq("organization_id", tenantId)
    .eq("enabled", true);
  if (error) throw new NotificationsError("Failed to fetch channels", "internal", error);

  // 3. Dispatch external notifications concurrently with timeouts
  const sendPromises = (data ?? []).map(async (channel) => {
    if (filterChannels && !filterChannels.includes(channel.type)) return false;
    const config = typeof channel.config === "string" ? JSON.parse(channel.config) : channel.config;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      if (channel.type === "slack" && config?.webhookUrl) {
        await fetch(config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `*${title}*\n${message}` }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return true;
      } else if (channel.type === "webhook" && config?.url) {
        await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, message, tenantId }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return true;
      }
      clearTimeout(timeoutId);
    } catch {
      // Ignore failures to allow other channels to succeed
    }
    return false;
  });

  const results = await Promise.all(sendPromises);
  const sent = results.filter(Boolean).length;

  return { sent };
}

// ─── In-App Notifications ────────────────────────────────────────────────────

export async function listNotifications(tenantId: string, unreadOnly?: boolean) {
  if (!tenantId) throw new NotificationsError("Tenant ID is required", "bad_request");
  let query = supabaseAdmin
    .from("notifications")
    .select("id,channel,title,message,read,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) query = query.eq("read", false);
  const { data, error } = await query;
  if (error) throw new NotificationsError("Failed to list notifications", "internal", error);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    channel: row.channel,
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: row.created_at,
  }));
}

export async function markNotificationRead(notificationId: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("organization_id", tenantId)
    .select("id");
  if (error) throw new NotificationsError("Failed to mark notification as read", "internal", error);
  if (!data || data.length === 0) throw new NotificationsError("Notification not found", "not_found");
}

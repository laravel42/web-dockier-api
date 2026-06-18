import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import { sendEmailNotification } from "./email-dispatch.js";

export const NotificationsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("NotificationsError");
export type NotificationsError = InstanceType<typeof NotificationsError>;

// ─── Channels ────────────────────────────────────────────────────────────────

export type ChannelType = "email" | "slack" | "webhook" | "in_app";

const IN_APP_CHANNEL_TYPE: ChannelType = "in_app";

export async function ensureDefaultInAppChannel(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("type", IN_APP_CHANNEL_TYPE)
    .maybeSingle();
  throwOnError(error, NotificationsError, { internalMsg: "Failed to look up in-app channel" });
  if (data) return;

  const id = randomUUID();
  const now = new Date().toISOString();
  const { error: insertError } = await supabaseAdmin.from("notification_channels").insert({
    id,
    organization_id: tenantId,
    type: IN_APP_CHANNEL_TYPE,
    config: "{}",
    enabled: true,
    created_at: now,
  });
  throwOnError(insertError, NotificationsError, {
    internalMsg: "Failed to create default in-app channel",
    duplicateMsg: "A channel of this type already exists",
  });
}

export interface CreateChannelParams {
  tenantId: string;
  type: ChannelType;
  config: Record<string, string>;
}

export async function createChannel(params: CreateChannelParams) {
  const { tenantId, type, config } = params;

  if (type === IN_APP_CHANNEL_TYPE) {
    throw new NotificationsError("The in-app channel is included by default and cannot be added manually", "bad_request");
  }

  const id = randomUUID();
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
  throwOnError(error, NotificationsError, {
    internalMsg: "Failed to create channel",
    duplicateMsg: "A channel of this type already exists",
  });
  return { id, type, config, enabled: true, createdAt: now };
}

export async function listChannels(tenantId: string) {
  await ensureDefaultInAppChannel(tenantId);

  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .select("id,type,config,enabled,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  const rows = unwrapList(data, error, NotificationsError, { internalMsg: "Failed to list channels" });
  return rows.map((row) => ({
    id: row.id,
    type: row.type as ChannelType,
    config: (typeof row.config === "string" ? JSON.parse(row.config) : row.config) as Record<string, string>,
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
  throwOnError(error, NotificationsError, { internalMsg: "Failed to toggle channel" });
  if (!data || data.length === 0) throw new NotificationsError("Channel not found", "not_found");
}

export async function deleteChannel(channelId: string, tenantId: string) {
  const { data: channel, error: lookupError } = await supabaseAdmin
    .from("notification_channels")
    .select("id,type")
    .eq("id", channelId)
    .eq("organization_id", tenantId)
    .maybeSingle();
  throwOnError(lookupError, NotificationsError, { internalMsg: "Failed to look up channel" });
  if (!channel) throw new NotificationsError("Channel not found", "not_found");
  if (channel.type === IN_APP_CHANNEL_TYPE) {
    throw new NotificationsError("The in-app channel cannot be removed", "bad_request");
  }

  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .delete()
    .eq("id", channelId)
    .eq("organization_id", tenantId)
    .select("id");
  throwOnError(error, NotificationsError, { internalMsg: "Failed to delete channel" });
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

  await ensureDefaultInAppChannel(tenantId);

  const { data: inAppChannel, error: inAppError } = await supabaseAdmin
    .from("notification_channels")
    .select("enabled")
    .eq("organization_id", tenantId)
    .eq("type", IN_APP_CHANNEL_TYPE)
    .maybeSingle();
  throwOnError(inAppError, NotificationsError, { internalMsg: "Failed to look up in-app channel" });

  const inAppEnabled = inAppChannel?.enabled ?? false;
  const wantsInApp = !filterChannels || filterChannels.includes(IN_APP_CHANNEL_TYPE);

  if (inAppEnabled && wantsInApp) {
    const { error: insertError } = await supabaseAdmin.from("notifications").insert({
      id: randomUUID(),
      organization_id: tenantId,
      channel: IN_APP_CHANNEL_TYPE,
      title,
      message,
      read: false,
      created_at: new Date().toISOString(),
    });
    throwOnError(insertError, NotificationsError, { internalMsg: "Failed to store notification" });
  }

  // Fetch enabled external channels
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .select("id,type,config,enabled")
    .eq("organization_id", tenantId)
    .eq("enabled", true)
    .neq("type", IN_APP_CHANNEL_TYPE);
  const channels = unwrapList(data, error, NotificationsError, { internalMsg: "Failed to fetch channels" });

  // 3. Dispatch external notifications concurrently with timeouts
  const sendPromises = channels.map(async (channel) => {
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
      } else if (channel.type === "email" && config?.email) {
        const sent = await sendEmailNotification({
          to: config.email,
          title,
          message,
          idempotencyKey: `notification/${tenantId}/${channel.id}/${title}`,
        });
        clearTimeout(timeoutId);
        return sent;
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
  const sent = results.filter(Boolean).length + (inAppEnabled && wantsInApp ? 1 : 0);

  return { sent };
}

// ─── In-App Notifications ────────────────────────────────────────────────────

export async function listNotifications(tenantId: string, unreadOnly?: boolean) {
  let query = supabaseAdmin
    .from("notifications")
    .select("id,channel,title,message,read,created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) query = query.eq("read", false);
  const { data, error } = await query;
  const rows = unwrapList(data, error, NotificationsError, { internalMsg: "Failed to list notifications" });
  return rows.map((row) => ({
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
  throwOnError(error, NotificationsError, { internalMsg: "Failed to mark notification as read" });
  if (!data || data.length === 0) throw new NotificationsError("Notification not found", "not_found");
}

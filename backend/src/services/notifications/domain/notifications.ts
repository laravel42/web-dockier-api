import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapList, paginatedQuery, deleteOrThrow } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import { sendEmailNotification } from "./email-dispatch.js";
import { encryptJson, decryptJson } from "../../../shared/auth/crypto.js";
import { guardedFetch } from "../../../shared/http/guarded-fetch.js";
import { notificationMetadataSchema, type NotificationMetadata } from "../schemas.js";

export const NotificationsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("NotificationsError");
export type NotificationsError = InstanceType<typeof NotificationsError>;

// ─── Channels ────────────────────────────────────────────────────────────────

export type ChannelType = "email" | "slack" | "webhook" | "in_app";

const IN_APP_CHANNEL_TYPE: ChannelType = "in_app";


async function insertInAppNotification(params: {
  tenantId: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
}) {
  const { tenantId, title, message, metadata } = params;
  const basePayload = {
    id: randomUUID(),
    organization_id: tenantId,
    channel: IN_APP_CHANNEL_TYPE,
    title,
    message,
    read: false,
    created_at: nowIso(),
  };

  const { error } = await supabaseAdmin.from("notifications").insert({
    ...basePayload,
    metadata: metadata ?? null,
  });
  throwOnError(error, NotificationsError, { internalMsg: "Failed to store notification" });
}

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
  const now = nowIso();
  const { error: insertError } = await supabaseAdmin.from("notification_channels").insert({
    id,
    organization_id: tenantId,
    type: IN_APP_CHANNEL_TYPE,
    config: encryptJson({}),
    enabled: true,
    created_at: now,
  });
  throwOnError(insertError, NotificationsError, {
    internalMsg: "Failed to create default in-app channel",
    duplicateMsg: "A channel of this type already exists",
  });
}

// ─── Channel config ──────────────────────────────────────────────────────────
type ChannelConfig = Record<string, string>;
/**
 * A Slack webhook URL is a credential (anyone holding it can post to the channel),
 * and a custom webhook URL often carries a token. So the config is stored with
 * encryptJson and never sent back in full.
 */
function readChannelConfig(raw: unknown): ChannelConfig {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    return decryptJson(raw) as ChannelConfig;
  } catch {
    // An unreadable config (rotated key, corrupt row, the plain "{}" of an
    // in-app channel created before encryption) sends nothing and lists as empty.
    return {};
  }
}
/** What the API returns: the URL's origin only, so a member can tell channels apart but not reuse them. */
function maskChannelConfig(config: ChannelConfig): ChannelConfig {
  const masked: ChannelConfig = { ...config };
  for (const key of ["webhookUrl", "url"]) {
    const value = masked[key];
    if (!value) continue;
    try {
      masked[key] = `${new URL(value).origin}/•••`;
    } catch {
      masked[key] = "•••";
    }
  }
  return masked;
}
function assertHttpsUrl(value: string | undefined, label: string, host?: string): void {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new NotificationsError(`${label} must be a valid https:// URL`, "bad_request");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new NotificationsError(`${label} must be an https:// URL without credentials`, "bad_request");
  }
  if (host && url.hostname !== host) throw new NotificationsError(`${label} must be a ${host} URL`, "bad_request");
}
function assertValidChannelConfig(type: ChannelType, config: ChannelConfig): void {
  if (type === "slack") assertHttpsUrl(config.webhookUrl, "Slack webhook URL", "hooks.slack.com");
  if (type === "webhook") assertHttpsUrl(config.url, "Webhook URL");
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email ?? "")) {
    throw new NotificationsError("Enter a valid email address", "bad_request");
  }
}
/** POST to a tenant-supplied URL through the internal-address guard; only a 2xx counts as delivered. */
async function postJson(url: string, body: unknown): Promise<boolean> {
  const res = await guardedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 5000,
  });
  return res.ok;
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

  assertValidChannelConfig(type, config);
  const id = randomUUID();
  const now = nowIso();
  const payload = {
    id,
    organization_id: tenantId,
    type,
    config: encryptJson(config),
    enabled: true,
    created_at: now,
  };
  const { error } = await supabaseAdmin.from("notification_channels").insert(payload);
  throwOnError(error, NotificationsError, {
    internalMsg: "Failed to create channel",
    duplicateMsg: "A channel of this type already exists",
  });
  return { id, type, config: maskChannelConfig(config), enabled: true, createdAt: now };
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
    config: maskChannelConfig(readChannelConfig(row.config)),
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

  await deleteOrThrow(
    supabaseAdmin
      .from("notification_channels")
      .delete({ count: "exact" })
      .eq("id", channelId)
      .eq("organization_id", tenantId),
    NotificationsError,
    { notFoundMsg: "Channel not found", internalMsg: "Failed to delete channel" },
  );
}

// ─── Send ────────────────────────────────────────────────────────────────────

export interface SendNotificationParams {
  tenantId: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  channels?: string[];
}

export async function sendNotification(params: SendNotificationParams): Promise<{ sent: number }> {
  const { tenantId, title, message, metadata, channels: filterChannels } = params;
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
    await insertInAppNotification({ tenantId, title, message, metadata });
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
    const config = readChannelConfig(channel.config);
    try {
      if (channel.type === "slack" && config.webhookUrl) {
        return await postJson(config.webhookUrl, { text: `*${title}*\n${message}` });
      }
      if (channel.type === "email" && config.email) {
        // No idempotency key: one keyed on the title made Resend drop every later
        // email with the same title (two scans of one repo) for 24 hours.
        return await sendEmailNotification({ to: config.email, title, message });
      }
      if (channel.type === "webhook" && config.url) {
        return await postJson(config.url, { title, message, tenantId });
      }
    } catch {
      // Ignore failures (timeout, refused internal address) to allow other channels to succeed
    }
    return false;
  });
  const results = await Promise.all(sendPromises);
  const sent = results.filter(Boolean).length + (inAppEnabled && wantsInApp ? 1 : 0);

  return { sent };
}

// ─── In-App Notifications ────────────────────────────────────────────────────

function parseNotificationMetadata(value: unknown): NotificationMetadata | null {
  const parsed = notificationMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function listNotifications(tenantId: string, params?: { unreadOnly?: boolean; limit?: number; offset?: number }) {
  const limit = Math.min(Math.max(params?.limit ?? 30, 1), 100);
  const offset = Math.max(params?.offset ?? 0, 0);
  let query = supabaseAdmin
    .from("notifications")
    .select("id,channel,title,message,read,created_at,metadata", { count: "exact" })
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  if (params?.unreadOnly) query = query.eq("read", false);
  const result = await paginatedQuery(query, { limit, offset }, NotificationsError, {
    internalMsg: "Failed to list notifications",
    map: (row) => ({
      id: row.id,
      channel: row.channel,
      title: row.title,
      message: row.message,
      metadata: parseNotificationMetadata(row.metadata),
      read: row.read,
      createdAt: row.created_at,
    }),
  });
  return { notifications: result.data, total: result.total };
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

/**
 * Mark all unread notifications as read for a tenant.
 * Returns the number of notifications that were updated.
 */
export async function markAllNotificationsRead(tenantId: string): Promise<{ updated: number }> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ read: true })
    .eq("organization_id", tenantId)
    .eq("read", false)
    .select("id");
  throwOnError(error, NotificationsError, { internalMsg: "Failed to mark all notifications as read" });
  return { updated: data?.length ?? 0 };
}

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { channelSchema, channelTypeSchema, notificationSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";

export async function registerNotificationsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;

  typed.post(
    "/notifications/channels",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "Add notification channel",
        body: z.object({
          type: channelTypeSchema,
          config: z.record(z.string(), z.string()),
        }),
        response: { 200: channelSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const id = uuidv4();
      const now = new Date().toISOString();
      const payload = {
        id,
        app_id: auth.appId,
        type: request.body.type,
        config: JSON.stringify(request.body.config),
        enabled: true,
        created_at: now,
      };
      const { error } = await db.from("notification_channels").insert(payload);
      if (error) throw app.httpErrors.badRequest(error.message);
      return {
        id,
        type: request.body.type,
        config: request.body.config,
        enabled: true,
        createdAt: now,
      };
    },
  );

  typed.get(
    "/notifications/channels",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "List notification channels",
        response: { 200: z.object({ channels: z.array(channelSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db
        .from("notification_channels")
        .select("id,type,config,enabled,created_at")
        .eq("app_id", auth.appId)
        .order("created_at", { ascending: false });
      if (error) throw app.httpErrors.internalServerError(error.message);
      return {
        channels: (data ?? []).map((row: any) => ({
          id: row.id,
          type: row.type,
          config: typeof row.config === "string" ? JSON.parse(row.config) : row.config,
          enabled: row.enabled,
          createdAt: row.created_at,
        })),
      };
    },
  );

  typed.put(
    "/notifications/channels/:channelId/toggle",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "Enable or disable channel",
        params: z.object({ channelId: z.string().uuid() }),
        body: z.object({ enabled: z.boolean() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { error } = await db
        .from("notification_channels")
        .update({ enabled: request.body.enabled })
        .eq("id", request.params.channelId)
        .eq("app_id", auth.appId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );

  typed.delete(
    "/notifications/channels/:channelId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "Delete channel",
        params: z.object({ channelId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { error } = await db.from("notification_channels").delete().eq("id", request.params.channelId).eq("app_id", auth.appId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );

  typed.post(
    "/notifications/send",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "Send notification to enabled channels",
        body: z.object({
          title: z.string().min(1),
          message: z.string().min(1),
          channels: z.array(channelTypeSchema).optional(),
        }),
        response: { 200: z.object({ sent: z.number().int().nonnegative() }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db
        .from("notification_channels")
        .select("id,type,config,enabled")
        .eq("app_id", auth.appId)
        .eq("enabled", true);
      if (error) throw app.httpErrors.internalServerError(error.message);

      let sent = 0;
      for (const channel of data ?? []) {
        if (request.body.channels && !request.body.channels.includes(channel.type as typeof request.body.channels[number])) continue;
        const config = typeof channel.config === "string" ? JSON.parse(channel.config) : channel.config;
        if (channel.type === "slack" && config?.webhookUrl) {
          await fetch(config.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: `*${request.body.title}*\n${request.body.message}` }),
          }).catch(() => undefined);
        }
        if (channel.type === "webhook" && config?.url) {
          await fetch(config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: request.body.title, message: request.body.message, appId: auth.appId }),
          }).catch(() => undefined);
        }
        sent++;
      }

      await db.from("notifications").insert({
        id: uuidv4(),
        app_id: auth.appId,
        channel: "in_app",
        title: request.body.title,
        message: request.body.message,
        read: false,
        created_at: new Date().toISOString(),
      });

      return { sent };
    },
  );

  typed.get(
    "/notifications",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "List in-app notifications",
        querystring: z.object({ unreadOnly: z.coerce.boolean().optional() }),
        response: { 200: z.object({ notifications: z.array(notificationSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      let query = db
        .from("notifications")
        .select("id,channel,title,message,read,created_at")
        .eq("app_id", auth.appId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (request.query.unreadOnly) query = query.eq("read", false);
      const { data, error } = await query;
      if (error) throw app.httpErrors.internalServerError(error.message);
      return {
        notifications: (data ?? []).map((row: any) => ({
          id: row.id,
          channel: row.channel,
          title: row.title,
          message: row.message,
          read: row.read,
          createdAt: row.created_at,
        })),
      };
    },
  );

  typed.put(
    "/notifications/:notificationId/read",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["notifications"],
        summary: "Mark notification as read",
        params: z.object({ notificationId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { error } = await db
        .from("notifications")
        .update({ read: true })
        .eq("id", request.params.notificationId)
        .eq("app_id", auth.appId);
      if (error) throw app.httpErrors.badRequest(error.message);
      return { success: true as const };
    },
  );
}

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { channelSchema, channelTypeSchema, notificationSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { throwDomainError } from "../../shared/error-handler.js";
import {
  NotificationsError,
  createChannel,
  listChannels,
  toggleChannel,
  deleteChannel,
  sendNotification,
  listNotifications,
  markNotificationRead,
} from "./domain/notifications.js";

export async function registerNotificationsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/notifications/channels",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
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
      try {
        return await createChannel({
          tenantId: auth.tenantId,
          type: request.body.type,
          config: request.body.config,
        });
      } catch (err) {
        if (err instanceof NotificationsError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.get(
    "/notifications/channels",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
      schema: {
        tags: ["notifications"],
        summary: "List notification channels",
        response: { 200: z.object({ channels: z.array(channelSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        const channels = await listChannels(auth.tenantId);
        return { channels };
      } catch (err) {
        if (err instanceof NotificationsError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.put(
    "/notifications/channels/:channelId/toggle",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
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
      try {
        await toggleChannel(request.params.channelId, auth.tenantId, request.body.enabled);
        return { success: true as const };
      } catch (err) {
        if (err instanceof NotificationsError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.delete(
    "/notifications/channels/:channelId",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
      schema: {
        tags: ["notifications"],
        summary: "Delete channel",
        params: z.object({ channelId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        await deleteChannel(request.params.channelId, auth.tenantId);
        return { success: true as const };
      } catch (err) {
        if (err instanceof NotificationsError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.post(
    "/notifications/send",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_SEND),
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
      try {
        return await sendNotification({
          tenantId: auth.tenantId,
          title: request.body.title,
          message: request.body.message,
          channels: request.body.channels,
        });
      } catch (err) {
        if (err instanceof NotificationsError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.get(
    "/notifications",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
      schema: {
        tags: ["notifications"],
        summary: "List in-app notifications",
        querystring: z.object({ unreadOnly: z.coerce.boolean().optional() }),
        response: { 200: z.object({ notifications: z.array(notificationSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        const notifications = await listNotifications(auth.tenantId, request.query.unreadOnly);
        return { notifications };
      } catch (err) {
        if (err instanceof NotificationsError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.put(
    "/notifications/:notificationId/read",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
      schema: {
        tags: ["notifications"],
        summary: "Mark notification as read",
        params: z.object({ notificationId: z.string().uuid() }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        await markNotificationRead(request.params.notificationId, auth.tenantId);
        return { success: true as const };
      } catch (err) {
        if (err instanceof NotificationsError) throwDomainError(app, err);
        throw err;
      }
    },
  );
}

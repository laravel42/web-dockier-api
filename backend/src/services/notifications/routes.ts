import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { channelSchema, channelTypeSchema, notificationSchema } from "./schemas.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import {
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
      const auth = getAuth(request);
      return await createChannel({
        tenantId: auth.tenantId,
        type: request.body.type,
        config: request.body.config,
      });
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
      const auth = getAuth(request);
      const channels = await listChannels(auth.tenantId);
      return { channels };
    },
  );

  typed.put(
    "/notifications/channels/:channelId/toggle",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
      schema: {
        tags: ["notifications"],
        summary: "Enable or disable channel",
        params: z.object({ channelId: z.uuid() }),
        body: z.object({ enabled: z.boolean() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await toggleChannel(request.params.channelId, auth.tenantId, request.body.enabled);
      return { success: true as const };
    },
  );

  typed.delete(
    "/notifications/channels/:channelId",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_MANAGE),
      schema: {
        tags: ["notifications"],
        summary: "Delete channel",
        params: z.object({ channelId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteChannel(request.params.channelId, auth.tenantId);
      return { success: true as const };
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
      const auth = getAuth(request);
      return await sendNotification({
        tenantId: auth.tenantId,
        title: request.body.title,
        message: request.body.message,
        channels: request.body.channels,
      });
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
      const auth = getAuth(request);
      const notifications = await listNotifications(auth.tenantId, request.query.unreadOnly);
      return { notifications };
    },
  );

  typed.put(
    "/notifications/:notificationId/read",
    {
      preHandler: app.requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
      schema: {
        tags: ["notifications"],
        summary: "Mark notification as read",
        params: z.object({ notificationId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await markNotificationRead(request.params.notificationId, auth.tenantId);
      return { success: true as const };
    },
  );
}

/**
 * Notification Event Handlers
 *
 * Subscribes to domain events and dispatches notifications.
 * Called once at server startup to wire up the event bus.
 *
 * This decouples other services (deploy, code-analysis, auth) from
 * importing notification domain logic directly.
 */

import { on } from "../../../shared/events.js";
import { sendNotification, ensureDefaultInAppChannel } from "./notifications.js";
import type { NotificationMetadata } from "../schemas.js";
import { logger } from "../../../shared/logger.js";

/**
 * Register all notification-related event handlers.
 * Call this once during server startup.
 */
export function registerNotificationEventHandlers(): void {
  on("notification:send", async (event) => {
    try {
      await sendNotification({
        tenantId: event.tenantId,
        title: event.title,
        message: event.message,
        metadata: event.metadata as NotificationMetadata | undefined,
      });
    } catch (err) {
      logger.error({ err, tenantId: event.tenantId }, "[notifications] Failed to process notification event");
    }
  });

  on("tenant:created", async (event) => {
    try {
      await ensureDefaultInAppChannel(event.tenantId);
    } catch (err) {
      logger.error({ err, tenantId: event.tenantId }, "[notifications] Failed to ensure default channel for new tenant");
    }
  });
}

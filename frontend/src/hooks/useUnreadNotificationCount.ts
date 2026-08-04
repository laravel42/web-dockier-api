import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "../services/api";
import { useInAppNotificationsEnabled } from "./useInAppNotificationsEnabled";

/** Custom event fired when notifications are read/dismissed. */
export const NOTIFICATIONS_READ_EVENT = "dockier:notifications-read";

/** Notify the unread count hook to re-fetch (e.g., after marking as read). */
export function notifyNotificationsRead() {
  window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
}

/** Polling interval for unread count (60 seconds). */
const POLL_INTERVAL_MS = 60_000;

/**
 * Returns the count of unread in-app notifications.
 *
 * Polls every 60s and listens for explicit read/dismiss events.
 * Returns 0 when notifications are disabled or on fetch failure.
 */
export function useUnreadNotificationCount(): number {
  const { enabled: inAppEnabled } = useInAppNotificationsEnabled();
  const [count, setCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!inAppEnabled) {
      setCount(0);
      return;
    }
    try {
      const res = await notificationsApi.list({ unreadOnly: true });
      setCount(res.notifications.length);
    } catch {
      setCount(0);
    }
  }, [inAppEnabled]);

  // Initial fetch + poll
  useEffect(() => {
    if (!inAppEnabled) {
      setCount(0);
      return;
    }

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [inAppEnabled, fetchUnreadCount]);

  // Listen for explicit read/dismiss events for immediate update
  useEffect(() => {
    const onChange = () => fetchUnreadCount();
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onChange);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, onChange);
  }, [fetchUnreadCount]);

  return count;
}

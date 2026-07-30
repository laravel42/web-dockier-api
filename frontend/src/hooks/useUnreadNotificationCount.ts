import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { notificationsApi } from "../services/api";
import { useInAppNotificationsEnabled } from "./useInAppNotificationsEnabled";

/**
 * Returns the count of unread in-app notifications.
 *
 * Re-fetches on route change and when in-app notifications are toggled.
 * Returns 0 when notifications are disabled or on fetch failure.
 */
export function useUnreadNotificationCount(): number {
  const pathname = useLocation().pathname;
  const { enabled: inAppEnabled } = useInAppNotificationsEnabled();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inAppEnabled) {
      setCount(0);
      return;
    }

    let cancelled = false;

    async function fetchUnreadCount() {
      try {
        const res = await notificationsApi.list({ unreadOnly: true });
        if (!cancelled) setCount(res.notifications.length);
      } catch {
        if (!cancelled) setCount(0);
      }
    }

    void fetchUnreadCount();
    return () => { cancelled = true; };
  }, [pathname, inAppEnabled]);

  return count;
}

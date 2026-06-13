import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { notificationsApi } from "../services/api";
import { useInAppNotificationsEnabled } from "./useInAppNotificationsEnabled";

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
    notificationsApi
      .list(true)
      .then((res) => {
        if (!cancelled) {
          setCount(res.notifications.length);
        }
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, inAppEnabled]);

  return count;
}

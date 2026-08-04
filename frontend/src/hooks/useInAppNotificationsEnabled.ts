import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "../services/api";
import { usePermissions } from "../context/PermissionsContext";

export const IN_APP_NOTIFICATIONS_CHANGED_EVENT = "dockier:in-app-notifications-changed";

export function notifyInAppNotificationsChanged() {
  window.dispatchEvent(new Event(IN_APP_NOTIFICATIONS_CHANGED_EVENT));
}

/** Polling interval for notification channel status (60 seconds). */
const POLL_INTERVAL_MS = 60_000;

/**
 * Checks whether in-app notifications are enabled for the current user/tenant.
 *
 * Fetches the notification channels from the API once on mount, then polls
 * every 60s. Also listens for the `dockier:in-app-notifications-changed`
 * event for immediate updates when the user toggles channels.
 */
export function useInAppNotificationsEnabled(): { enabled: boolean; loading: boolean } {
  const { has, loading: permissionsLoading } = usePermissions();
  const canView = has("notification:view");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!canView) {
      setEnabled(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await notificationsApi.listChannels();
      const inApp = res.channels.find((ch) => ch.type === "in_app");
      setEnabled(inApp?.enabled ?? false);
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  // Initial fetch once permissions are resolved
  useEffect(() => {
    if (permissionsLoading) return;
    load();
  }, [permissionsLoading, load]);

  // Poll periodically instead of on every route change
  useEffect(() => {
    if (permissionsLoading || !canView) return;
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [permissionsLoading, canView, load]);

  // Listen for explicit channel toggle events
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChange);
  }, [load]);

  return { enabled, loading: permissionsLoading || loading };
}

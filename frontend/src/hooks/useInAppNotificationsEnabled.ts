import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { notificationsApi } from "../services/api";
import { usePermissions } from "../context/PermissionsContext";

export const IN_APP_NOTIFICATIONS_CHANGED_EVENT = "dockier:in-app-notifications-changed";

export function notifyInAppNotificationsChanged() {
  window.dispatchEvent(new Event(IN_APP_NOTIFICATIONS_CHANGED_EVENT));
}

export function useInAppNotificationsEnabled(): { enabled: boolean; loading: boolean } {
  const pathname = useLocation().pathname;
  const { has, loading: permissionsLoading } = usePermissions();
  const canView = has("notification:view");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!canView) {
      setEnabled(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    notificationsApi
      .listChannels()
      .then((res) => {
        const inApp = res.channels.find((ch) => ch.type === "in_app");
        setEnabled(inApp?.enabled ?? false);
      })
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, [canView]);

  useEffect(() => {
    if (permissionsLoading) return;
    load();
  }, [permissionsLoading, load, pathname]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(IN_APP_NOTIFICATIONS_CHANGED_EVENT, onChange);
  }, [load]);

  return { enabled, loading: permissionsLoading || loading };
}

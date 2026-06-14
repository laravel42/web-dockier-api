import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../services/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { useInAppNotificationsEnabled } from "../hooks/useInAppNotificationsEnabled";
import PageHeader from "../components/ui/PageHeader";
import PageLoading from "../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../components/ui/PageError";
import { btnLink, cardCls } from "../utils/styles";
import type { Notification } from "../services/notifications";

async function fetchNotifications(): Promise<Notification[]> {
  const res = await notificationsApi.list();
  return res.notifications;
}

export default function Notifications() {
  const navigate = useNavigate();
  const { enabled: inAppEnabled, loading: inAppLoading } = useInAppNotificationsEnabled();
  const { data: notifications, loading, error, reload } = useAsyncData(fetchNotifications, []);

  useEffect(() => {
    if (!inAppLoading && !inAppEnabled) {
      navigate("/dashboard", { replace: true });
    }
  }, [inAppEnabled, inAppLoading, navigate]);

  if (inAppLoading || !inAppEnabled) {
    return <PageLoading />;
  }

  const markRead = async (id: string) => {
    await notificationsApi.markRead(id);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${notifications?.length ?? 0} total · Activity from your projects and deployments`}
      />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={reload} />
      ) : !notifications?.length ? (
        <EmptyMessage>No notifications</EmptyMessage>
      ) : (
        <div className={cardCls}>
          <ul className="divide-y divide-border/40">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`px-5 py-4 flex items-start justify-between gap-4 ${!n.read ? "bg-primary-500/5" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <h3 className={`text-sm font-medium truncate min-w-0 ${!n.read ? "text-text" : "text-text-muted"}`}>{n.title}</h3>
                    <time className="text-[10px] leading-snug text-text-muted shrink-0 whitespace-nowrap">
                      {new Date(n.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 leading-snug">{n.message}</p>
                </div>
                {!n.read && (
                  <button type="button" onClick={() => markRead(n.id)} className={`${btnLink} shrink-0 text-xs`}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

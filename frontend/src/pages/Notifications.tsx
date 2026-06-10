import { notificationsApi } from "../services/api";
import { useAsyncData } from "../hooks/useAsyncData";
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
  const { data: notifications, loading, error, reload } = useAsyncData(fetchNotifications, []);

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
                <div className="min-w-0">
                  <h3 className={`text-sm font-medium ${!n.read ? "text-text" : "text-text-muted"}`}>{n.title}</h3>
                  <p className="text-sm text-text-muted mt-0.5">{n.message}</p>
                  <p className="text-xs text-text-muted mt-1.5">{new Date(n.createdAt).toLocaleString()}</p>
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

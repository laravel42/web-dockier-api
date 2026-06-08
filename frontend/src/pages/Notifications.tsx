import { notificationsApi } from "../services/api";
import { useAsyncData } from "../hooks/useAsyncData";
import PageHeader from "../components/ui/PageHeader";
import PageLoading from "../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../components/ui/PageError";
import { cardCls } from "../utils/styles";
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
      <PageHeader title="Notifications" />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={reload} />
      ) : !notifications?.length ? (
        <EmptyMessage>No notifications</EmptyMessage>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`${cardCls} p-4 flex items-start justify-between border border-border/50 ${!n.read ? "border-l-4 border-l-primary-500" : ""}`}
            >
              <div>
                <h3 className={`text-sm font-medium ${!n.read ? "text-text" : "text-text-muted"}`}>
                  {n.title}
                </h3>
                <p className="text-sm text-text-secondary mt-0.5">{n.message}</p>
                <p className="text-xs text-text-muted mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              {!n.read && (
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="text-xs text-primary-500 hover:text-primary-700 font-medium whitespace-nowrap transition-colors"
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

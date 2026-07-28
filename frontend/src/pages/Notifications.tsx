import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../services/api";
import { useInAppNotificationsEnabled } from "../hooks/useInAppNotificationsEnabled";
import PageHeader from "../components/ui/PageHeader";
import PageLoading from "../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../components/ui/PageError";
import Pagination from "../components/ui/Pagination";
import { btnLink, btnGhost, cardCls } from "../utils/styles";
import type { Notification } from "../services/notifications";
import NotificationContent from "../components/NotificationContent";
import NotificationTitleLink from "../components/NotificationTitleLink";

const PAGE_SIZE = 30;

export default function Notifications() {
  const navigate = useNavigate();
  const { enabled: inAppEnabled, loading: inAppLoading } = useInAppNotificationsEnabled();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0 });

  const fetchNotifications = useCallback(async (offset = 0) => {
    setLoading(true);
    setError("");
    try {
      const res = await notificationsApi.list({ limit: PAGE_SIZE, offset });
      setNotifications(res.notifications);
      setPagination(res.pagination);
    } catch {
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (inAppEnabled) fetchNotifications();
  }, [inAppEnabled, fetchNotifications]);

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
    fetchNotifications(pagination.offset);
  };

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    fetchNotifications(pagination.offset);
  };

  const hasUnread = notifications.some((n) => !n.read);

  const goToPage = (page: number) => {
    fetchNotifications((page - 1) * PAGE_SIZE);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${pagination.total} total · Activity from your projects and deployments`}
        actions={
          hasUnread ? (
            <button type="button" onClick={markAllRead} className={btnGhost}>
              Mark all as read
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <PageLoading />
      ) : error ? (
        <PageError message={error} onRetry={() => fetchNotifications(pagination.offset)} />
      ) : !notifications.length ? (
        <EmptyMessage>No notifications</EmptyMessage>
      ) : (
        <>
          <div className={cardCls}>
            <ul className="divide-y divide-border/40">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-5 py-3 flex items-start justify-between gap-3 ${!n.read ? "bg-primary-500/5" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <NotificationTitleLink
                        notification={n}
                        unread={!n.read}
                        className="text-sm/snug "
                      />
                      <time className="text-xs/snug  text-text-muted shrink-0 whitespace-nowrap">
                        {new Date(n.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <NotificationContent notification={n} />
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

          <div className="mt-4">
            <Pagination
              total={pagination.total}
              limit={pagination.limit}
              offset={pagination.offset}
              onPageChange={goToPage}
            />
          </div>
        </>
      )}
    </div>
  );
}

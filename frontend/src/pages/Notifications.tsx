import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../services/api";
import { useInAppNotificationsEnabled } from "../hooks/useInAppNotificationsEnabled";
import PageHeader from "../components/ui/PageHeader";
import PageLoading from "../components/ui/PageLoading";
import PageError, { EmptyMessage } from "../components/ui/PageError";
import Pagination from "../components/ui/Pagination";
import { cardCls } from "../utils/styles";
import Button from "../components/ui/Button";
import { useToast } from "../context/useToast";
import NotificationContent from "../components/NotificationContent";
import NotificationTitleLink from "../components/NotificationTitleLink";
import type { Notification } from "../types";
import { getErrorMessage } from "../utils/errors";
import { useAsyncData } from "../hooks/useAsyncData";

const PAGE_SIZE = 30;

export default function Notifications() {
  const navigate = useNavigate();
  const toast = useToast();
  const { enabled: inAppEnabled, loading: inAppLoading } = useInAppNotificationsEnabled();
  const [offset, setOffset] = useState(0);
  const { data, error, reload } = useAsyncData(
    () => notificationsApi.list({ limit: PAGE_SIZE, offset }),
    [offset],
    { enabled: inAppEnabled },
  );
  const notifications: Notification[] = data?.notifications ?? [];
  const pagination = data?.pagination ?? { total: 0, limit: PAGE_SIZE, offset };

  useEffect(() => {
    if (!inAppLoading && !inAppEnabled) {
      navigate("/dashboard", { replace: true });
    }
  }, [inAppEnabled, inAppLoading, navigate]);

  if (inAppLoading || !inAppEnabled) {
    return <PageLoading />;
  }

  const markRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to mark notification as read"));
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to mark all notifications as read"));
    }
  };

  const hasUnread = notifications.some((n) => !n.read);

  const goToPage = (page: number) => {
    setOffset((page - 1) * PAGE_SIZE);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${pagination.total} total · Activity from your projects and deployments`}
        actions={
          hasUnread ? (
            <Button variant="ghost" onClick={markAllRead}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      {/* Spinner only before the first response, so marking read or paging keeps the list. */}
      {error ? (
        <PageError message={error} onRetry={reload} />
      ) : !data ? (
        <PageLoading />
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
                    <Button variant="link" size="sm" onClick={() => markRead(n.id)} className="shrink-0">
                      Mark read
                    </Button>
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

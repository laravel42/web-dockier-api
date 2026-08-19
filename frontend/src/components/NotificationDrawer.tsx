import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../services/api";
import type { Notification } from "../types";
import { getNotificationDetailPath } from "../utils/notificationContent";
import { notifyNotificationsRead } from "../hooks/useUnreadNotificationCount";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
} from "./ui/Drawer";
import Button from "./ui/Button";
import Pagination from "./ui/Pagination";
import PageLoading from "./ui/PageLoading";

const PAGE_SIZE = 20;

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NotificationDrawerItem({
  notification,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const to = getNotificationDetailPath(notification);

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
    if (to) {
      navigate(to);
      onNavigate();
    }
  };

  return (
    <div
      role={to ? "link" : undefined}
      onClick={handleClick}
      className={`border-b border-border/40 px-5 py-3 transition-colors hover:bg-muted/40 ${to ? "cursor-pointer" : ""} ${!notification.read ? "bg-primary/5" : ""}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!notification.read && (
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
          )}
          <span
            className={`min-w-0 flex-1 text-sm/snug font-medium ${!notification.read ? "text-text" : "text-text-muted"}`}
          >
            {notification.title}
          </span>
        </div>
        <time className="shrink-0 text-[11px] leading-snug whitespace-nowrap text-text-muted">
          {new Date(notification.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      </div>
      {notification.message && (
        <p className="mt-1 text-xs text-text-muted">
          {notification.message}
        </p>
      )}
      {!notification.read && (
        <Button
          variant="link"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(notification.id);
          }}
        >
          Mark as read
        </Button>
      )}
    </div>
  );
}

export default function NotificationDrawer({ open, onOpenChange }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0 });

  const fetchNotifications = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ limit: PAGE_SIZE, offset });
      setNotifications(res.notifications);
      setPagination(res.pagination);
    } catch {
      // Silently degrade
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchNotifications(0);
  }, [open, fetchNotifications]);

  const markRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      notifyNotificationsRead();
      await fetchNotifications(pagination.offset);
    } catch {
      // Silently degrade
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      notifyNotificationsRead();
      await fetchNotifications(pagination.offset);
    } catch {
      // Silently degrade
    }
  };

  const goToPage = (page: number) => {
    fetchNotifications((page - 1) * PAGE_SIZE);
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Notifications</DrawerTitle>
        </DrawerHeader>

        {hasUnread && (
          <div className="flex justify-end border-b border-border/40 px-5 py-2">
            <Button variant="link" size="sm" onClick={markAllRead}>
              Mark all as read
            </Button>
          </div>
        )}

        <DrawerBody>
          {loading ? (
            <PageLoading />
          ) : notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-text-muted">
              No notifications
            </div>
          ) : (
            <>
              <div>
                {notifications.map((n) => (
                  <NotificationDrawerItem
                    key={n.id}
                    notification={n}
                    onMarkRead={markRead}
                    onNavigate={() => onOpenChange(false)}
                  />
                ))}
              </div>
              <div className="px-5 py-3">
                <Pagination
                  total={pagination.total}
                  limit={pagination.limit}
                  offset={pagination.offset}
                  onPageChange={goToPage}
                />
              </div>
            </>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

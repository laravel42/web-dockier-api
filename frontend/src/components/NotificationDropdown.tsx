import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { notificationsApi } from "../services/api";
import type { Notification } from "../types";
import { BellIcon } from "lucide-react";
import { getNotificationDetailPath } from "../utils/notificationContent";
import NotificationDrawer from "./NotificationDrawer";
import { useUnreadNotificationCount, notifyNotificationsRead } from "../hooks/useUnreadNotificationCount";
import Button from "./ui/Button";

type NotificationDropdownItemProps = {
  notification: Notification;
  onNavigate: () => void;
};

function NotificationDropdownItem({
  notification,
  onNavigate,
}: NotificationDropdownItemProps) {
  const navigate = useNavigate();
  const to = getNotificationDetailPath(notification);

  const handleClick = () => {
    if (!notification.read) {
      void notificationsApi.markRead(notification.id);
      notifyNotificationsRead();
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
      className={`border-b border-border/40 px-3.5 py-2.5 transition-colors hover:bg-muted/40 ${to ? "cursor-pointer" : ""} ${!notification.read ? "bg-primary/5" : ""}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!notification.read && (
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
          )}
          <span className={`min-w-0 flex-1 truncate text-xs/snug font-medium ${!notification.read ? "text-text" : "text-text-muted"}`}>
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
        <p className="mt-1 text-xs text-text-muted line-clamp-2">{notification.message}</p>
      )}
    </div>
  );
}

export default function NotificationDropdown() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    notificationsApi.list({ limit: 5 }).then((res) => setNotifications(res.notifications)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unreadCount = useUnreadNotificationCount();
  const visibleNotifications = notifications;

  const handleViewAll = () => {
    setOpen(false);
    setDrawerOpen(true);
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="relative flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card hover:text-text"
          aria-label="Notifications"
          aria-expanded={open}
        >
          <BellIcon className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger-700 text-xs font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-88 overflow-hidden rounded-lg border border-border/80 bg-card shadow-(--shadow-overlay)">
            <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2">
              <span className="text-xs font-semibold text-text">Notifications</span>
              <Button
                variant="link"
                size="sm"
                onClick={handleViewAll}
              >
                View all
              </Button>
            </div>
            <div className="max-h-120 overflow-x-hidden overflow-y-auto">
              {visibleNotifications.length === 0 ? (
                <span className="block py-5 text-center text-xs text-text-muted">No new notifications</span>
              ) : (
                visibleNotifications.map((n) => (
                  <NotificationDropdownItem
                    key={n.id}
                    notification={n}
                    onNavigate={() => setOpen(false)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <NotificationDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}

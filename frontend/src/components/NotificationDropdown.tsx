import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { notificationsApi } from "../services/api";
import type { Notification } from "../services/notifications";
import NotificationContent from "./NotificationContent";
import NotificationTitleLink from "./NotificationTitleLink";
import BellIcon from "./icons/outlined/BellIcon";

export default function NotificationDropdown() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    notificationsApi.list(true).then((res) => setNotifications(res.notifications)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkRead = async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-card hover:text-text transition-colors relative"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 size-4  bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-88 bg-card border border-border/80 rounded-lg shadow-(--shadow-card-hover) z-50 overflow-hidden">
          <div className="px-3.5 py-2 border-b border-border/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-text">Notifications</span>
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-[11px] text-primary hover:text-primary/80 font-medium">
              View all
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <span className="block text-xs text-text-muted text-center py-5">No new notifications</span>
            ) : (
              notifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  className={`px-3.5 py-2 border-b border-border/40 last:border-b-0 transition-colors hover:bg-muted/40 ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <NotificationTitleLink
                          notification={n}
                          unread={!n.read}
                          className="text-xs/snug "
                          onNavigate={() => setOpen(false)}
                        />
                        <time className="text-[11px] leading-snug text-text-muted shrink-0 whitespace-nowrap">
                          {new Date(n.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <NotificationContent notification={n} compact />
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n.id)}
                        className="text-[11px] text-primary hover:text-primary/80 font-medium whitespace-nowrap shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

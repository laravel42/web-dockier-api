import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { notificationsApi } from "../services/api";
import BellIcon from "./icons/outlined/BellIcon";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

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
        className="p-2 rounded-lg text-text-secondary hover:bg-secondary-50 hover:text-text transition-colors relative"
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
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border/80 rounded-lg shadow-(--shadow-card-hover) z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-text">Notifications</span>
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-primary-500 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No new notifications</p>
            ) : (
              notifications.slice(0, 5).map((n) => (
                <div key={n.id} className={`px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary-50 transition-colors ${!n.read ? "bg-primary-50/30" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <p className={`text-sm truncate min-w-0 ${!n.read ? "font-medium text-text" : "text-text-secondary"}`}>{n.title}</p>
                        <time className="text-[10px] leading-snug text-text-muted shrink-0 whitespace-nowrap">
                          {new Date(n.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="text-[11px] leading-snug text-text-muted mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    {!n.read && (
                      <button onClick={() => handleMarkRead(n.id)} className="text-[10px] text-primary-500 hover:text-primary-700 font-medium whitespace-nowrap shrink-0">
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

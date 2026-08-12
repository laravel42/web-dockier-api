import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { notificationsApi } from "../services/api";
import type { Notification } from "../types";
import NotificationContent from "./NotificationContent";
import NotificationTitleLink from "./NotificationTitleLink";
import { BellIcon, SquareCheckIcon } from "lucide-react";

const DISMISS_MS = 280;

type NotificationDropdownItemProps = {
  notification: Notification;
  dismissing: boolean;
  onMarkRead: (id: string) => void;
  onDismissed: (id: string) => void;
  onNavigate: () => void;
};

function NotificationDropdownItem({
  notification,
  dismissing,
  onMarkRead,
  onDismissed,
  onNavigate,
}: NotificationDropdownItemProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!dismissing) {
      dismissedRef.current = false;
      return;
    }
    if (!rowRef.current) return;

    const el = rowRef.current;
    const finish = () => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      onDismissed(notification.id);
    };

    const onEnd = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== "grid-template-rows") return;
      finish();
    };

    el.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finish, DISMISS_MS + 50);

    return () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [dismissing, notification.id, onDismissed]);

  return (
    <div
      ref={rowRef}
      className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
        dismissing ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
      }`}
    >
      <div className="overflow-hidden">
        <div
          className={`border-b border-border/40 px-3.5 py-2 transition-all duration-300 ease-out hover:bg-muted/40 bg-primary/5 ${
            dismissing ? "pointer-events-none translate-x-full opacity-0" : "translate-x-0 opacity-100"
          }`}
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <NotificationTitleLink
              notification={notification}
              unread
              className="min-w-0 flex-1 text-xs/snug"
              onNavigate={onNavigate}
            />
            <div className="flex shrink-0 items-center gap-1.5 leading-none">
              <time className="text-[11px] leading-snug whitespace-nowrap text-text-muted">
                {new Date(notification.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
              {!dismissing && (
                <button
                  type="button"
                  onClick={() => onMarkRead(notification.id)}
                  aria-label="Mark as read"
                  title="Mark as read"
                  className="inline-flex shrink-0 items-center justify-center p-0 text-primary transition-colors hover:text-primary/80"
                >
                  <SquareCheckIcon className="size-4 hover:bg-primary/10" />
                </button>
              )}
            </div>
          </div>
          <NotificationContent notification={notification} compact />
        </div>
      </div>
    </div>
  );
}

export default function NotificationDropdown() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(() => new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    notificationsApi.list({ unreadOnly: true }).then((res) => setNotifications(res.notifications)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unreadCount = notifications.filter((n) => !dismissingIds.has(n.id)).length;

  const handleDismissed = useCallback((id: string) => {
    setDismissingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setNotifications((prev) => (prev.some((n) => n.id === id) ? prev.filter((n) => n.id !== id) : prev));
  }, []);

  const handleMarkRead = (id: string) => {
    setDismissingIds((prev) => new Set(prev).add(id));
    void notificationsApi.markRead(id).catch(() => {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      notificationsApi.list({ unreadOnly: true }).then((res) => setNotifications(res.notifications)).catch(() => {});
    });
  };

  const visibleNotifications = notifications.slice(0, 5);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card hover:text-text"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <BellIcon className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger-700 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-88 overflow-hidden rounded-lg border border-border/80 bg-card shadow-(--shadow-overlay)">
          <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2">
            <span className="text-xs font-semibold text-text">Notifications</span>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-primary hover:text-primary/80"
            >
              View all
            </Link>
          </div>
          <div className="max-h-80 overflow-x-hidden overflow-y-auto">
            {visibleNotifications.length === 0 ? (
              <span className="block py-5 text-center text-xs text-text-muted">No new notifications</span>
            ) : (
              visibleNotifications.map((n) => (
                <NotificationDropdownItem
                  key={n.id}
                  notification={n}
                  dismissing={dismissingIds.has(n.id)}
                  onMarkRead={handleMarkRead}
                  onDismissed={handleDismissed}
                  onNavigate={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

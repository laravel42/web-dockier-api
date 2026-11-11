import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsApi } from "../services/api";
import type { Notification } from "../types";
import { getNotificationDetailPath } from "../utils/notificationContent";
import { notifyNotificationsRead } from "../hooks/useUnreadNotificationCount";
import { clickableProps } from "../utils/a11y";
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
import PageError from "./ui/PageError";
import { useAsyncData } from "../hooks/useAsyncData";
import { useToast } from "../context/useToast";
import { getErrorMessage } from "../utils/errors";

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
      {...clickableProps(handleClick, Boolean(to) || !notification.read)}
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
          // The row itself is keyboard-activatable; without this, Enter/Space on
          // this button would bubble up and navigate away instead.
          onKeyDown={(e) => e.stopPropagation()}
        >
          Mark as read
        </Button>
      )}
    </div>
  );
}

export default function NotificationDrawer({ open, onOpenChange }: NotificationDrawerProps) {
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const { data, error, reload } = useAsyncData(
    () => notificationsApi.list({ limit: PAGE_SIZE, offset }),
    [offset],
    { enabled: open },
  );
  const notifications: Notification[] = data?.notifications ?? [];
  const pagination = data?.pagination ?? { total: 0, limit: PAGE_SIZE, offset };

  // Reopen on the first page, as the drawer always did.
  useEffect(() => {
    if (!open) setOffset(0);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      notifyNotificationsRead();
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to mark notification as read"));
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      notifyNotificationsRead();
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to mark all notifications as read"));
    }
  };

  const goToPage = (page: number) => {
    setOffset((page - 1) * PAGE_SIZE);
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/*
        The title names this drawer and the list speaks for itself, so there is
        no description to give. Radix points `aria-describedby` at an id it
        expects a <DrawerDescription> to own; left at its default it is a
        dangling IDREF, hence the explicit undefined.
      */}
      <DrawerContent aria-describedby={undefined}>
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
          {error ? (
            <PageError message={error} onRetry={reload} />
          ) : !data ? (
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

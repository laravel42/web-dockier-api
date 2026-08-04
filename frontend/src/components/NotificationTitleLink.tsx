import { Link } from "react-router-dom";
import type { Notification } from "../types";
import { getNotificationDetailPath } from "../utils/notificationContent";

interface Props {
  notification: Notification;
  unread: boolean;
  className?: string;
  onNavigate?: () => void;
}

export default function NotificationTitleLink({ notification, unread, className = "", onNavigate }: Props) {
  const to = getNotificationDetailPath(notification);
  const labelCls = unread ? "font-medium text-text" : "text-text-muted";

  if (!to) {
    return (
      <span className={`truncate min-w-0 ${labelCls} ${className}`}>
        {notification.title}
      </span>
    );
  }

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`truncate min-w-0 ${labelCls} hover:text-primary transition-colors ${className}`}
    >
      {notification.title}
    </Link>
  );
}

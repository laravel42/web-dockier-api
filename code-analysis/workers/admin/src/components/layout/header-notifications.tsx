"use client";

import { Bell } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type HeaderNotification = {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
};

const INITIAL_NOTIFICATIONS: HeaderNotification[] = [
  {
    id: "1",
    title: "Order shipped",
    description: "ORD-52108 left the Chicago sort hub.",
    time: "2m ago",
    read: false,
  },
  {
    id: "2",
    title: "Low stock alert",
    description: "Radiance Ritual Set is below the reorder point.",
    time: "1h ago",
    read: false,
  },
  {
    id: "3",
    title: "Customer message",
    description: "North Clark Wholesale replied to your invoice thread.",
    time: "3h ago",
    read: true,
  },
  {
    id: "4",
    title: "Payout deposited",
    description: "Last week’s Stripe payout hit your account.",
    time: "Yesterday",
    read: true,
  },
];

export function HeaderNotifications() {
  const [notifications, setNotifications] = React.useState(
    INITIAL_NOTIFICATIONS,
  );
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markOneRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative size-9"
          aria-label={
            unreadCount
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 p-0" align="end">
        <DropdownMenuLabel className="px-3 py-2 text-sm font-normal">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  markAllRead();
                }}
              >
                Mark all as read
              </button>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[min(320px,50vh)]">
          <div className="flex flex-col py-1">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  "focus:bg-accent cursor-pointer items-start rounded-none px-3 py-2.5",
                  !n.read && "bg-accent/40",
                )}
                onSelect={() => {
                  markOneRead(n.id);
                }}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm leading-tight",
                        !n.read && "font-semibold",
                      )}
                    >
                      {n.title}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-[10px] whitespace-nowrap">
                      {n.time}
                    </span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">
                    {n.description}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

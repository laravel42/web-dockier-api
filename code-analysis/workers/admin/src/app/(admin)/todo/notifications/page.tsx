"use client";

import { Bell, CheckCircle, TrendingUp, Users, Zap } from "lucide-react";
import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
} from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type NotificationType = {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  iconBgColor: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp: string;
  isRead: boolean;
};

const mockNotifications: NotificationType[] = [
  {
    id: "1",
    icon: Zap,
    iconColor: "text-white",
    iconBgColor: "bg-red-500",
    title: "Karma unlocked!",
    description:
      "You're now a Karma Novice. Get things done to earn points and climb the ranks.",
    action: {
      label: "Explore Productivity",
      onClick: () => console.log("Explore Productivity clicked"),
    },
    timestamp: "50 minutes ago",
    isRead: false,
  },
  {
    id: "2",
    icon: CheckCircle,
    iconColor: "text-white",
    iconBgColor: "bg-green-500",
    title: "Task completed!",
    description: 'You completed "Design new landing page" in Project Alpha.',
    timestamp: "2 hours ago",
    isRead: true,
  },
  {
    id: "3",
    icon: Users,
    iconColor: "text-white",
    iconBgColor: "bg-blue-500",
    title: "New collaborator",
    description: "John Doe has been added to your workspace.",
    timestamp: "5 hours ago",
    isRead: true,
  },
  {
    id: "4",
    icon: TrendingUp,
    iconColor: "text-white",
    iconBgColor: "bg-purple-500",
    title: "Weekly summary",
    description: "You completed 12 tasks this week. Great work!",
    timestamp: "1 day ago",
    isRead: true,
  },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const unreadNotifications = notifications.filter((n) => !n.isRead);

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  };

  const renderNotifications = (
    notificationsList: NotificationType[],
    emptyMessage: string,
  ) => {
    if (notificationsList.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell />
            </EmptyMedia>
            <EmptyTitle>No notifications yet</EmptyTitle>
            <EmptyDescription>{emptyMessage}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <ItemGroup className="">
        {notificationsList.map((notification) => (
          <Fragment key={notification.id}>
            <ItemSeparator />
            <Item
              variant="outline"
              className={cn(
                "items-start border-0 border-l-4",
                !notification.isRead
                  ? "bg-muted border-l-red-500"
                  : "border-l-transparent",
              )}
            >
              <ItemMedia>
                <div
                  className={cn(
                    "mt-1 flex size-8 items-center justify-center rounded-full",
                    notification.iconBgColor,
                  )}
                >
                  <notification.icon
                    className={cn("size-4", notification.iconColor)}
                  />
                </div>
              </ItemMedia>
              <ItemContent>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{notification.title}</span>{" "}
                      {notification.description}
                    </p>
                    {notification.action && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={notification.action.onClick}
                        className="my-1"
                      >
                        {notification.action.label}
                      </Button>
                    )}
                    <div className="flex items-end justify-between">
                      <p className="text-muted-foreground mt-1 text-xs">
                        {notification.timestamp}
                      </p>
                      {!notification.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="text-destructive hover:text-destructive/80 shrink-0 transition-colors"
                          title="Mark as read"
                        >
                          <div className="border-destructive bg-destructive flex size-2 animate-pulse items-center justify-center rounded-full border" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </ItemContent>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    );
  };

  return (
    <>
      <h1 className="text-2xl font-bold">Notifications</h1>

      <Tabs defaultValue="all" className="mt-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          {renderNotifications(
            notifications,
            "You're all caught up. No new notifications.",
          )}
        </TabsContent>
        <TabsContent value="unread" className="mt-4">
          {renderNotifications(
            unreadNotifications,
            "All notifications have been read",
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

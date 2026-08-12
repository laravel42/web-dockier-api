"use client";

import {
  Archive,
  Check,
  CheckCheck,
  MoreHorizontal,
  Paperclip,
  Send,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import * as React from "react";

import {
  INITIAL_PROJECT_ISSUES,
  type IssueStatus,
  type ProjectIssue,
} from "@/components/project-management/issue-core";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type NotificationType =
  | "comment"
  | "mention"
  | "assignment"
  | "status"
  | "reopened"
  | "closed"
  | "edited"
  | "created"
  | "upload";

type InboxUser = {
  id: string;
  name: string;
  avatar: string;
  fallback: string;
};

type InboxNotification = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  sortIndex: number;
  status: IssueStatus;
  content: string;
  type: NotificationType;
  user: InboxUser;
  timestamp: string;
  read: boolean;
};

type IssueDocument = {
  intro: string;
  sections: {
    title: string;
    items: {
      title: string;
      detail: string;
    }[];
  }[];
};

const users: InboxUser[] = [
  {
    id: "nina",
    name: "Nina Oliver",
    avatar: "/avatars/avatar-1.png",
    fallback: "NO",
  },
  {
    id: "morgan",
    name: "Morgan Lee",
    avatar: "/avatars/avatar-2.png",
    fallback: "ML",
  },
  {
    id: "avi",
    name: "Avi Kapoor",
    avatar: "/avatars/avatar-3.png",
    fallback: "AK",
  },
  {
    id: "sarah",
    name: "Sarah Patel",
    avatar: "/avatars/avatar-4.png",
    fallback: "SP",
  },
  {
    id: "qa",
    name: "QA Bot",
    avatar: "/avatars/avatar-5.png",
    fallback: "QA",
  },
  {
    id: "caleb",
    name: "Caleb Kim",
    avatar: "/avatars/avatar-6.png",
    fallback: "CK",
  },
  {
    id: "timeline",
    name: "Timeline sync",
    avatar: "/avatars/avatar-bw-1.png",
    fallback: "TS",
  },
];

const issueActivity: Record<
  ProjectIssue["id"],
  Pick<InboxNotification, "content" | "type" | "user" | "timestamp" | "read">
> = {
  "issue-001": {
    content: "Nina attached the revised rollout map",
    type: "upload",
    user: users[0],
    timestamp: "10h",
    read: false,
  },
  "issue-002": {
    content: "Interaction states renamed for the Gantt review",
    type: "edited",
    user: users[1],
    timestamp: "1d",
    read: false,
  },
  "issue-003": {
    content: "Filters now match the saved project view rules",
    type: "status",
    user: users[6],
    timestamp: "2d",
    read: false,
  },
  "issue-004": {
    content: "Sarah asked for one more resize edge case",
    type: "comment",
    user: users[3],
    timestamp: "4d",
    read: true,
  },
  "issue-005": {
    content: "Empty-state copy is ready for timeline QA",
    type: "mention",
    user: users[4],
    timestamp: "6d",
    read: true,
  },
  "issue-006": {
    content: "Handoff notes accepted by release owner",
    type: "closed",
    user: users[6],
    timestamp: "1w",
    read: true,
  },
  "issue-007": {
    content: "Quarter density review is waiting on screenshots",
    type: "assignment",
    user: users[5],
    timestamp: "1w",
    read: false,
  },
  "issue-008": {
    content: "Calendar follow-up screen was added to backlog",
    type: "created",
    user: users[2],
    timestamp: "2w",
    read: true,
  },
};

const inboxItems: InboxNotification[] = INITIAL_PROJECT_ISSUES.map((issue) => {
  const activity = issueActivity[issue.id];

  return {
    id: issue.id,
    identifier: issue.code,
    title: issue.title,
    description:
      issue.description ??
      `Project issue in ${issue.status.toLowerCase()} for the Renewal Forecast Console workspace.`,
    sortIndex: Number.parseInt(issue.code.replace("RFC-", ""), 10),
    status: issue.status,
    ...activity,
  };
}).concat([
  {
    id: "issue-003-followup",
    identifier: "RFC-103",
    title: "Sync issue filters with project views",
    description:
      "Project issue in review for the Renewal Forecast Console workspace.",
    sortIndex: 103.1,
    status: "Review",
    content: "Avi flagged one workspace filter edge case before sign-off",
    type: "comment",
    user: users[2],
    timestamp: "3d",
    read: true,
  },
  {
    id: "issue-005-followup",
    identifier: "RFC-105",
    title: "Create empty and loading timeline states",
    description:
      "Project issue in planned for the Renewal Forecast Console workspace.",
    sortIndex: 105.1,
    status: "Planned",
    content: "QA Bot reopened the loading skeleton review after visual drift",
    type: "reopened",
    user: users[4],
    timestamp: "1w",
    read: false,
  },
  {
    id: "issue-001-followup",
    identifier: "RFC-101",
    title: "Finalize issue timeline architecture",
    description:
      "Project issue in in progress for the Renewal Forecast Console workspace.",
    sortIndex: 101.1,
    status: "In Progress",
    content: "Morgan mentioned the dependency map in the launch handoff thread",
    type: "mention",
    user: users[1],
    timestamp: "1w",
    read: true,
  },
  {
    id: "issue-008-followup",
    identifier: "RFC-108",
    title: "Prepare issue calendar follow-up screen",
    description:
      "Project issue in backlog for the Renewal Forecast Console workspace.",
    sortIndex: 108.1,
    status: "Backlog",
    content: "Timeline sync attached the first follow-up screen checklist",
    type: "upload",
    user: users[6],
    timestamp: "2w",
    read: true,
  },
]);

const notificationTypeLabel: Record<NotificationType, string> = {
  comment: "Comment",
  mention: "Mention",
  assignment: "Assigned",
  status: "Status change",
  reopened: "Reopened",
  closed: "Closed",
  edited: "Edited",
  created: "Created",
  upload: "Attachment",
};

const issueDocuments: Record<string, IssueDocument> = {
  "RFC-101": {
    intro:
      "This issue defines the timeline architecture the rest of the planning surfaces inherit, so changes here flow into gantt, spreadsheet, and launch review.",
    sections: [
      {
        title: "Current scope",
        items: [
          {
            title: "Dependency ordering",
            detail:
              "Timeline steps need to match the release handoff path so downstream views never disagree about sequence.",
          },
          {
            title: "Shared interaction model",
            detail:
              "The architecture should support the same drag, hover, and dependency language across every issue surface.",
          },
        ],
      },
      {
        title: "Next checks",
        items: [
          {
            title: "Review the rollout map",
            detail:
              "Nina's updated map is the source of truth for the last structure pass before sign-off.",
          },
          {
            title: "Confirm planning parity",
            detail:
              "The final pass should compare timeline output with the spreadsheet and quarter views.",
          },
        ],
      },
    ],
  },
  "RFC-102": {
    intro:
      "The gantt review is about making interaction states feel like a continuation of the spreadsheet instead of a separate tool.",
    sections: [
      {
        title: "What changed",
        items: [
          {
            title: "State names were aligned",
            detail:
              "Labels now follow the same review language used in the rest of the project workspace.",
          },
          {
            title: "Hover and focus need one treatment",
            detail:
              "The current states still read as two parallel systems, which makes the gantt feel heavier than it should.",
          },
        ],
      },
      {
        title: "Follow-up",
        items: [
          {
            title: "Validate drag states",
            detail:
              "The remaining review step is a drag-state pass against the latest spreadsheet interactions.",
          },
          {
            title: "Keep transition copy tight",
            detail:
              "Any status label used here should also make sense in inbox summaries and handoff notes.",
          },
        ],
      },
    ],
  },
  "RFC-103": {
    intro:
      "Saved project views and spreadsheet filters now need to tell the same story, otherwise triage changes depending on where the team opens the issue.",
    sections: [
      {
        title: "What changed",
        items: [
          {
            title: "Saved view rules now drive the toolbar",
            detail:
              "The spreadsheet filter state resolves from the same project view rules used elsewhere in the workspace.",
          },
          {
            title: "Display controls are synced",
            detail:
              "Toolbar filters and issue view settings now move together instead of drifting per surface.",
          },
        ],
      },
      {
        title: "What to verify",
        items: [
          {
            title: "Workspace cache edge case",
            detail:
              "Avi flagged one cache path that still needs a final browser pass before the review note goes out.",
          },
          {
            title: "Cross-surface consistency",
            detail:
              "Confirm the inbox summary, spreadsheet state, and saved view all show the same filtered issue set.",
          },
        ],
      },
      {
        title: "Notes for the handoff",
        items: [
          {
            title: "Mention the saved view source",
            detail:
              "Any release note should call out that filters are now inherited from project views, not duplicated locally.",
          },
          {
            title: "Keep the QA note short",
            detail:
              "One sentence on the fixed edge case is enough once the browser verification lands.",
          },
        ],
      },
    ],
  },
  "RFC-104": {
    intro:
      "This work documents how drag and resize should behave in the spreadsheet so dense editing still feels predictable during review.",
    sections: [
      {
        title: "Main concerns",
        items: [
          {
            title: "Resize edge cases",
            detail:
              "Sarah called out one more resize path where the final cell width can feel unstable under repeated edits.",
          },
          {
            title: "Sticky row overlap",
            detail:
              "The documentation should capture how sticky rows behave during hover so the visual model stays coherent.",
          },
        ],
      },
      {
        title: "Documentation shape",
        items: [
          {
            title: "Start with the default behavior",
            detail:
              "Describe the ordinary drag and resize loop first before listing any exceptions or hover edge cases.",
          },
          {
            title: "Call out review cases explicitly",
            detail:
              "A short checklist of edge cases will make QA and design review faster than a long narrative explanation.",
          },
        ],
      },
    ],
  },
  "RFC-105": {
    intro:
      "Empty and loading states carry more weight than they look like they do, because they are the first thing the team sees when data is missing or still arriving.",
    sections: [
      {
        title: "Current progress",
        items: [
          {
            title: "Copy is approved",
            detail:
              "The empty-state language is already in a good place and reads clearly inside the timeline workspace.",
          },
          {
            title: "Visual drift is the blocker",
            detail:
              "QA reopened the loading skeleton review after spacing drift showed up between related screens.",
          },
        ],
      },
      {
        title: "What remains",
        items: [
          {
            title: "Tighten responsive spacing",
            detail:
              "The mobile and narrow desktop variants still need one consistent spacing pass before this can close.",
          },
          {
            title: "Keep state hierarchy obvious",
            detail:
              "Loading, empty, and filtered-no-results should still feel related without collapsing into one pattern.",
          },
        ],
      },
    ],
  },
  "RFC-106": {
    intro:
      "Dependencies and handoff notes are complete, but the final record still matters because later planning views depend on this issue being clearly closed.",
    sections: [
      {
        title: "Completed work",
        items: [
          {
            title: "Mock dependency chain",
            detail:
              "The release owner accepted the dependency structure and the related notes are attached to the project record.",
          },
          {
            title: "Handoff language",
            detail:
              "Final handoff notes now match the release checklist wording, which avoids duplicate explanations downstream.",
          },
        ],
      },
      {
        title: "Archive guidance",
        items: [
          {
            title: "Keep one reference path",
            detail:
              "Later views should point to the release checklist rather than introducing a second handoff summary.",
          },
          {
            title: "Preserve the closeout note",
            detail:
              "The accepted handoff note is still useful context when this issue shows up in history or follow-up review.",
          },
        ],
      },
    ],
  },
  "RFC-107": {
    intro:
      "Quarter view density is close, but the missing screenshots make it hard to lock the final balance between readability and compactness.",
    sections: [
      {
        title: "In review",
        items: [
          {
            title: "Screenshot set is incomplete",
            detail:
              "Caleb is still waiting on the last annotated captures before the density pass can be evaluated properly.",
          },
          {
            title: "Standup readability matters",
            detail:
              "This view is used in live planning conversations, so dense is fine as long as scanning still feels easy.",
          },
        ],
      },
      {
        title: "What to compare",
        items: [
          {
            title: "Quarter view versus spreadsheet",
            detail:
              "The final density should feel like the same design system, not a more cramped product living next door.",
          },
          {
            title: "Title and metadata balance",
            detail:
              "Any compacting pass should preserve the issue title as the first scannable element.",
          },
        ],
      },
    ],
  },
  "RFC-108": {
    intro:
      "The follow-up calendar screen is still early, but the checklist is detailed enough that this can move quickly once capacity opens up.",
    sections: [
      {
        title: "Available input",
        items: [
          {
            title: "Initial checklist is attached",
            detail:
              "Timeline sync already uploaded the screen checklist, which gives the first implementation pass enough direction.",
          },
          {
            title: "Calendar behavior is the main unknown",
            detail:
              "The screen still needs clearer rules around how follow-up dates surface next to issue planning states.",
          },
        ],
      },
      {
        title: "Recommended next pass",
        items: [
          {
            title: "Turn the checklist into one concrete draft",
            detail:
              "A single clickable follow-up view will answer more questions than expanding the checklist further.",
          },
          {
            title: "Align with the quarter workflow",
            detail:
              "This should connect naturally with quarter planning instead of feeling like an isolated calendar tool.",
          },
        ],
      },
    ],
  },
};

function getNotificationOrder(notification: InboxNotification) {
  return notification.sortIndex;
}

const statusIconClass: Record<IssueStatus, string> = {
  Backlog: "text-muted-foreground",
  Planned: "text-primary/60",
  "In Progress": "text-primary",
  Review: "text-primary/80",
  Done: "text-primary/75",
};

function StatusIcon({ status }: { status: IssueStatus }) {
  const className = cn("size-3.5", statusIconClass[status]);

  if (status === "Done") {
    return (
      <svg viewBox="0 0 14 14" fill="none" className={className}>
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="2" />
        <path
          d="M4.5 7 6.35 8.85 9.65 5.15"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (status === "Backlog") {
    return (
      <svg viewBox="0 0 14 14" fill="none" className={className}>
        <circle
          cx="7"
          cy="7"
          r="6"
          stroke="currentColor"
          strokeDasharray="1.4 1.74"
          strokeWidth="2"
        />
      </svg>
    );
  }

  const progress: Record<IssueStatus, string> = {
    Backlog: "0 100",
    Planned: "0 100",
    "In Progress": "3.2 100",
    Review: "5 100",
    Done: "0 100",
  };

  return (
    <svg viewBox="0 0 14 14" fill="none" className={className}>
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r="2"
        stroke="currentColor"
        strokeDasharray={progress[status]}
        strokeWidth="4"
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

function NotificationBox({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 78 80"
      fill="none"
      className={cn("text-current", className)}
      aria-hidden="true"
    >
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.3"
        d="M28.5 60.5h21m-37-5.5-1 4.5M65 55l1 4.5"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.6"
        d="M10.4 9.11A10 10 0 0 1 20.22 1h37.56a10 10 0 0 1 9.82 8.11l8.11 42.2a10 10 0 0 1-9.82 11.9H54.7a6.36 6.36 0 0 0-5.65 3.45 6.36 6.36 0 0 1-5.66 3.45H34.6a6.36 6.36 0 0 1-5.66-3.45 6.36 6.36 0 0 0-5.65-3.46H12.1a10 10 0 0 1-9.8-11.89l8.11-42.2Z"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        opacity="0.6"
        d="M24.85 19h27.28m-28.26 7H53.1m-31.18 7h33.13M20 40h20"
      />
    </svg>
  );
}

function NotificationRow({
  notification,
  isSelected,
  showId,
  showStatusIcon,
  onSelect,
}: {
  notification: InboxNotification;
  isSelected: boolean;
  showId: boolean;
  showStatusIcon: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full px-1 py-0.5 text-left"
    >
      <div
        className={cn(
          "hover:bg-sidebar/80 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
          isSelected && "bg-accent/80",
        )}
      >
        <div className="shrink-0">
          <Avatar className="size-8">
            <AvatarImage
              src={notification.user.avatar}
              alt={notification.user.name}
            />
            <AvatarFallback className="text-xs">
              {notification.user.fallback}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {!notification.read && (
              <div className="bg-primary size-2 shrink-0 rounded-full" />
            )}
            {showId && (
              <span
                className={cn(
                  "text-muted-foreground shrink-0 text-sm font-medium",
                  notification.read && "opacity-50",
                )}
              >
                {notification.identifier}
              </span>
            )}
            <h4
              className={cn(
                "text-foreground min-w-0 flex-1 truncate text-sm font-medium",
                notification.read && "opacity-50",
              )}
            >
              {notification.title}
            </h4>
            {showStatusIcon && (
              <div className="shrink-0">
                <StatusIcon status={notification.status} />
              </div>
            )}
          </div>

          <div
            className={cn(
              "flex items-center justify-between gap-1.5 transition-opacity",
              notification.read && "opacity-50",
            )}
          >
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              {notification.content}
            </p>
            <span className="text-muted-foreground shrink-0 text-xs">
              {notification.timestamp}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function NotificationPreview({
  notification,
  unreadCount,
  onMarkAsRead,
}: {
  notification: InboxNotification | null;
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
}) {
  if (!notification) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <NotificationBox className="text-muted-foreground/50 mb-4 size-16" />
        <h3 className="text-muted-foreground mb-2 text-lg font-semibold">
          {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
        </h3>
        <p className="text-muted-foreground max-w-sm text-sm">
          Select a notification from the list to view its details and take
          action.
        </p>
      </div>
    );
  }

  const document = issueDocuments[notification.identifier];

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{notification.identifier}</span>
        </div>
        {!notification.read && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMarkAsRead(notification.id)}
            className="h-7 gap-1"
          >
            <Check />
            Mark as read
          </Button>
        )}
      </header>

      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-8 pt-12 pb-10">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="text-foreground font-medium">
              {notification.identifier}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span className="inline-flex items-center gap-1.5">
              <StatusIcon status={notification.status} />
              {notification.status}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span>{notificationTypeLabel[notification.type]}</span>
            <span className="text-muted-foreground/60">·</span>
            <span>
              {notification.user.name} · {notification.timestamp}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-foreground text-[1.5rem] leading-tight font-semibold md:text-[1.625rem]">
              {notification.title}
            </h3>
            <p className="text-muted-foreground text-sm leading-6">
              {notification.description}
            </p>
          </div>

          <div className="max-w-[68ch]">
            <p className="text-foreground text-sm leading-6">
              {document?.intro ?? notification.content}
            </p>
          </div>

          <div className="flex max-w-[72ch] flex-col gap-6">
            {document?.sections.map((section) => (
              <section key={section.title} className="flex flex-col gap-3">
                <h4 className="text-foreground text-base font-semibold">
                  {section.title}
                </h4>
                <ul className="flex list-disc flex-col gap-4 pl-5">
                  {section.items.map((item) => (
                    <li
                      key={item.title}
                      className="marker:text-muted-foreground"
                    >
                      <p className="text-foreground text-sm leading-6">
                        {item.title}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm leading-6">
                        {item.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="bg-background shrink-0 border-t px-4 py-4">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="relative flex w-full flex-col">
            <Textarea
              className="min-h-20 resize-none rounded-xl pb-14"
              placeholder="Reply or leave a note..."
            />
            <div className="absolute right-3 bottom-3 flex items-center gap-3">
              <Button size="icon" variant="ghost" aria-label="Attach file">
                <Paperclip />
              </Button>
              <Button size="icon" variant="secondary" aria-label="Send comment">
                <Send />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectManagementInbox3() {
  const [notifications, setNotifications] =
    React.useState<InboxNotification[]>(inboxItems);
  const [selectedNotificationId, setSelectedNotificationId] =
    React.useState("issue-003");
  const [showRead, setShowRead] = React.useState(true);
  const [showSnoozed, setShowSnoozed] = React.useState(false);
  const [showUnreadFirst, setShowUnreadFirst] = React.useState(false);
  const [ordering, setOrdering] = React.useState<"newest" | "oldest">("newest");
  const [showId, setShowId] = React.useState(true);
  const [showStatusIcon, setShowStatusIcon] = React.useState(true);
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = React.useState(false);

  const filteredNotifications = notifications
    .filter((notification) => showRead || !notification.read)
    .toSorted((a, b) => {
      if (showUnreadFirst && a.read !== b.read) {
        return a.read ? 1 : -1;
      }

      const direction = ordering === "newest" ? 1 : -1;

      return direction * (getNotificationOrder(a) - getNotificationOrder(b));
    });

  const selectedNotification =
    filteredNotifications.find(
      (notification) => notification.id === selectedNotificationId,
    ) ??
    filteredNotifications[0] ??
    null;

  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  const markAllAsRead = () => {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        read: true,
      })),
    );
  };

  const markAsRead = (id: string) => {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
    );
  };

  const handleSelectNotification = (notification: InboxNotification) => {
    setSelectedNotificationId(notification.id);

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobilePreviewOpen(true);
    }
  };

  const clearReadNotifications = () => {
    setNotifications((currentNotifications) =>
      currentNotifications.filter((notification) => !notification.read),
    );
  };

  return (
    <div
      data-layout="fixed"
      className="bg-background text-foreground flex min-h-0 flex-1 overflow-hidden"
    >
      <section className="flex min-h-0 w-full min-w-0 flex-col border-r md:w-[42.857%] md:max-w-[42.857%]">
        <header className="flex h-10 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Inbox</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 p-0">
                  <MoreHorizontal />
                  <span className="sr-only">Inbox actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setNotifications([])}>
                  <Trash2 />
                  Delete all notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={clearReadNotifications}>
                  <CheckCheck />
                  Delete all read notifications
                </DropdownMenuItem>
                <DropdownMenuItem onClick={clearReadNotifications}>
                  <Archive />
                  Delete notifications for completed issues
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="size-7 p-0"
            >
              <CheckCheck />
              <span className="sr-only">Mark all as read</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 p-0">
                  <SlidersHorizontal />
                  <span className="sr-only">Display options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Ordering</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={ordering === "newest"}
                  onCheckedChange={() => setOrdering("newest")}
                >
                  Newest
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={ordering === "oldest"}
                  onCheckedChange={() => setOrdering("oldest")}
                >
                  Oldest
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator />

                <div className="flex flex-col gap-3 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="show-snoozed" className="text-sm">
                      Show snoozed
                    </Label>
                    <Switch
                      id="show-snoozed"
                      checked={showSnoozed}
                      onCheckedChange={setShowSnoozed}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="show-read" className="text-sm">
                      Show read
                    </Label>
                    <Switch
                      id="show-read"
                      checked={showRead}
                      onCheckedChange={setShowRead}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="show-unread-first" className="text-sm">
                      Show unread first
                    </Label>
                    <Switch
                      id="show-unread-first"
                      checked={showUnreadFirst}
                      onCheckedChange={setShowUnreadFirst}
                    />
                  </div>
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Display properties</DropdownMenuLabel>

                <div className="flex flex-col gap-3 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="show-id" className="text-sm">
                      ID
                    </Label>
                    <Switch
                      id="show-id"
                      checked={showId}
                      onCheckedChange={setShowId}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="show-status-icon" className="text-sm">
                      Status and icon
                    </Label>
                    <Switch
                      id="show-status-icon"
                      checked={showStatusIcon}
                      onCheckedChange={setShowStatusIcon}
                    />
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
          <div className="flex flex-col pb-1">
            {filteredNotifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                isSelected={selectedNotification?.id === notification.id}
                showId={showId}
                showStatusIcon={showStatusIcon}
                onSelect={() => handleSelectNotification(notification)}
              />
            ))}
          </div>
        </ScrollArea>
      </section>

      <section className="hidden min-h-0 min-w-0 flex-1 md:block">
        <NotificationPreview
          notification={selectedNotification}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
        />
      </section>

      <Drawer open={isMobilePreviewOpen} onOpenChange={setIsMobilePreviewOpen}>
        <DrawerContent className="h-[90vh] overflow-hidden md:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Notification detail</DrawerTitle>
          </DrawerHeader>
          <NotificationPreview
            notification={selectedNotification}
            unreadCount={unreadCount}
            onMarkAsRead={markAsRead}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

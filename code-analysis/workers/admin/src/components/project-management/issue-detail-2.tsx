"use client";

import {
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  Link2,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Pencil,
  Plus,
  SmilePlus,
  Upload,
  Users,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const issue = {
  id: "PM-284",
  title: "Improve task assignment workflow for multi-team projects",
  assignee: {
    name: "Olivia Rhye",
    initials: "OR",
    avatar: "/avatars/avatar-1.png",
  },
  reporter: {
    name: "Noah Kim",
    initials: "NK",
    avatar: "/avatars/avatar-4.png",
  },
  dueDate: "Jun 6, 2025",
  estimate: "8 pts",
  project: "Phoenix Platform",
  team: "Platform Team",
  cycle: "Sprint 24",
  labels: ["workflow", "assignment", "ux"],
  created: "May 14, 2025",
  updated: "May 20, 2025 (2 days ago)",
};

const topProperties = [
  { label: "Assignee", person: issue.assignee },
  { label: "Reporter", person: issue.reporter },
  { label: "Due date", icon: CalendarDays, value: issue.dueDate },
  { label: "Estimate", icon: Clock3, value: issue.estimate },
];

const metaProperties = [
  { label: "Project", icon: Folder, value: issue.project, badge: "project" },
  { label: "Team", icon: Users, value: issue.team, badge: "team" },
  { label: "Cycle", icon: Circle, value: issue.cycle, badge: "cycle" },
];

const initialSubtasks = [
  {
    title: "Design assignment flow and interactions",
    done: true,
    assignee: issue.assignee,
    status: "Done",
    date: "May 16, 2025",
  },
  {
    title: "Build team-based assignee suggestions",
    done: true,
    assignee: issue.reporter,
    status: "Done",
    date: "May 18, 2025",
  },
  {
    title: "Implement bulk assignment API",
    done: false,
    assignee: {
      name: "Emma Hall",
      initials: "EH",
      avatar: "/avatars/avatar-2.png",
    },
    status: "In Progress",
    date: "May 29, 2025",
  },
  {
    title: "Add workload awareness and capacity checks",
    done: false,
    assignee: {
      name: "Liam Patel",
      initials: "LP",
      avatar: "/avatars/avatar-5.png",
    },
    status: "To Do",
    date: "Jun 2, 2025",
  },
  {
    title: "Write tests and update documentation",
    done: false,
    assignee: {
      name: "Sofia Chen",
      initials: "SC",
      avatar: "/avatars/avatar-3.png",
    },
    status: "To Do",
    date: "Jun 5, 2025",
  },
];

type Subtask = (typeof initialSubtasks)[number];

const commentFeed = [
  {
    id: 1,
    type: "created",
    person: issue.assignee,
    date: "May 14, 2025",
  },
  {
    id: 2,
    type: "updated",
    person: issue.assignee,
    date: "May 15, 2025",
  },
  {
    id: 3,
    type: "assigned",
    person: issue.reporter,
    date: "May 15, 2025",
  },
  {
    id: 4,
    type: "commented",
    person: issue.reporter,
    comment:
      "Love this direction. For bulk assignment, should we consider team capacity thresholds?",
    date: "May 15, 2025 at 10:24 AM",
  },
  {
    id: 5,
    type: "viewed",
    person: issue.assignee,
    date: "May 15, 2025 at 11:02 AM",
  },
  {
    id: 6,
    type: "completed",
    person: {
      name: "Liam Patel",
      initials: "LP",
      avatar: "/avatars/avatar-5.png",
    },
    date: "May 16, 2025 at 9:18 AM",
  },
];

const activityGroups = [
  {
    date: "May 20, 2025",
    items: [
      {
        actor: issue.assignee,
        text: "changed status",
        time: "2:30 PM",
        chips: ["To Do", "In Progress"],
      },
      {
        actor: issue.assignee,
        text: "updated labels",
        time: "2:28 PM",
        chips: ["workflow", "assignment"],
      },
      {
        actor: issue.reporter,
        text: "added a comment",
        time: "10:24 AM",
        chips: [],
      },
    ],
  },
  {
    date: "May 18, 2025",
    items: [
      {
        actor: issue.reporter,
        text: "moved subtask",
        detail: "Build team-based assignee suggestions",
        time: "4:15 PM",
        chips: ["To Do", "Done"],
      },
    ],
  },
  {
    date: "May 16, 2025",
    items: [
      {
        actor: issue.assignee,
        text: "created the issue",
        time: "9:41 AM",
        chips: [],
      },
    ],
  },
];

const attachments = [
  {
    name: "assignment-flow-spec.pdf",
    type: "PDF",
    size: "1.2 MB",
    date: "May 15, 2025",
    icon: FileText,
  },
  {
    name: "assignment-mockups.sketch",
    type: "Sketch",
    size: "3.4 MB",
    date: "May 15, 2025",
    icon: Upload,
  },
  {
    name: "team-capacity-analysis.xlsx",
    type: "XLSX",
    size: "48 KB",
    date: "May 16, 2025",
    icon: FileSpreadsheet,
  },
];

const linkedIssues = [
  {
    id: "PM-210",
    title: "Team workload visibility dashboard",
    status: "In Progress",
  },
  { id: "PM-197", title: "Role-based permissions overhaul", status: "Done" },
];

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="h-6 rounded-md px-2 text-xs font-medium"
    >
      {children}
    </Badge>
  );
}

function SoftBadge({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-xs font-medium",
        active
          ? "bg-primary/10 text-primary"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}

function IconButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("size-10 rounded-md", className)}
    >
      {children}
    </Button>
  );
}

function PersonAvatar({
  person,
  size = "md",
}: {
  person: { name: string; initials: string; avatar: string };
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Avatar
      className={cn(
        "shrink-0",
        size === "sm" && "size-6",
        size === "md" && "size-8",
        size === "lg" && "size-10",
      )}
    >
      <AvatarImage src={person.avatar} alt={person.name} />
      <AvatarFallback>{person.initials}</AvatarFallback>
    </Avatar>
  );
}

function PropertyGrid() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 border-y py-4 sm:grid-cols-2 2xl:grid-cols-4">
      {topProperties.map((property) => {
        const Icon = property.icon;

        return (
          <div
            key={property.label}
            className="bg-card min-w-0 rounded-md border px-3 py-3 sm:border-0 sm:bg-transparent sm:px-5 sm:py-0 2xl:border-r 2xl:last:border-r-0"
          >
            <div className="text-muted-foreground mb-2 text-xs font-medium">
              {property.label}
            </div>
            <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
              {"person" in property && property.person ? (
                <>
                  <PersonAvatar person={property.person} size="sm" />
                  <span className="truncate">{property.person.name}</span>
                </>
              ) : (
                <>
                  {Icon ? (
                    <Icon className="text-muted-foreground size-5" />
                  ) : null}
                  <span className="truncate">{property.value}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetaGrid() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 py-4 sm:grid-cols-3 2xl:grid-cols-[1fr_1fr_1fr_1.55fr]">
      {metaProperties.map((property) => {
        const Icon = property.icon;

        return (
          <div key={property.label} className="min-w-0 px-1 sm:px-5">
            <div className="text-muted-foreground mb-2 text-xs font-medium">
              {property.label}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <SoftBadge active={property.badge === "cycle"}>
                <Icon className="mr-1.5 size-3.5" />
                {property.value}
              </SoftBadge>
            </div>
          </div>
        );
      })}

      <div className="col-span-2 min-w-0 px-1 sm:col-span-3 sm:px-5 2xl:col-span-1">
        <div className="text-muted-foreground mb-2 text-xs font-medium">
          Labels
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issue.labels.map((label, index) => (
            <SoftBadge key={label} active={index === 0}>
              {label}
            </SoftBadge>
          ))}
          <Button variant="ghost" size="icon" className="size-7 rounded-md">
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Subtasks() {
  const [items, setItems] = useState<Subtask[]>(initialSubtasks);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const completedCount = items.filter((item) => item.done).length;
  const progress = items.length
    ? Math.round((completedCount / items.length) * 100)
    : 0;

  const progressWidth = useMemo(
    () => `${Math.min(progress, 100)}%`,
    [progress],
  );

  function toggleSubtask(title: string) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.title === title
          ? {
              ...item,
              done: !item.done,
              status: item.done ? "To Do" : "Done",
            }
          : item,
      ),
    );
  }

  function showAddSubtask() {
    setIsAdding(true);
  }

  function addSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newTitle.trim();
    if (!title) return;

    setItems((currentItems) => [
      ...currentItems,
      {
        title,
        done: false,
        assignee: issue.assignee,
        status: "To Do",
        date: "Unscheduled",
      },
    ]);
    setNewTitle("");
    setIsAdding(false);
  }

  return (
    <section className="mb-7 border-y py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Subtasks</h2>
          <span className="text-muted-foreground text-sm">
            {completedCount} / {items.length}
          </span>
          <div className="bg-secondary h-1.5 min-w-28 flex-1 overflow-hidden rounded-full sm:w-52 sm:flex-none">
            <div
              className="bg-primary h-full rounded-full transition-[width]"
              style={{ width: progressWidth }}
            />
          </div>
          <span className="text-muted-foreground text-sm">{progress}%</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-md"
          onClick={showAddSubtask}
        >
          <Plus className="size-4" />
          Add subtask
        </Button>
      </div>

      <div className="flex flex-col">
        {items.map((subtask) => (
          <div
            key={subtask.title}
            className="grid min-h-9 grid-cols-[24px_minmax(0,1fr)] items-center gap-2 border-b last:border-b-0 md:grid-cols-[24px_minmax(0,1fr)_36px_104px_116px]"
          >
            <button
              type="button"
              aria-pressed={subtask.done}
              aria-label={`${subtask.done ? "Mark incomplete" : "Mark complete"}: ${subtask.title}`}
              onClick={() => toggleSubtask(subtask.title)}
              className={cn(
                "flex size-5 items-center justify-center rounded border",
                subtask.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background",
              )}
            >
              {subtask.done ? <Check className="size-3.5" /> : null}
            </button>
            <span
              className={cn(
                "truncate text-sm",
                subtask.done && "text-muted-foreground line-through",
              )}
            >
              {subtask.title}
            </span>
            <div className="hidden justify-self-end md:block">
              <PersonAvatar person={subtask.assignee} size="sm" />
            </div>
            <div className="hidden md:block">
              <StatusBadge>{subtask.status}</StatusBadge>
            </div>
            <span className="text-muted-foreground hidden text-sm md:block">
              {subtask.date}
            </span>
          </div>
        ))}
      </div>

      {isAdding ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={addSubtask}
        >
          <input
            autoFocus
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Subtask title"
            className="border-input bg-background focus-visible:ring-ring h-9 min-w-0 flex-1 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
          />
          <Button type="submit" size="sm" className="rounded-md">
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-md"
            onClick={() => {
              setNewTitle("");
              setIsAdding(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 rounded-md px-1"
          onClick={showAddSubtask}
        >
          <Plus className="size-4" />
          Add subtask
        </Button>
      )}
    </section>
  );
}

function CommentThread() {
  return (
    <section className="pb-12">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Comments</h2>
          <StatusBadge>3</StatusBadge>
        </div>
        <Button variant="ghost" size="sm" className="rounded-md">
          Oldest
          <ChevronDown className="size-4" />
        </Button>
      </div>

      <ol className="space-y-6">
        {commentFeed.map((activityItem, activityItemIndex) => (
          <li key={activityItem.id} className="relative flex gap-x-4">
            <div
              className={cn(
                "absolute top-0 left-0 flex w-6 justify-center",
                activityItemIndex === commentFeed.length - 1
                  ? "h-10"
                  : "-bottom-6",
              )}
            >
              <div className="bg-border w-px" />
            </div>

            {activityItem.type === "commented" ? (
              <>
                <div className="bg-background relative mt-3 flex size-6 flex-none items-center justify-center">
                  <PersonAvatar person={activityItem.person} size="sm" />
                </div>
                <div className="flex-auto rounded-md border p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-x-4">
                    <div className="text-muted-foreground text-sm">
                      <span className="text-foreground font-medium">
                        {activityItem.person.name}
                      </span>{" "}
                      commented
                    </div>
                    <time className="text-muted-foreground shrink-0 text-sm">
                      {activityItem.date}
                    </time>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    {activityItem.comment}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-background relative flex size-6 flex-none items-center justify-center">
                  {activityItem.type === "completed" ? (
                    <Check className="bg-primary text-primary-foreground size-6 rounded-full p-1" />
                  ) : (
                    <div className="bg-background ring-border size-1.5 rounded-full ring-1" />
                  )}
                </div>
                <p className="text-muted-foreground min-w-0 flex-auto py-0.5 text-sm leading-5">
                  <span className="text-foreground font-medium">
                    {activityItem.person.name}
                  </span>{" "}
                  {activityItem.type} the issue.
                </p>
                <time className="text-muted-foreground hidden shrink-0 py-0.5 text-sm leading-5 sm:block">
                  {activityItem.date}
                </time>
              </>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex gap-x-3">
        <div className="flex size-6 flex-none items-center justify-center">
          <PersonAvatar person={issue.assignee} size="sm" />
        </div>
        <form className="relative flex-auto">
          <div className="focus-within:ring-ring overflow-hidden rounded-lg border pb-12 focus-within:ring-2">
            <label htmlFor="issue-comment" className="sr-only">
              Add your comment
            </label>
            <textarea
              id="issue-comment"
              name="comment"
              rows={2}
              placeholder="Add your comment..."
              className="placeholder:text-muted-foreground block w-full resize-none bg-transparent px-3 py-1.5 text-sm leading-6 outline-none"
              defaultValue=""
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 flex justify-between py-2 pr-2 pl-3">
            <div className="text-muted-foreground flex items-center gap-5">
              <button
                type="button"
                className="hover:text-foreground -m-2.5 flex size-10 items-center justify-center rounded-full"
              >
                <Paperclip className="size-5" />
                <span className="sr-only">Attach a file</span>
              </button>
              <button
                type="button"
                className="hover:text-foreground -m-2.5 flex size-10 items-center justify-center rounded-full"
              >
                <SmilePlus className="size-5" />
                <span className="sr-only">Add your mood</span>
              </button>
            </div>
            <Button type="submit" variant="outline" size="sm">
              Comment
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function ActivityPanel({ className }: { className?: string }) {
  return (
    <aside className={cn("px-5 xl:border-l xl:px-6", className)}>
      <section className="border-b pb-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Activity</h2>
          <Button variant="link" className="h-auto p-0">
            View full timeline
          </Button>
        </div>

        <ol className="space-y-5">
          {activityGroups.flatMap((group) =>
            [
              {
                type: "date" as const,
                id: group.date,
                date: group.date,
              },
              ...group.items.map((item) => ({
                type: "item" as const,
                id: `${group.date}-${item.actor.name}-${item.time}`,
                item,
              })),
            ].map((entry, entryIndex, entries) => {
              const isLastGroupEntry = entryIndex === entries.length - 1;

              return (
                <li key={entry.id} className="relative flex gap-x-4">
                  <div
                    className={cn(
                      "absolute top-0 left-0 flex w-6 justify-center",
                      isLastGroupEntry ? "h-6" : "-bottom-5",
                    )}
                  >
                    <div className="bg-border w-px" />
                  </div>

                  {entry.type === "date" ? (
                    <>
                      <div className="bg-background relative flex size-6 flex-none items-center justify-center">
                        <div className="bg-background ring-border size-2 rounded-full ring-2" />
                      </div>
                      <div className="flex-auto py-0.5 text-sm font-semibold">
                        {entry.date}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-background relative mt-1 flex size-6 flex-none items-center justify-center">
                        <PersonAvatar person={entry.item.actor} size="sm" />
                      </div>
                      <div className="min-w-0 flex-auto">
                        <div className="flex justify-between gap-x-3 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">
                              {entry.item.actor.name}
                            </span>{" "}
                            <span>{entry.item.text}</span>
                            {"detail" in entry.item && entry.item.detail ? (
                              <div className="text-muted-foreground mt-1 leading-5">
                                {entry.item.detail}
                              </div>
                            ) : null}
                          </div>
                          <time className="text-muted-foreground shrink-0">
                            {entry.item.time}
                          </time>
                        </div>
                        {entry.item.chips.length > 0 ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {entry.item.chips.map((chip, index) => (
                              <SoftBadge key={chip} active={index === 1}>
                                {chip}
                              </SoftBadge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </li>
              );
            }),
          )}
        </ol>
      </section>

      <section className="border-b py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Attachments</h2>
            <StatusBadge>3</StatusBadge>
          </div>
          <Button variant="ghost" size="icon" className="size-8 rounded-md">
            <Plus className="size-5" />
          </Button>
        </div>
        <div className="space-y-3">
          {attachments.map((attachment) => {
            const Icon = attachment.icon;

            return (
              <div
                key={attachment.name}
                className="grid grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-3"
              >
                <div className="bg-secondary flex size-10 items-center justify-center rounded-md border">
                  <Icon className="text-primary size-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {attachment.name}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {attachment.type} <span className="px-1">•</span>{" "}
                    {attachment.size}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="size-8">
                  <Download className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Linked issues</h2>
            <StatusBadge>2</StatusBadge>
          </div>
          <Button variant="outline" size="sm" className="rounded-md">
            <Plus className="size-4" />
            Link issue
          </Button>
        </div>
        <div className="space-y-4">
          {linkedIssues.map((linkedIssue) => (
            <div
              key={linkedIssue.id}
              className="grid grid-cols-[64px_minmax(0,1fr)_92px] items-center gap-3"
            >
              <span className="text-muted-foreground font-mono text-xs font-medium tracking-normal">
                {linkedIssue.id}
              </span>
              <span className="truncate text-sm">{linkedIssue.title}</span>
              <span
                className={cn(
                  "justify-self-end rounded-md px-2 py-1 text-xs font-medium",
                  linkedIssue.status === "Done"
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {linkedIssue.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export function ProjectManagementIssueDetail2() {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="bg-background text-foreground min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-8 px-4 py-5 sm:px-6 sm:py-7 xl:grid-cols-[minmax(0,1fr)_400px]">
        <main className="min-w-0">
          <div className="mx-auto max-w-[920px]">
            <div className="text-muted-foreground mb-4 flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span>Issues</span>
                <span className="text-border">/</span>
                <span className="text-foreground font-medium">{issue.id}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-md xl:hidden"
                aria-label="Open issue activity"
                onClick={() => setDetailsOpen(true)}
              >
                <PanelRight className="size-4" />
              </Button>
            </div>

            <div className="mb-4 flex items-start gap-3 sm:mb-5 sm:gap-4">
              <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md sm:size-9">
                <Check className="size-5" />
              </div>
              <h1 className="min-w-0 text-xl leading-tight font-semibold tracking-normal sm:text-2xl">
                {issue.title}
              </h1>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <Button
                className="justify-between rounded-md sm:justify-center"
                variant="secondary"
              >
                In Progress
                <ChevronDown className="size-4" />
              </Button>
              <Button
                className="justify-between rounded-md sm:justify-center"
                variant="outline"
              >
                <Upload className="size-4" />
                High
                <ChevronDown className="size-4" />
              </Button>
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:contents">
                <IconButton className="size-10">
                  <Link2 className="size-5" />
                </IconButton>
                <IconButton className="size-10">
                  <Bookmark className="size-5" />
                </IconButton>
                <IconButton className="size-10">
                  <MoreHorizontal className="size-5" />
                </IconButton>
              </div>
            </div>

            <PropertyGrid />
            <MetaGrid />

            <div className="text-muted-foreground mt-3 mb-6 flex flex-wrap items-center gap-3 text-sm">
              <span>Created {issue.created}</span>
              <span>•</span>
              <span>Updated {issue.updated}</span>
            </div>

            <section className="mb-6 max-w-[780px]">
              <h2 className="mb-3 text-base font-semibold">Description</h2>
              <div className="space-y-3 text-sm leading-6">
                <p>
                  Currently, assigning tasks across multiple teams in large
                  projects is manual and error-prone. Project managers need
                  better visibility and control when distributing work across
                  teams.
                </p>
                <p>
                  This improvement will streamline the assignment flow, reduce
                  context switching, and ensure the right people are working on
                  the right tasks.
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li>Add team-based assignee suggestions</li>
                  <li>Allow bulk assignment with workload awareness</li>
                  <li>Show assignment rules and conflicts in real time</li>
                  <li>Improve permissions and assignment validation</li>
                </ul>
                <p>
                  This will directly impact planning accuracy and delivery
                  velocity in multi-team environments.
                </p>
              </div>
            </section>

            <Subtasks />
            <CommentThread />
          </div>
        </main>

        <ActivityPanel className="hidden xl:block" />
      </div>

      <div className="fixed right-4 bottom-5 z-30 flex items-center gap-2 sm:right-7 sm:bottom-6 sm:gap-3">
        <Button className="h-10 rounded-md px-4 shadow-lg sm:h-11 sm:px-5">
          <Pencil className="size-5" />
          Edit issue
        </Button>
        <IconButton className="bg-background size-10 shadow-lg">
          <MoreHorizontal className="size-5" />
        </IconButton>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[360px] max-w-[90vw] p-0">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle>Issue activity</SheetTitle>
            <SheetDescription>{issue.id}</SheetDescription>
          </SheetHeader>
          <div className="h-[calc(100dvh-73px)] overflow-y-auto py-5">
            <ActivityPanel />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

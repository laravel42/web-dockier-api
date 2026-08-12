"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  Edit3,
  FilePlus2,
  Flag,
  MoreHorizontal,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Tag,
  UserRoundCheck,
  Video,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { INITIAL_PROJECT_ISSUES, type IssuePriority } from "./issue-core";
import { projects } from "./project-list-shared";
import { WorkHourAnalysisCard } from "./work-hour-analysis-card";

type DashboardIssue = (typeof INITIAL_PROJECT_ISSUES)[number] & {
  assignee: {
    avatar: string;
    initials: string;
    name: string;
  } | null;
  priority: IssuePriority;
  projectId: string;
  updateLabel: string;
};

const issueMeta: Record<
  string,
  Pick<DashboardIssue, "assignee" | "priority" | "projectId" | "updateLabel">
> = {
  "issue-001": {
    assignee: {
      avatar: "/avatars/avatar-5.png",
      initials: "NO",
      name: "Nina Oliver",
    },
    priority: "high",
    projectId: "proj-001",
    updateLabel: "Updated 2h ago",
  },
  "issue-002": {
    assignee: null,
    priority: "medium",
    projectId: "proj-002",
    updateLabel: "Moved to planned today",
  },
  "issue-003": {
    assignee: {
      avatar: "/avatars/avatar-black-2.png",
      initials: "KY",
      name: "Kai Young",
    },
    priority: "high",
    projectId: "proj-003",
    updateLabel: "Sent to review yesterday",
  },
  "issue-004": {
    assignee: null,
    priority: null,
    projectId: "proj-004",
    updateLabel: "Marked blocked",
  },
  "issue-005": {
    assignee: null,
    priority: "medium",
    projectId: "proj-005",
    updateLabel: "Updated today",
  },
  "issue-006": {
    assignee: {
      avatar: "/avatars/avatar-3.png",
      initials: "LM",
      name: "Lena Moss",
    },
    priority: "low",
    projectId: "proj-001",
    updateLabel: "Closed today",
  },
  "issue-007": {
    assignee: {
      avatar: "/avatars/avatar-1.png",
      initials: "AR",
      name: "Ava Reed",
    },
    priority: "medium",
    projectId: "proj-003",
    updateLabel: "Updated today",
  },
  "issue-008": {
    assignee: null,
    priority: null,
    projectId: "proj-002",
    updateLabel: "No owner yet",
  },
};

const dashboardIssues: DashboardIssue[] = INITIAL_PROJECT_ISSUES.map(
  (issue) => {
    const meta = issueMeta[issue.id];

    return {
      ...issue,
      assignee: meta?.assignee ?? null,
      priority: meta?.priority ?? null,
      projectId: meta?.projectId ?? projects[0].id,
      updateLabel: meta?.updateLabel ?? "Updated today",
    };
  },
);

const assignedIssues = dashboardIssues.filter((issue) => issue.assignee).length;
const completedIssues = dashboardIssues.filter(
  (issue) => issue.status === "Done",
).length;
const subscribedIssues = dashboardIssues.filter(
  (issue) => issue.status !== "Backlog",
).length;
const overviewCards = [
  {
    label: "Issues created",
    value: dashboardIssues.length,
    icon: FilePlus2,
  },
  {
    label: "Issues assigned",
    value: assignedIssues,
    icon: UserRoundCheck,
  },
  {
    label: "Issues subscribed",
    value: subscribedIssues,
    icon: Bell,
  },
] as const;

const workload = [
  {
    label: "Backlog",
    value: dashboardIssues.filter((issue) => issue.status === "Backlog").length,
    color: "#a1a1aa",
  },
  {
    label: "Todo",
    value: dashboardIssues.filter((issue) => issue.status === "Planned").length,
    color: "#22d3ee",
  },
  {
    label: "In Progress",
    value: dashboardIssues.filter((issue) => issue.status === "In Progress")
      .length,
    color: "#f59e0b",
  },
  {
    label: "Review",
    value: dashboardIssues.filter((issue) => issue.status === "Review").length,
    color: "#d946ef",
  },
  { label: "Done", value: completedIssues, color: "#10b981" },
];

const issueStatusStyles: Record<DashboardIssue["status"], string> = {
  Backlog:
    "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
  Planned:
    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300",
  "In Progress":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  Review:
    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  Done: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const priorityStyles: Record<NonNullable<IssuePriority>, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-emerald-500",
};

const issueLabels: Record<string, string[]> = {
  "issue-001": ["timeline", "frontend"],
  "issue-002": ["review"],
  "issue-003": ["views", "filters"],
  "issue-004": ["guidelines"],
  "issue-005": ["states"],
  "issue-006": ["handoff"],
  "issue-007": ["density"],
  "issue-008": ["calendar"],
};

const myIssueRows = dashboardIssues
  .filter((issue) => issue.status !== "Backlog" || issue.assignee)
  .slice(0, 6)
  .map((issue) => ({
    issue,
    labels: issueLabels[issue.id] ?? [],
  }));

const meetingParticipants = {
  product: [
    { name: "Nina Oliver", avatar: "/avatars/avatar-5.png", initials: "NO" },
    {
      name: "Kai Young",
      avatar: "/avatars/avatar-black-2.png",
      initials: "KY",
    },
    { name: "Ava Reed", avatar: "/avatars/avatar-1.png", initials: "AR" },
  ],
  design: [
    { name: "Lena Moss", avatar: "/avatars/avatar-3.png", initials: "LM" },
    { name: "Nina Oliver", avatar: "/avatars/avatar-5.png", initials: "NO" },
    { name: "Ava Reed", avatar: "/avatars/avatar-1.png", initials: "AR" },
  ],
} as const;

const meetings = [
  {
    id: "meeting-1",
    title: "Timeline planning review",
    time: "09:00 - 09:45 AM",
    platform: "Google Meet",
    label: "Roadmap",
    labelClassName:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    participants: meetingParticipants.product,
    overflow: 2,
  },
  {
    id: "meeting-2",
    title: "Design handoff sync",
    time: "11:30 - 12:00 PM",
    platform: "Zoom",
    label: "Design",
    labelClassName:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    participants: meetingParticipants.design,
    overflow: 1,
  },
  {
    id: "meeting-3",
    title: "Release readiness check",
    time: "03:00 - 03:30 PM",
    platform: "Slack",
    label: "Launch",
    labelClassName:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    participants: meetingParticipants.product,
    overflow: 3,
  },
] as const;

const projectEvents = [
  {
    id: "event-1",
    title: "Sprint demo window",
    time: "02:00 - 02:30 PM",
    detail: "Share timeline and interaction updates",
    label: "Demo",
    labelClassName:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    id: "event-2",
    title: "Release notes freeze",
    time: "04:00 PM",
    detail: "Lock copy for Revenue Insights Revamp",
    label: "Release",
    labelClassName:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  {
    id: "event-3",
    title: "QA sign-off",
    time: "Tomorrow",
    detail: "Claims workspace regression pass",
    label: "QA",
    labelClassName:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
] as const;

const focusItems = [
  {
    id: "focus-1",
    title: "Review timeline architecture",
    issue: "RFC-101",
    meta: "High priority",
    labelClassName:
      "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  },
  {
    id: "focus-2",
    title: "Clear unassigned todo work",
    issue: "RFC-102",
    meta: "Needs owner",
    labelClassName:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    id: "focus-3",
    title: "Prepare release handoff",
    issue: "RFC-106",
    meta: "Due today",
    labelClassName:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
] as const;

const profileCoverStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(135deg, rgb(15 23 42 / 72%), rgb(19 78 74 / 42%)), url('/images/block/photos/pawel-czerwinski-O4fAgtXLRwI-unsplash.jpg')",
  backgroundPosition: "center",
  backgroundSize: "cover",
};

function DashboardCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-[6px] shadow-none", className)}>
      <CardContent className="p-3 sm:p-4">{children}</CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-foreground text-[16px] leading-6 font-medium">
      {children}
    </h2>
  );
}

function WorkAvatar({
  alt,
  src,
  className,
  fallbackClassName,
  label = "N",
}: {
  alt?: string;
  src?: string;
  className?: string;
  fallbackClassName?: string;
  label?: string;
}) {
  return (
    <Avatar className={cn("size-6 rounded-[3px]", className)}>
      {src ? <AvatarImage src={src} alt={alt ?? label} /> : null}
      <AvatarFallback
        className={cn(
          "rounded-[3px] bg-slate-500 text-[11px] font-medium text-white",
          fallbackClassName,
        )}
      >
        {label}
      </AvatarFallback>
    </Avatar>
  );
}

function OverviewStats() {
  return (
    <section className="min-w-0 space-y-2">
      <SectionTitle>Overview</SectionTitle>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {overviewCards.map((card) => {
          const Icon = card.icon;

          return (
            <DashboardCard
              key={card.label}
              className="border-border bg-card text-card-foreground h-[84px]"
            >
              <div className="flex h-full items-center gap-3">
                <div className="bg-muted grid size-11 shrink-0 place-items-center rounded-[3px]">
                  <Icon className="text-foreground size-5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-muted-foreground truncate text-[13px] leading-5">
                    {card.label}
                  </p>
                  <p className="text-[18px] leading-6 font-semibold">
                    {card.value}
                  </p>
                </div>
              </div>
            </DashboardCard>
          );
        })}
      </div>
    </section>
  );
}

function WorkloadCards() {
  return (
    <section className="min-w-0 space-y-2">
      <SectionTitle>Issue status</SectionTitle>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {workload.map((item) => (
          <DashboardCard
            key={item.label}
            className="border-border bg-card text-card-foreground h-[84px]"
          >
            <div className="flex h-full items-start gap-3">
              <span
                className="mt-1 size-3 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              <div className="min-w-0 space-y-1">
                <p className="text-muted-foreground truncate text-[13px] leading-5">
                  {item.label}
                </p>
                <p className="text-[18px] leading-6 font-semibold">
                  {item.value}
                </p>
              </div>
            </div>
          </DashboardCard>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: DashboardIssue["status"] }) {
  const colorClassName = {
    Backlog: "bg-zinc-400",
    Planned: "bg-cyan-400",
    "In Progress": "bg-amber-400",
    Review: "bg-fuchsia-400",
    Done: "bg-emerald-400",
  }[status];

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
        issueStatusStyles[status],
      )}
    >
      <span className={cn("size-1.5 rounded-full", colorClassName)} />
      {status === "Planned" ? "Todo" : status}
    </span>
  );
}

function SpreadsheetCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "text-foreground/80 group-hover:bg-muted/60 h-11 border-r border-b px-4 align-middle text-[13px] whitespace-nowrap transition-colors",
        className,
      )}
    >
      {children}
    </td>
  );
}

function MyIssuesTable() {
  return (
    <section className="min-w-0 space-y-2">
      <SectionTitle>My issues</SectionTitle>
      <div className="grid gap-2.5 md:hidden">
        {myIssueRows.map(({ issue, labels }) => (
          <DashboardCard
            key={issue.id}
            className="border-border bg-card text-card-foreground"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-muted-foreground shrink-0 text-[11px] font-medium tracking-[0.12em] uppercase">
                    {issue.code}
                  </span>
                  <span className="text-foreground truncate text-[13px] font-medium">
                    {issue.title}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={issue.status} />
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium text-zinc-600 capitalize">
                    <Flag className="size-3" />
                    {issue.priority ?? "None"}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Open actions for ${issue.code}`}
                className="text-muted-foreground hover:bg-muted size-7 shrink-0 rounded-md"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </div>

            <div className="text-muted-foreground mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 text-[12px]">
              <div className="min-w-0">
                {issue.assignee ? (
                  <div className="inline-flex min-w-0 items-center gap-2">
                    <WorkAvatar
                      className="size-6 rounded-full"
                      fallbackClassName="rounded-full text-[10px]"
                      src={issue.assignee.avatar}
                      alt={issue.assignee.name}
                      label={issue.assignee.initials}
                    />
                    <span className="truncate">{issue.assignee.name}</span>
                  </div>
                ) : (
                  <span>No owner</span>
                )}
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
                <CalendarDays className="size-3.5" />
                {issue.targetDate ?? "-"}
              </div>
            </div>

            {labels.length ? (
              <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
                {labels.slice(0, 2).map((label) => (
                  <span
                    key={label}
                    className="text-muted-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                  >
                    <Tag className="size-3" />
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </DashboardCard>
        ))}
      </div>
      <DashboardCard className="border-border bg-card text-card-foreground hidden md:block">
        <div className="-m-4 overflow-hidden rounded-[6px]">
          <div className="horizontal-scrollbar overflow-x-auto">
            <table className="bg-background w-full min-w-[1120px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="bg-muted text-foreground sticky left-0 z-10 h-11 min-w-[360px] border-r border-b px-4 text-left text-[13px] font-medium">
                    Issues
                  </th>
                  <th className="bg-muted text-foreground h-11 min-w-36 border-r border-b px-4 text-left text-[13px] font-medium">
                    Status
                  </th>
                  <th className="bg-muted text-foreground h-11 min-w-32 border-r border-b px-4 text-left text-[13px] font-medium">
                    Priority
                  </th>
                  <th className="bg-muted text-foreground h-11 min-w-44 border-r border-b px-4 text-left text-[13px] font-medium">
                    Assignee
                  </th>
                  <th className="bg-muted text-foreground h-11 min-w-56 border-r border-b px-4 text-left text-[13px] font-medium">
                    Labels
                  </th>
                  <th className="bg-muted text-foreground h-11 min-w-40 border-b px-4 text-left text-[13px] font-medium">
                    Due date
                  </th>
                </tr>
              </thead>
              <tbody>
                {myIssueRows.map(({ issue, labels }) => (
                  <tr key={issue.id} className="group">
                    <td className="bg-background group-hover:bg-muted sticky left-0 z-10 h-11 min-w-[360px] border-r border-b px-4 align-middle transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="text-muted-foreground shrink-0 text-[11px] font-medium tracking-[0.12em] uppercase">
                              {issue.code}
                            </span>
                            <span className="text-foreground truncate text-[13px] font-medium">
                              {issue.title}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Open actions for ${issue.code}`}
                          className="text-muted-foreground hover:bg-muted size-7 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </div>
                    </td>

                    <SpreadsheetCell>
                      <StatusBadge status={issue.status} />
                    </SpreadsheetCell>

                    <SpreadsheetCell>
                      <div className="inline-flex items-center gap-2">
                        <Flag className="text-muted-foreground size-3.5" />
                        <span
                          className={cn(
                            "capitalize",
                            issue.priority
                              ? priorityStyles[issue.priority]
                              : "text-muted-foreground",
                          )}
                        >
                          {issue.priority ?? "None"}
                        </span>
                      </div>
                    </SpreadsheetCell>

                    <SpreadsheetCell>
                      {issue.assignee ? (
                        <div className="inline-flex items-center gap-2">
                          <WorkAvatar
                            className="size-6 rounded-full"
                            fallbackClassName="rounded-full text-[10px]"
                            src={issue.assignee.avatar}
                            alt={issue.assignee.name}
                            label={issue.assignee.initials}
                          />
                          <span className="truncate text-[13px]">
                            {issue.assignee.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No owner</span>
                      )}
                    </SpreadsheetCell>

                    <SpreadsheetCell>
                      {labels.length ? (
                        <div className="flex flex-nowrap gap-1.5">
                          {labels.slice(0, 2).map((label) => (
                            <span
                              key={label}
                              className="text-muted-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                            >
                              <Tag className="size-3" />
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </SpreadsheetCell>

                    <SpreadsheetCell className="border-r-0">
                      <div className="inline-flex items-center gap-2">
                        <CalendarDays className="text-muted-foreground size-3.5" />
                        <span className="font-normal tabular-nums">
                          {issue.targetDate ?? "-"}
                        </span>
                      </div>
                    </SpreadsheetCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DashboardCard>
    </section>
  );
}

function formatTimerSeconds(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function TimeTrackerCard() {
  const [selectedIssueId, setSelectedIssueId] = useState(
    myIssueRows[0]?.issue.id ?? "",
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const selectedIssue =
    myIssueRows.find(({ issue }) => issue.id === selectedIssueId)?.issue ??
    myIssueRows[0]?.issue;

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRunning]);

  const handleIssueSelect = (issueId: string) => {
    setSelectedIssueId(issueId);
    setElapsedSeconds(0);
    setIsRunning(false);
  };

  return (
    <section className="flex h-full min-w-0 flex-col gap-2">
      <SectionTitle>Time Tracker</SectionTitle>

      <Card
        data-time-tracker-card
        className="border-border bg-card text-card-foreground flex min-w-0 flex-1 overflow-hidden rounded-[6px] shadow-none"
      >
        <CardContent className="flex min-h-[268px] min-w-0 flex-1 flex-col overflow-hidden p-3 py-5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="border-input bg-background hover:bg-muted focus-visible:ring-ring flex h-9 w-full max-w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[6px] border px-3 text-left text-sm shadow-none outline-none focus-visible:ring-2"
              >
                <span className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 overflow-hidden">
                  <span className="text-muted-foreground shrink-0 text-[11px] font-medium tracking-[0.12em] uppercase">
                    {selectedIssue?.code ?? "Issue"}
                  </span>
                  <span className="text-foreground min-w-0 truncate text-[13px] leading-5 font-normal">
                    {selectedIssue?.title ?? "Select issue"}
                  </span>
                </span>
                <ChevronDown className="text-muted-foreground size-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]"
            >
              {myIssueRows.map(({ issue }) => (
                <DropdownMenuItem
                  key={issue.id}
                  onSelect={() => {
                    handleIssueSelect(issue.id);
                  }}
                >
                  <span className="text-muted-foreground min-w-14 text-[11px] font-medium tracking-[0.12em] uppercase">
                    {issue.code}
                  </span>
                  <span className="min-w-0 truncate">{issue.title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div
            data-time-tracker-panel
            className="bg-muted mt-4 flex flex-1 flex-col items-center justify-center rounded-[6px] px-3 py-4 text-center"
          >
            <p className="text-muted-foreground text-[10px] leading-3 font-semibold tracking-[0.14em] uppercase">
              {isRunning ? "Tracking" : "Awaiting"}
            </p>
            <p className="text-foreground mt-2 text-[34px] leading-none font-medium tracking-[-0.02em] whitespace-nowrap tabular-nums">
              {formatTimerSeconds(elapsedSeconds)}
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <Button
                variant="ghost"
                className="text-primary hover:text-primary hover:bg-background h-7 rounded-[6px] px-2 text-[13px] font-medium"
                onClick={() => {
                  setIsRunning((current) => !current);
                }}
              >
                {isRunning ? (
                  <Pause className="size-3.5 fill-current" />
                ) : (
                  <Play className="size-3.5 fill-current" />
                )}
                {isRunning ? "Pause" : "Start"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reset time tracker"
                className="text-muted-foreground hover:bg-background hover:text-foreground size-7 rounded-[6px]"
                onClick={() => {
                  setElapsedSeconds(0);
                  setIsRunning(false);
                }}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SidebarAvatarGroup({
  participants,
  overflow,
}: {
  participants: readonly {
    avatar: string;
    initials: string;
    name: string;
  }[];
  overflow: number;
}) {
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {participants.map((participant) => (
          <Avatar
            key={participant.name}
            className="border-background size-7 border-2"
          >
            <AvatarImage src={participant.avatar} alt={participant.name} />
            <AvatarFallback className="text-[10px] font-medium">
              {participant.initials}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      {overflow > 0 ? (
        <span className="text-muted-foreground ml-2 text-xs font-medium">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function ProfileSummarySection({
  showEditAction = true,
}: {
  showEditAction?: boolean;
}) {
  return (
    <section className="min-w-0">
      <div
        className="relative h-[110px] sm:h-[132px] xl:h-[110px]"
        style={profileCoverStyle}
      >
        {showEditAction ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit profile"
            className="absolute top-3.5 right-3.5 size-5 rounded-[3px] bg-white text-black hover:bg-white/90"
          >
            <Edit3 className="size-3" />
          </Button>
        ) : null}
        <WorkAvatar
          src="/avatars/ausrobdev-avatar.png"
          alt="ausrobdev"
          label="A"
          className="ring-background absolute -bottom-[26px] left-5 size-[52px] rounded-[3px] ring-2"
          fallbackClassName="rounded-[3px] text-[24px]"
        />
      </div>

      <div className="px-4 sm:px-5">
        <div className="mt-[38px]">
          <h3 className="text-[16px] leading-6 font-semibold">ausrobdev</h3>
          <p className="text-muted-foreground text-[13px] leading-5">
            rob@shadcnblocks.com
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-5 text-[13px] leading-5">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4">
            <div className="text-muted-foreground min-w-0">Joined on</div>
            <div className="min-w-0 font-medium">Jan 10, 2026</div>
          </div>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4">
            <div className="text-muted-foreground min-w-0">Timezone</div>
            <div className="min-w-0 font-medium">20:16 UTC</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MeetingsSection() {
  return (
    <section className="border-border mt-9 flex min-h-0 flex-1 flex-col border-t pb-5">
      <Tabs defaultValue="meetings" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="grid h-10 w-full min-w-0 shrink-0 grid-cols-3 rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="meetings"
            className="data-[state=active]:border-primary h-10 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Meetings
          </TabsTrigger>
          <TabsTrigger
            value="events"
            className="data-[state=active]:border-primary h-10 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Events
          </TabsTrigger>
          <TabsTrigger
            value="blocked"
            className="data-[state=active]:border-primary h-10 min-w-0 rounded-none border-b-2 border-transparent px-1 text-[12px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Focus
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="meetings"
          className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 sm:px-5"
        >
          <div className="flex flex-col gap-2.5">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="bg-muted rounded-[8px] p-3 text-[12px] leading-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13px] font-medium">
                      {meeting.title}
                    </p>
                    <p className="text-muted-foreground mt-1">{meeting.time}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Open ${meeting.title}`}
                    className="bg-background text-muted-foreground hover:bg-background size-6 shrink-0 rounded-full"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <SidebarAvatarGroup
                    participants={meeting.participants}
                    overflow={meeting.overflow}
                  />
                  <Badge
                    className={cn(
                      "border-transparent px-2 py-0 text-[11px] font-medium hover:bg-current/0",
                      meeting.labelClassName,
                    )}
                  >
                    {meeting.label}
                  </Badge>
                </div>

                <div className="text-muted-foreground mt-3 flex items-center gap-1.5">
                  <Video className="size-3.5" />
                  <span>On {meeting.platform}</span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent
          value="events"
          className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 sm:px-5"
        >
          <div className="flex flex-col gap-2.5">
            {projectEvents.map((event) => (
              <div
                key={event.id}
                className="bg-muted rounded-[8px] p-3 text-[12px] leading-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13px] font-medium">
                      {event.title}
                    </p>
                    <p className="text-muted-foreground mt-1">{event.time}</p>
                  </div>
                  <Badge
                    className={cn(
                      "border-transparent px-2 py-0 text-[11px] font-medium hover:bg-current/0",
                      event.labelClassName,
                    )}
                  >
                    {event.label}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-3 line-clamp-2">
                  {event.detail}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent
          value="blocked"
          className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 sm:px-5"
        >
          <div className="flex flex-col gap-2.5">
            {focusItems.map((item) => (
              <div
                key={item.id}
                className="bg-muted rounded-[8px] p-3 text-[12px] leading-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13px] font-medium">
                      {item.title}
                    </p>
                    <p className="text-muted-foreground mt-1">{item.meta}</p>
                  </div>
                  <Badge
                    className={cn(
                      "border-transparent px-2 py-0 text-[11px] font-medium hover:bg-current/0",
                      item.labelClassName,
                    )}
                  >
                    {item.issue}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function ProfilePanel({ showEditAction = true }: { showEditAction?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProfileSummarySection showEditAction={showEditAction} />
      <MeetingsSection />
    </div>
  );
}

function ProfileSidebar() {
  return (
    <aside className="border-border bg-card text-card-foreground hidden w-full min-w-0 shrink-0 flex-col overflow-hidden border-t xl:flex xl:w-[300px] xl:border-t-0 xl:border-l">
      <ProfilePanel />
    </aside>
  );
}

function ProfilePanelSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Open workspace panel"
          className="size-8 shrink-0 rounded-[6px] xl:hidden"
        >
          <PanelRightOpen className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="[&>button]:bg-background/90 [&>button]:text-foreground [&>button]:hover:bg-background flex h-dvh w-[min(100vw-1.5rem,360px)] max-w-none flex-col overflow-hidden p-0 xl:hidden [&>button]:rounded-[6px] [&>button]:opacity-100"
      >
        <SheetTitle className="sr-only">Workspace panel</SheetTitle>
        <ProfilePanel showEditAction={false} />
      </SheetContent>
    </Sheet>
  );
}

export function ProjectManagementDashboard1() {
  return (
    <main
      id="main-content"
      className="bg-background text-foreground flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto xl:flex-row xl:overflow-hidden">
        <div className="flex max-w-full min-w-0 flex-1 flex-col xl:overflow-hidden">
          <header className="border-border flex min-h-14 items-center justify-between border-b px-4 sm:px-6">
            <div className="flex items-center gap-2.5 text-sm font-medium">
              <UserRoundCheck className="text-muted-foreground size-4" />
              <span>My workspace</span>
            </div>
            <ProfilePanelSheet />
          </header>

          <nav className="border-border border-b">
            <div className="horizontal-scrollbar flex w-full min-w-0 items-center overflow-x-auto overscroll-x-contain px-2 sm:px-6">
              {[
                "Overview",
                "Assigned to me",
                "Reported by me",
                "Watching",
                "Updates",
              ].map((tab) => (
                <button
                  key={tab}
                  className={cn(
                    "focus-visible:ring-muted-foreground text-muted-foreground hover:text-foreground h-12 shrink-0 border-b-2 px-3 text-[13px] font-medium outline-none focus-visible:ring-2 sm:px-4",
                    tab === "Overview"
                      ? "border-primary text-primary"
                      : "border-transparent",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </nav>

          <div className="min-h-0 flex-1 xl:overflow-y-auto">
            <div className="flex min-w-0 flex-col gap-6 px-3 py-5 sm:gap-7 sm:px-6 sm:py-6">
              <OverviewStats />
              <WorkloadCards />
              <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                <WorkHourAnalysisCard />
                <TimeTrackerCard />
              </div>
              <MyIssuesTable />
            </div>
          </div>
        </div>

        <ProfileSidebar />
      </div>
    </main>
  );
}

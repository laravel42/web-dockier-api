"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { CreateIssueSheet } from "./create-issue-sheet";
import {
  type CreateIssueDefaults,
  createProjectIssue,
  getDisplayStatusLabel,
  INITIAL_PROJECT_ISSUES,
  ISSUE_STATUS_OPTIONS,
  type IssuePriority,
  PROJECT_ICON,
  PROJECT_TABS,
} from "./issue-core";
import type { GanttIssue, IssueStatus } from "./issue-gantt-1/types";

type IssueCollaborator = {
  initials: string;
  name: string;
  avatar: string;
};

type IssueBoardItem = GanttIssue & {
  assignee: IssueCollaborator | null;
  blocked: boolean;
  priority: IssuePriority;
  lane?: string;
  updateLabel: string;
  subIssueCount: number;
};

type DropPosition = "before" | "after";

type IssueKanbanStats = {
  total: number;
  active: number;
  blocked: number;
  assigned: number;
  completed: number;
};

const STATUS_STYLES: Record<
  IssueStatus,
  {
    accentClassName: string;
    dotClassName: string;
    headerClassName: string;
    countClassName: string;
  }
> = {
  Backlog: {
    accentClassName:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300",
    dotClassName: "bg-zinc-400 dark:bg-zinc-500",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
    countClassName:
      "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
  },
  Planned: {
    accentClassName:
      "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/35 dark:text-cyan-200",
    dotClassName: "bg-cyan-400 dark:bg-cyan-500",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
    countClassName:
      "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
  },
  "In Progress": {
    accentClassName:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-200",
    dotClassName: "bg-amber-400 dark:bg-amber-500",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
    countClassName:
      "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
  },
  Review: {
    accentClassName:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/35 dark:text-fuchsia-200",
    dotClassName: "bg-fuchsia-400 dark:bg-fuchsia-500",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
    countClassName:
      "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
  },
  Done: {
    accentClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-200",
    dotClassName: "bg-emerald-400 dark:bg-emerald-500",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
    countClassName:
      "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300",
  },
};

const ISSUE_META: Record<
  string,
  Pick<
    IssueBoardItem,
    | "assignee"
    | "blocked"
    | "priority"
    | "lane"
    | "updateLabel"
    | "subIssueCount"
  >
> = {
  "issue-001": {
    assignee: {
      initials: "NO",
      name: "Nina Oliver",
      avatar: "/avatars/avatar-5.png",
    },
    blocked: false,
    priority: "high",
    lane: "Platform",
    updateLabel: "Updated 2h ago",
    subIssueCount: 3,
  },
  "issue-002": {
    assignee: null,
    blocked: false,
    priority: "medium",
    lane: "Planning",
    updateLabel: "Updated today",
    subIssueCount: 1,
  },
  "issue-003": {
    assignee: {
      initials: "KY",
      name: "Kai Young",
      avatar: "/avatars/avatar-black-2.png",
    },
    blocked: false,
    priority: "high",
    lane: "Views",
    updateLabel: "Updated yesterday",
    subIssueCount: 4,
  },
  "issue-004": {
    assignee: null,
    blocked: true,
    priority: null,
    lane: "Guidelines",
    updateLabel: "Blocked",
    subIssueCount: 0,
  },
  "issue-005": {
    assignee: null,
    blocked: false,
    priority: "medium",
    lane: "States",
    updateLabel: "Updated today",
    subIssueCount: 2,
  },
  "issue-006": {
    assignee: {
      initials: "LM",
      name: "Lena Moss",
      avatar: "/avatars/avatar-3.png",
    },
    blocked: false,
    priority: "low",
    lane: "Handoffs",
    updateLabel: "Closed today",
    subIssueCount: 1,
  },
  "issue-007": {
    assignee: {
      initials: "AR",
      name: "Ava Reed",
      avatar: "/avatars/avatar-1.png",
    },
    blocked: false,
    priority: "medium",
    lane: "Density",
    updateLabel: "Updated today",
    subIssueCount: 2,
  },
  "issue-008": {
    assignee: null,
    blocked: false,
    priority: null,
    lane: "Calendar",
    updateLabel: "No owner yet",
    subIssueCount: 0,
  },
};

const EXTRA_BOARD_ISSUES: IssueBoardItem[] = [
  {
    id: "board-issue-009",
    code: "RFC-109",
    title: "Map unresolved import states",
    description: "Cover empty, delayed, and failed dependency states.",
    status: "Backlog",
    assignee: null,
    blocked: false,
    priority: "medium",
    lane: "Platform",
    updateLabel: "Queued yesterday",
    subIssueCount: 2,
  },
  {
    id: "board-issue-010",
    code: "RFC-110",
    title: "Draft permissions matrix",
    description: "List role behavior before access work starts.",
    status: "Backlog",
    assignee: {
      initials: "KY",
      name: "Kai Young",
      avatar: "/avatars/avatar-black-2.png",
    },
    blocked: false,
    priority: "low",
    lane: "Access",
    updateLabel: "Added to backlog",
    subIssueCount: 0,
  },
  {
    id: "board-issue-011",
    code: "RFC-111",
    title: "Define compact issue row actions",
    description: "Confirm the small-screen action set for issue cards.",
    status: "Planned",
    assignee: {
      initials: "AR",
      name: "Ava Reed",
      avatar: "/avatars/avatar-1.png",
    },
    blocked: false,
    priority: "high",
    lane: "Mobile",
    updateLabel: "Planned today",
    subIssueCount: 3,
  },
  {
    id: "board-issue-012",
    code: "RFC-112",
    title: "Validate bulk selection copy",
    description: "Review toolbar labels for multi-select workflows.",
    status: "Planned",
    assignee: null,
    blocked: false,
    priority: "medium",
    lane: "Copy",
    updateLabel: "Moved to todo",
    subIssueCount: 1,
  },
  {
    id: "board-issue-013",
    code: "RFC-113",
    title: "Wire activity stream pagination",
    description: "Keep the activity panel responsive with larger histories.",
    status: "In Progress",
    assignee: {
      initials: "LM",
      name: "Lena Moss",
      avatar: "/avatars/avatar-3.png",
    },
    blocked: false,
    priority: "high",
    lane: "Activity",
    updateLabel: "Updated 30m ago",
    subIssueCount: 4,
  },
  {
    id: "board-issue-014",
    code: "RFC-114",
    title: "Tune drag preview affordances",
    description: "Make drag feedback clearer across dense boards.",
    status: "In Progress",
    assignee: null,
    blocked: false,
    priority: "medium",
    lane: "Interactions",
    updateLabel: "In progress",
    subIssueCount: 2,
  },
  {
    id: "board-issue-015",
    code: "RFC-115",
    title: "Review dependency warning variants",
    description: "Check blocked, stale, and missing dependency treatments.",
    status: "Review",
    assignee: {
      initials: "NO",
      name: "Nina Oliver",
      avatar: "/avatars/avatar-5.png",
    },
    blocked: false,
    priority: "medium",
    lane: "Dependencies",
    updateLabel: "Ready for review",
    subIssueCount: 2,
  },
  {
    id: "board-issue-016",
    code: "RFC-116",
    title: "QA keyboard reorder flow",
    description: "Verify keyboard parity for board movement patterns.",
    status: "Review",
    assignee: null,
    blocked: true,
    priority: "high",
    lane: "Accessibility",
    updateLabel: "Blocked on QA notes",
    subIssueCount: 1,
  },
  {
    id: "board-issue-017",
    code: "RFC-117",
    title: "Ship saved filter presets",
    description: "Persist personal filters for repeated triage sessions.",
    status: "Done",
    assignee: {
      initials: "AR",
      name: "Ava Reed",
      avatar: "/avatars/avatar-1.png",
    },
    blocked: false,
    priority: "low",
    lane: "Filters",
    updateLabel: "Closed yesterday",
    subIssueCount: 1,
  },
  {
    id: "board-issue-018",
    code: "RFC-118",
    title: "Archive legacy issue badges",
    description: "Remove stale badge variants from issue surfaces.",
    status: "Done",
    assignee: null,
    blocked: false,
    priority: "medium",
    lane: "Cleanup",
    updateLabel: "Closed today",
    subIssueCount: 0,
  },
];

const INITIAL_BOARD_ISSUES: IssueBoardItem[] = [
  ...INITIAL_PROJECT_ISSUES.map((issue) => ({
    ...issue,
    assignee: ISSUE_META[issue.id]?.assignee ?? null,
    blocked: ISSUE_META[issue.id]?.blocked ?? false,
    priority: ISSUE_META[issue.id]?.priority ?? null,
    lane: ISSUE_META[issue.id]?.lane,
    updateLabel: ISSUE_META[issue.id]?.updateLabel ?? "Updated today",
    subIssueCount: ISSUE_META[issue.id]?.subIssueCount ?? 0,
  })),
  ...EXTRA_BOARD_ISSUES,
];

function IssueKanbanHeader(props: {
  issueCount: number;
  statusFilter: IssueStatus[];
  onToggleStatus: (status: IssueStatus) => void;
  onAddIssue: () => void;
}) {
  const { issueCount, statusFilter, onToggleStatus, onAddIssue } = props;
  const ProjectIcon = PROJECT_ICON;

  return (
    <>
      <div className="border-b">
        <div className="flex min-h-14 items-center gap-4 px-4 sm:px-6">
          <div className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
            <div className="flex shrink-0 items-center gap-2 pr-1">
              <div className="bg-muted text-foreground flex size-7 items-center justify-center rounded-md">
                <ProjectIcon className="size-4" />
              </div>
              <span className="text-foreground/85 max-w-48 truncate px-2 text-[14px] font-medium">
                Renewal Forecast Console
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-8 shrink-0 rounded-md"
              aria-label="Project options"
            >
              <MoreHorizontal className="size-4" />
            </Button>

            <div className="mx-4 h-5 w-px shrink-0 border-l" />

            <div className="flex items-center gap-1">
              {PROJECT_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={cn(
                    "relative z-10 flex items-center rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                    tab === "Issues"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {tab}
                  {tab === "Issues" ? (
                    <span className="bg-foreground absolute bottom-[-14px] left-1/2 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label="Filter issues"
                >
                  <SlidersHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Issue filters</DropdownMenuLabel>
                {ISSUE_STATUS_OPTIONS.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter.includes(status)}
                    onCheckedChange={() => onToggleStatus(status)}
                  >
                    {getDisplayStatusLabel(status)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={onAddIssue}
            >
              <Plus className="size-3.5" />
              Add issue
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-11 items-center justify-between border-b px-4 py-1.5 sm:px-6">
        <div className="text-foreground text-[14px] font-semibold">
          {issueCount} Issues
        </div>
        <div className="text-muted-foreground text-[13px] font-medium">
          Grouped by status
        </div>
      </div>
    </>
  );
}

function IssueKanbanStatsCards({ stats }: { stats: IssueKanbanStats }) {
  const completionRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const assignmentRate =
    stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0;
  const statCards = [
    {
      label: "Open issues",
      value: stats.total - stats.completed,
      helper: `${stats.total} total on board`,
      icon: CircleDot,
      className: "text-sky-500",
    },
    {
      label: "Active work",
      value: stats.active,
      helper: "In progress or review",
      icon: TrendingUp,
      className: "text-amber-500",
    },
    {
      label: "Blocked",
      value: stats.blocked,
      helper: "Needs attention",
      icon: AlertCircle,
      className: "text-red-500",
    },
    {
      label: "Completion",
      value: `${completionRate}%`,
      helper: `${assignmentRate}% assigned`,
      icon: CheckCircle2,
      className: "text-emerald-500",
    },
  ];

  return (
    <section className="border-b bg-zinc-50/60 px-4 py-3 sm:px-6 sm:py-4 dark:bg-zinc-950/40">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:rounded-2xl sm:p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="text-muted-foreground text-[12px] font-medium">
                    {card.label}
                  </p>
                  <p className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-950 sm:mt-2 sm:text-2xl dark:text-zinc-50">
                    {card.value}
                  </p>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 sm:size-9 sm:rounded-xl dark:border-zinc-800 dark:bg-zinc-900">
                  <Icon className={cn("size-3.5 sm:size-4", card.className)} />
                </span>
              </div>
              <p className="text-muted-foreground mt-2 line-clamp-2 text-[12px] font-medium sm:mt-3">
                {card.helper}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IssueKanbanStatusBar({
  groupedIssues,
  issueCount,
}: {
  groupedIssues: Array<{ status: IssueStatus; issues: IssueBoardItem[] }>;
  issueCount: number;
}) {
  return (
    <section className="border-b px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase">
            Issue status
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Board health
          </h2>
          <p className="text-muted-foreground mt-1 text-[13px]">
            {issueCount} issues distributed across active statuses
          </p>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="flex h-full">
            {groupedIssues.map((group) => {
              const width =
                issueCount > 0 ? (group.issues.length / issueCount) * 100 : 0;

              return (
                <span
                  key={group.status}
                  className={STATUS_STYLES[group.status].dotClassName}
                  style={{ width: `${width}%` }}
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {groupedIssues.map((group) => {
            const styles = STATUS_STYLES[group.status];

            return (
              <div
                key={group.status}
                className="flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400"
              >
                <span
                  className={cn("size-1.5 rounded-full", styles.dotClassName)}
                />
                <span>{getDisplayStatusLabel(group.status)}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {group.issues.length}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function IssueKanbanCard(props: {
  issue: IssueBoardItem;
  isDragging: boolean;
  dropPosition: DropPosition | null;
  openBoard: boolean;
  embedded: boolean;
  onDragStart: (issueId: string) => void;
  onDragEnd: () => void;
  onDragOverIssue: (issueId: string, position: DropPosition) => void;
  onDropOnIssue: (issueId: string) => void;
}) {
  const {
    issue,
    isDragging,
    dropPosition,
    openBoard,
    embedded,
    onDragStart,
    onDragEnd,
    onDragOverIssue,
    onDropOnIssue,
  } = props;
  const styles = STATUS_STYLES[issue.status];

  return (
    <article
      data-kanban-card="true"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", issue.id);
        onDragStart(issue.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        const rect = event.currentTarget.getBoundingClientRect();
        const position =
          event.clientY < rect.top + rect.height / 2 ? "before" : "after";

        onDragOverIssue(issue.id, position);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropOnIssue(issue.id);
      }}
      className={cn(
        "group relative border bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition dark:bg-zinc-950",
        embedded && "p-2.5 shadow-none",
        openBoard
          ? "rounded-lg border-zinc-200/80 dark:border-zinc-800/80"
          : "rounded-xl border-zinc-200 dark:border-zinc-800",
        openBoard
          ? "hover:border-zinc-300/80 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:hover:border-zinc-700/80"
          : "hover:border-zinc-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:hover:border-zinc-700",
        dropPosition && "border-primary/60",
        isDragging && "scale-[0.98] opacity-55",
      )}
    >
      {dropPosition ? (
        <span
          className={cn(
            "bg-primary absolute right-2 left-2 h-0.5 rounded-full",
            dropPosition === "before" ? "-top-2" : "-bottom-2",
          )}
        />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
            {issue.code}
          </p>
          <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">
            {issue.title}
          </h3>
          {issue.description ? (
            <p
              className={cn(
                "text-muted-foreground mt-2 text-[12px]",
                embedded ? "line-clamp-1" : "line-clamp-2",
              )}
            >
              {issue.description}
            </p>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground -mr-1 size-7 shrink-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={`More actions for ${issue.title}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <span>{issue.updateLabel}</span>
        {issue.priority ? (
          <>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="capitalize">{issue.priority}</span>
          </>
        ) : null}
        {issue.blocked ? (
          <>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span>Blocked</span>
          </>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
            styles.accentClassName,
          )}
        >
          <span className={cn("size-1.5 rounded-full", styles.dotClassName)} />
          {getDisplayStatusLabel(issue.status)}
        </span>

        <div className="flex items-center gap-2">
          {issue.subIssueCount > 0 ? (
            <span className="text-muted-foreground text-[11px] font-medium">
              {issue.subIssueCount} sub
            </span>
          ) : null}

          {issue.assignee ? (
            <Avatar className="size-7 border border-white shadow-sm dark:border-zinc-900">
              <AvatarImage
                src={issue.assignee.avatar}
                alt={issue.assignee.name}
              />
              <AvatarFallback className="bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                {issue.assignee.initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="text-muted-foreground inline-flex size-7 items-center justify-center rounded-full border border-dashed border-zinc-300 dark:border-zinc-700">
              <Users className="size-3.5" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function IssueKanbanColumn(props: {
  status: IssueStatus;
  issues: IssueBoardItem[];
  isDropTarget: boolean;
  onOpenComposer: () => void;
  onDragStart: (issueId: string) => void;
  onDragEnd: () => void;
  draggingIssueId: string | null;
  dropTargetIssueId: string | null;
  dropTargetPosition: DropPosition | null;
  onDragOverColumn: (status: IssueStatus) => void;
  onDragOverColumnSpace: () => void;
  onDragOverIssue: (issueId: string, position: DropPosition) => void;
  onDropOnColumn: (status: IssueStatus, targetIssueId?: string) => void;
  openBoard: boolean;
  embedded: boolean;
}) {
  const {
    status,
    issues,
    isDropTarget,
    onOpenComposer,
    onDragStart,
    onDragEnd,
    draggingIssueId,
    dropTargetIssueId,
    dropTargetPosition,
    onDragOverColumn,
    onDragOverColumnSpace,
    onDragOverIssue,
    onDropOnColumn,
    openBoard,
    embedded,
  } = props;
  const styles = STATUS_STYLES[status];

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOverColumn(status);

        const targetElement = event.target as HTMLElement;

        if (!targetElement.closest("[data-kanban-card='true']")) {
          onDragOverColumnSpace();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropOnColumn(status, dropTargetIssueId ?? undefined);
      }}
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col overflow-hidden",
        embedded ? "w-[232px] xl:w-[260px]" : "w-[320px]",
        openBoard
          ? "bg-transparent"
          : "bg-background rounded-t-2xl border-x border-t border-zinc-200/80 dark:border-zinc-800",
        isDropTarget &&
          (openBoard
            ? "rounded-xl bg-zinc-100/70 dark:bg-zinc-900/45"
            : "border-primary/40"),
      )}
    >
      <div
        className={cn(
          openBoard
            ? "sticky top-0 z-10 flex min-h-12 items-center justify-between gap-3 bg-zinc-50/95 px-1 backdrop-blur dark:bg-zinc-950/90"
            : "sticky top-0 z-10 flex min-h-12 items-center gap-3 rounded-t-2xl border-b px-3",
          embedded && "bg-background dark:bg-background px-0",
          !openBoard && styles.headerClassName,
        )}
      >
        {openBoard ? (
          <>
            <span
              className={cn(
                "inline-flex h-6 w-28 items-center gap-1.5 rounded-md border px-2 text-[12px] font-semibold",
                styles.accentClassName,
              )}
            >
              <span
                className={cn("h-3 w-1 rounded-full", styles.dotClassName)}
              />
              {getDisplayStatusLabel(status)}
            </span>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground min-w-4 text-right text-[12px] font-medium">
                {issues.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground size-7 rounded-md"
                onClick={onOpenComposer}
                aria-label={`Add issue to ${getDisplayStatusLabel(status)}`}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className={cn("size-2 rounded-full", styles.dotClassName)} />
            <h2 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
              {getDisplayStatusLabel(status)}
            </h2>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                styles.countClassName,
              )}
            >
              {issues.length}
            </span>

            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground ml-auto size-7 rounded-md"
              onClick={onOpenComposer}
              aria-label={`Add issue to ${getDisplayStatusLabel(status)}`}
            >
              <Plus className="size-4" />
            </Button>
          </>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          openBoard ? "px-1 pb-3" : "p-3",
          embedded && "px-0 pb-3",
        )}
      >
        {issues.length === 0 ? (
          <div
            className={cn(
              "text-muted-foreground flex min-h-28 items-center justify-center border border-dashed text-[12px] font-medium",
              openBoard
                ? "rounded-lg border-zinc-200/80 bg-white/45 dark:border-zinc-800/70 dark:bg-zinc-950/35"
                : "border-border/60 rounded-xl",
            )}
          >
            No issues yet
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {issues.map((issue) => (
            <IssueKanbanCard
              key={issue.id}
              issue={issue}
              isDragging={draggingIssueId === issue.id}
              openBoard={openBoard}
              embedded={embedded}
              dropPosition={
                dropTargetIssueId === issue.id ? dropTargetPosition : null
              }
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverIssue={onDragOverIssue}
              onDropOnIssue={(issueId) => onDropOnColumn(status, issueId)}
            />
          ))}
        </div>

        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground mt-3 flex min-h-9 w-full items-center gap-2 text-[12px] font-medium transition",
            openBoard
              ? "rounded-md px-1"
              : "rounded-lg border border-dashed border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950",
            embedded && "min-h-8",
          )}
          onClick={onOpenComposer}
        >
          <Plus className="size-3.5" />
          New issue
        </button>
      </div>
    </section>
  );
}

export function ProjectManagementIssueKanban1({
  embedded = false,
  showStats = false,
  showStatusBar = false,
  openBoard = false,
}: {
  embedded?: boolean;
  showStats?: boolean;
  showStatusBar?: boolean;
  openBoard?: boolean;
} = {}) {
  const [issues, setIssues] = useState<IssueBoardItem[]>(INITIAL_BOARD_ISSUES);
  const [statusFilter, setStatusFilter] =
    useState<IssueStatus[]>(ISSUE_STATUS_OPTIONS);
  const [createSheetDefaults, setCreateSheetDefaults] =
    useState<CreateIssueDefaults>({
      status: ISSUE_STATUS_OPTIONS[0] ?? "Backlog",
    });
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<IssueStatus | null>(
    null,
  );
  const [dropTargetIssueId, setDropTargetIssueId] = useState<string | null>(
    null,
  );
  const [dropTargetPosition, setDropTargetPosition] =
    useState<DropPosition | null>(null);

  const visibleStatuses = useMemo(
    () =>
      ISSUE_STATUS_OPTIONS.filter((status) => statusFilter.includes(status)),
    [statusFilter],
  );

  const groupedIssues = useMemo(
    () =>
      visibleStatuses.map((status) => ({
        status,
        issues: issues.filter((issue) => issue.status === status),
      })),
    [issues, visibleStatuses],
  );

  const visibleIssueCount = useMemo(
    () =>
      groupedIssues.reduce((count, group) => count + group.issues.length, 0),
    [groupedIssues],
  );

  const boardStats = useMemo<IssueKanbanStats>(() => {
    const visibleIssues = groupedIssues.flatMap((group) => group.issues);

    return {
      total: visibleIssues.length,
      active: visibleIssues.filter(
        (issue) => issue.status === "In Progress" || issue.status === "Review",
      ).length,
      blocked: visibleIssues.filter((issue) => issue.blocked).length,
      assigned: visibleIssues.filter((issue) => issue.assignee).length,
      completed: visibleIssues.filter((issue) => issue.status === "Done")
        .length,
    };
  }, [groupedIssues]);

  const toggleStatus = (status: IssueStatus) => {
    setStatusFilter((currentStatuses) => {
      const nextStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter((value) => value !== status)
        : [...currentStatuses, status];

      return nextStatuses.length > 0 ? nextStatuses : currentStatuses;
    });
  };

  const openCreateIssueSheet = (defaults: CreateIssueDefaults) => {
    setCreateSheetDefaults(defaults);
    setIsCreateSheetOpen(true);
  };

  const handleCreateIssue = (
    values: Parameters<typeof createProjectIssue>[0],
  ) => {
    setIssues((currentIssues) => [
      ...currentIssues,
      createProjectIssue(values, currentIssues.length),
    ]);
  };

  const handleTopAddIssue = () => {
    openCreateIssueSheet({
      status: visibleStatuses[0] ?? "Backlog",
    });
  };

  const reorderIssues = (
    currentIssues: IssueBoardItem[],
    draggedIssueId: string,
    status: IssueStatus,
    targetIssueId?: string,
    position: DropPosition = "after",
  ) => {
    const draggedIssue = currentIssues.find(
      (issue) => issue.id === draggedIssueId,
    );

    if (!draggedIssue) return currentIssues;

    const nextDraggedIssue = { ...draggedIssue, status };
    const remainingIssues = currentIssues.filter(
      (issue) => issue.id !== draggedIssueId,
    );

    if (targetIssueId === draggedIssueId) {
      return currentIssues;
    }

    if (!targetIssueId) {
      return [...remainingIssues, nextDraggedIssue];
    }

    const targetIndex = remainingIssues.findIndex(
      (issue) => issue.id === targetIssueId,
    );

    if (targetIndex === -1) {
      return [...remainingIssues, nextDraggedIssue];
    }

    const insertionIndex = position === "after" ? targetIndex + 1 : targetIndex;

    return [
      ...remainingIssues.slice(0, insertionIndex),
      nextDraggedIssue,
      ...remainingIssues.slice(insertionIndex),
    ];
  };

  const handleDropOnColumn = (status: IssueStatus, targetIssueId?: string) => {
    if (!draggingIssueId) return;

    setIssues((currentIssues) =>
      reorderIssues(
        currentIssues,
        draggingIssueId,
        status,
        targetIssueId,
        dropTargetPosition ?? "after",
      ),
    );
    setDraggingIssueId(null);
    setDropTargetStatus(null);
    setDropTargetIssueId(null);
    setDropTargetPosition(null);
  };

  return (
    <main className="bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {!embedded ? (
        <IssueKanbanHeader
          issueCount={visibleIssueCount}
          statusFilter={statusFilter}
          onToggleStatus={toggleStatus}
          onAddIssue={handleTopAddIssue}
        />
      ) : null}

      {showStatusBar && !embedded ? (
        <IssueKanbanStatusBar
          groupedIssues={groupedIssues}
          issueCount={visibleIssueCount}
        />
      ) : null}

      {showStats && !embedded ? (
        <IssueKanbanStatsCards stats={boardStats} />
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden",
          openBoard
            ? "bg-zinc-50/80 px-3 py-3 sm:px-4 dark:bg-zinc-950/40"
            : "px-4 py-4 sm:px-6",
          embedded && "bg-background dark:bg-background px-0 py-0 sm:px-0",
        )}
      >
        <div
          className={cn(
            "no-scrollbar flex h-full min-h-0 items-stretch overflow-x-auto pb-2",
            openBoard ? "gap-5" : "gap-4",
            embedded && "gap-3",
          )}
        >
          {groupedIssues.map((group) => (
            <IssueKanbanColumn
              key={group.status}
              status={group.status}
              issues={group.issues}
              isDropTarget={dropTargetStatus === group.status}
              onOpenComposer={() =>
                openCreateIssueSheet({
                  status: group.status,
                })
              }
              onDragStart={setDraggingIssueId}
              onDragEnd={() => {
                setDraggingIssueId(null);
                setDropTargetStatus(null);
                setDropTargetIssueId(null);
                setDropTargetPosition(null);
              }}
              draggingIssueId={draggingIssueId}
              dropTargetIssueId={dropTargetIssueId}
              dropTargetPosition={dropTargetPosition}
              onDragOverColumn={setDropTargetStatus}
              onDragOverColumnSpace={() => {
                setDropTargetIssueId(null);
                setDropTargetPosition(null);
              }}
              onDragOverIssue={(issueId, position) => {
                if (issueId === draggingIssueId) {
                  setDropTargetIssueId(null);
                  setDropTargetPosition(null);
                  return;
                }

                setDropTargetIssueId(issueId);
                setDropTargetPosition(position);
              }}
              onDropOnColumn={handleDropOnColumn}
              openBoard={openBoard}
              embedded={embedded}
            />
          ))}
        </div>
      </div>

      <CreateIssueSheet
        open={isCreateSheetOpen}
        defaults={createSheetDefaults}
        onOpenChange={setIsCreateSheetOpen}
        onCreateIssue={handleCreateIssue}
      />
    </main>
  );
}

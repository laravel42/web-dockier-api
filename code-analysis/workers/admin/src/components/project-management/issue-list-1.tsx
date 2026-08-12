"use client";

import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

type IssueListItem = GanttIssue & {
  assignee: IssueCollaborator | null;
  blocked: boolean;
  priority: IssuePriority;
  lane?: string;
  updateLabel: string;
  subIssueCount: number;
};

const STATUS_STYLES: Record<
  IssueStatus,
  {
    badgeClassName: string;
    dotClassName: string;
    groupIconClassName: string;
    headerClassName: string;
  }
> = {
  Backlog: {
    badgeClassName:
      "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
    dotClassName: "bg-zinc-400 dark:bg-zinc-500",
    groupIconClassName:
      "border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
  },
  Planned: {
    badgeClassName:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-950 dark:bg-sky-950/40 dark:text-sky-300",
    dotClassName: "bg-sky-400 dark:bg-sky-500",
    groupIconClassName:
      "border-sky-300 text-sky-500 dark:border-sky-800 dark:text-sky-400",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
  },
  "In Progress": {
    badgeClassName:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300",
    dotClassName: "bg-amber-400 dark:bg-amber-500",
    groupIconClassName:
      "border-amber-300 text-amber-500 dark:border-amber-800 dark:text-amber-400",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
  },
  Review: {
    badgeClassName:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-950 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
    dotClassName: "bg-fuchsia-400 dark:bg-fuchsia-500",
    groupIconClassName:
      "border-fuchsia-300 text-fuchsia-500 dark:border-fuchsia-800 dark:text-fuchsia-400",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
  },
  Done: {
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300",
    dotClassName: "bg-emerald-500 dark:bg-emerald-500",
    groupIconClassName:
      "border-emerald-300 text-emerald-500 dark:border-emerald-800 dark:text-emerald-400",
    headerClassName: "bg-zinc-50 dark:bg-zinc-950/60",
  },
};

const ISSUE_META: Record<
  string,
  Pick<
    IssueListItem,
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

const INITIAL_LIST_ISSUES: IssueListItem[] = INITIAL_PROJECT_ISSUES.map(
  (issue) => ({
    ...issue,
    assignee: ISSUE_META[issue.id]?.assignee ?? null,
    blocked: ISSUE_META[issue.id]?.blocked ?? false,
    priority: ISSUE_META[issue.id]?.priority ?? null,
    lane: ISSUE_META[issue.id]?.lane,
    updateLabel: ISSUE_META[issue.id]?.updateLabel ?? "Updated today",
    subIssueCount: ISSUE_META[issue.id]?.subIssueCount ?? 0,
  }),
);

function StatusIcon({ status }: { status: IssueStatus }) {
  const styles = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border",
        styles.groupIconClassName,
      )}
    >
      <span className={cn("size-1.5 rounded-full", styles.dotClassName)} />
    </span>
  );
}

function StatusBadge({ status }: { status: IssueStatus }) {
  const styles = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
        styles.badgeClassName,
      )}
    >
      <span className={cn("size-1.5 rounded-full", styles.dotClassName)} />
      <span>{getDisplayStatusLabel(status)}</span>
    </span>
  );
}

function IconChip(props: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  const { children, className, label } = props;

  return (
    <span
      aria-label={label}
      className={cn(
        "text-muted-foreground inline-flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
    >
      {children}
    </span>
  );
}

type IssueListHeaderProps = {
  issueCount: number;
  statusFilter: IssueStatus[];
  onToggleStatus: (status: IssueStatus) => void;
  onAddIssue: () => void;
};

function IssueListHeader(props: IssueListHeaderProps) {
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

type IssueRowProps = {
  issue: IssueListItem;
};

function IssueRow(props: IssueRowProps) {
  const { issue } = props;

  return (
    <div className="group hover:bg-muted/30 grid min-h-[50px] grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 transition-colors sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
          {issue.code}
        </p>
      </div>

      <div className="min-w-0 py-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">
            {issue.title}
          </p>
          {issue.description ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-[12px]">
              {issue.description}
            </p>
          ) : null}
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            <span>{issue.updateLabel}</span>
            {issue.priority ? (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">/</span>
                <span className="capitalize">{issue.priority} priority</span>
              </>
            ) : null}
            {issue.blocked ? (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">/</span>
                <span>Blocked</span>
              </>
            ) : null}
            {issue.subIssueCount > 0 ? (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">/</span>
                <span>
                  {issue.subIssueCount} sub-issue
                  {issue.subIssueCount === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <StatusBadge status={issue.status} />

        {issue.assignee ? (
          <div className="inline-flex h-7 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-950">
            <Avatar className="size-5">
              <AvatarImage
                src={issue.assignee.avatar}
                alt={issue.assignee.name}
              />
              <AvatarFallback className="bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                {issue.assignee.initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-[12px] font-medium text-zinc-600 xl:inline dark:text-zinc-300">
              {issue.assignee.name}
            </span>
          </div>
        ) : (
          <IconChip
            label="Assign issue"
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Users className="size-3.5" />
          </IconChip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-7 rounded-md opacity-70 transition-opacity group-hover:opacity-100"
              aria-label={`More actions for ${issue.title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem>Open issue</DropdownMenuItem>
            <DropdownMenuItem>Copy issue link</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Move to next status</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

type IssueGroupProps = {
  status: IssueStatus;
  issues: IssueListItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenComposer: () => void;
};

function IssueGroup(props: IssueGroupProps) {
  const { status, issues, collapsed, onToggleCollapse, onOpenComposer } = props;
  const statusStyles = STATUS_STYLES[status];
  return (
    <section className="border-b last:border-b-0">
      <div
        className={cn(
          "sticky top-0 z-10 flex min-h-[50px] items-center gap-3 border-b px-4 sm:px-6",
          statusStyles.headerClassName,
        )}
      >
        <button
          type="button"
          className="flex min-w-0 items-center gap-2.5 text-[14px] font-semibold text-zinc-800 dark:text-zinc-200"
          onClick={onToggleCollapse}
        >
          {collapsed ? (
            <ChevronRight className="text-muted-foreground size-4" />
          ) : (
            <ChevronDown className="text-muted-foreground size-4" />
          )}
          <StatusIcon status={status} />
          <span>{getDisplayStatusLabel(status)}</span>
          <span className="text-muted-foreground rounded-full bg-white px-1.5 py-0.5 text-[11px] font-medium dark:bg-zinc-900">
            {issues.length}
          </span>
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground ml-auto size-7 rounded-md"
          onClick={onOpenComposer}
          aria-label={`Add issue to ${getDisplayStatusLabel(status)}`}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {!collapsed ? (
        <>
          <div>
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex min-h-8 w-full items-center gap-2 bg-zinc-50/65 px-4 text-[12px] font-medium sm:px-6 dark:bg-zinc-950/40"
            onClick={onOpenComposer}
          >
            <Plus className="size-3.5" />
            New issue
          </button>
        </>
      ) : null}
    </section>
  );
}

export function ProjectManagementIssueList1() {
  const [issues, setIssues] = useState<IssueListItem[]>(INITIAL_LIST_ISSUES);
  const [statusFilter, setStatusFilter] =
    useState<IssueStatus[]>(ISSUE_STATUS_OPTIONS);
  const [collapsedGroups, setCollapsedGroups] = useState<IssueStatus[]>([]);
  const [createSheetDefaults, setCreateSheetDefaults] =
    useState<CreateIssueDefaults>({
      status: ISSUE_STATUS_OPTIONS[0] ?? "Backlog",
    });
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

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

  const toggleStatus = (status: IssueStatus) => {
    setStatusFilter((currentStatuses) => {
      const nextStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter((value) => value !== status)
        : [...currentStatuses, status];

      return nextStatuses.length > 0 ? nextStatuses : currentStatuses;
    });
  };

  const toggleGroupCollapse = (status: IssueStatus) => {
    setCollapsedGroups((currentGroups) =>
      currentGroups.includes(status)
        ? currentGroups.filter((value) => value !== status)
        : [...currentGroups, status],
    );
  };

  const openCreateIssueSheet = (defaults: CreateIssueDefaults) => {
    const nextStatus = defaults.status;

    if (nextStatus) {
      setCollapsedGroups((currentGroups) =>
        currentGroups.includes(nextStatus)
          ? currentGroups.filter((value) => value !== nextStatus)
          : currentGroups,
      );
    }

    setCreateSheetDefaults(defaults);
    setIsCreateSheetOpen(true);
  };

  const handleStatusAddIssue = (status: IssueStatus) => {
    setCollapsedGroups((currentGroups) =>
      currentGroups.includes(status)
        ? currentGroups.filter((value) => value !== status)
        : currentGroups,
    );

    openCreateIssueSheet({
      status,
    });
  };

  const handleTopAddIssue = () => {
    openCreateIssueSheet({
      status: visibleStatuses[0] ?? "Backlog",
    });
  };

  const handleCreateIssue = (
    values: Parameters<typeof createProjectIssue>[0],
  ) => {
    setIssues((currentIssues) => [
      ...currentIssues,
      createProjectIssue(values, currentIssues.length),
    ]);
  };

  return (
    <main className="bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <IssueListHeader
        issueCount={visibleIssueCount}
        statusFilter={statusFilter}
        onToggleStatus={toggleStatus}
        onAddIssue={handleTopAddIssue}
      />

      <div className="flex-1 overflow-auto">
        {groupedIssues.map((group) => (
          <IssueGroup
            key={group.status}
            status={group.status}
            issues={group.issues}
            collapsed={collapsedGroups.includes(group.status)}
            onToggleCollapse={() => toggleGroupCollapse(group.status)}
            onOpenComposer={() => handleStatusAddIssue(group.status)}
          />
        ))}
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

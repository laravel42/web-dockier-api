"use client";

import {
  ArrowUpDown,
  CalendarDays,
  CircleDot,
  Flag,
  Layers3,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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

type SpreadsheetIssue = GanttIssue & {
  assignee: IssueCollaborator | null;
  blocked: boolean;
  priority: IssuePriority;
  labels: string[];
  cycle: string | null;
  module: string | null;
};

const STATUS_STYLES: Record<
  IssueStatus,
  {
    badgeClassName: string;
    dotClassName: string;
  }
> = {
  Backlog: {
    badgeClassName:
      "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
    dotClassName: "bg-zinc-400 dark:bg-zinc-500",
  },
  Planned: {
    badgeClassName:
      "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200",
    dotClassName: "bg-cyan-400 dark:bg-cyan-500",
  },
  "In Progress": {
    badgeClassName:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
    dotClassName: "bg-amber-400 dark:bg-amber-500",
  },
  Review: {
    badgeClassName:
      "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/30 dark:text-fuchsia-200",
    dotClassName: "bg-fuchsia-400 dark:bg-fuchsia-500",
  },
  Done: {
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
    dotClassName: "bg-emerald-400 dark:bg-emerald-500",
  },
};

const ISSUE_META: Record<
  string,
  Omit<SpreadsheetIssue, keyof GanttIssue | "id" | "code" | "title" | "status">
> = {
  "issue-001": {
    assignee: {
      initials: "NO",
      name: "Nina Oliver",
      avatar: "/avatars/avatar-5.png",
    },
    blocked: false,
    priority: "high",
    labels: ["timeline", "frontend"],
    cycle: "Q2 Launch",
    module: "Platform",
  },
  "issue-002": {
    assignee: null,
    blocked: false,
    priority: "medium",
    labels: ["review"],
    cycle: "Q2 Launch",
    module: "Planning",
  },
  "issue-003": {
    assignee: {
      initials: "KY",
      name: "Kai Young",
      avatar: "/avatars/avatar-black-2.png",
    },
    blocked: false,
    priority: "high",
    labels: ["views", "filters"],
    cycle: "Q2 Launch",
    module: "Views",
  },
  "issue-004": {
    assignee: null,
    blocked: true,
    priority: null,
    labels: ["guidelines"],
    cycle: null,
    module: "Guidelines",
  },
  "issue-005": {
    assignee: null,
    blocked: false,
    priority: "medium",
    labels: ["states"],
    cycle: "Q2 Launch",
    module: "States",
  },
  "issue-006": {
    assignee: {
      initials: "LM",
      name: "Lena Moss",
      avatar: "/avatars/avatar-3.png",
    },
    blocked: false,
    priority: "low",
    labels: ["handoff"],
    cycle: "Completed",
    module: "Operations",
  },
  "issue-007": {
    assignee: {
      initials: "AR",
      name: "Ava Reed",
      avatar: "/avatars/avatar-1.png",
    },
    blocked: false,
    priority: "medium",
    labels: ["density"],
    cycle: "Q2 Launch",
    module: "Calendar",
  },
  "issue-008": {
    assignee: null,
    blocked: false,
    priority: null,
    labels: ["calendar"],
    cycle: null,
    module: "Calendar",
  },
};

const INITIAL_SPREADSHEET_ISSUES: SpreadsheetIssue[] =
  INITIAL_PROJECT_ISSUES.map((issue) => ({
    ...issue,
    assignee: ISSUE_META[issue.id]?.assignee ?? null,
    blocked: ISSUE_META[issue.id]?.blocked ?? false,
    priority: ISSUE_META[issue.id]?.priority ?? null,
    labels: ISSUE_META[issue.id]?.labels ?? [],
    cycle: ISSUE_META[issue.id]?.cycle ?? null,
    module: ISSUE_META[issue.id]?.module ?? null,
  }));

const COLUMN_CONFIG = [
  { key: "status", label: "Status", width: "min-w-36" },
  { key: "priority", label: "Priority", width: "min-w-32" },
  { key: "assignee", label: "Assignee", width: "min-w-44" },
  { key: "labels", label: "Labels", width: "min-w-60" },
  { key: "startDate", label: "Start date", width: "min-w-36" },
  { key: "targetDate", label: "Due date", width: "min-w-36" },
  { key: "cycle", label: "Cycle", width: "min-w-36" },
  { key: "module", label: "Modules", width: "min-w-36" },
] as const;

type SpreadsheetSortKey = "manual" | "title" | "priority" | "due-date";

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

function ProjectHeader(props: {
  issueCount: number;
  statusFilter: IssueStatus[];
  searchQuery: string;
  activeFilterCount: number;
  hasControlsApplied: boolean;
  sortBy: SpreadsheetSortKey;
  onToggleStatus: (status: IssueStatus) => void;
  onSearchQueryChange: (value: string) => void;
  onPriorityToggle: (priority: Exclude<IssuePriority, null>) => void;
  priorityFilter: IssuePriority[];
  assigneeFilter: "all" | "assigned" | "unassigned";
  onAssigneeFilterChange: (value: "all" | "assigned" | "unassigned") => void;
  onSortChange: (value: SpreadsheetSortKey) => void;
  onResetControls: () => void;
  onAddIssue: () => void;
}) {
  const {
    issueCount,
    statusFilter,
    searchQuery,
    activeFilterCount,
    hasControlsApplied,
    sortBy,
    onToggleStatus,
    onSearchQueryChange,
    onPriorityToggle,
    priorityFilter,
    assigneeFilter,
    onAssigneeFilterChange,
    onSortChange,
    onResetControls,
    onAddIssue,
  } = props;
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
            <Button
              size="sm"
              className="h-9 rounded-lg px-4"
              onClick={onAddIssue}
            >
              <Plus className="mr-2 size-3.5" />
              Add issue
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">
              {issueCount} Issues
            </span>
            {hasControlsApplied && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-8 rounded-md px-2"
                onClick={onResetControls}
              >
                <X className="mr-1.5 size-3.5" />
                Reset
              </Button>
            )}
          </div>

          <div className="grid min-w-0 grid-cols-3 items-center gap-2 sm:flex sm:flex-row sm:items-center">
            <div className="relative col-span-3 min-w-0 sm:w-60 lg:w-72">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search issues"
                aria-label="Search issues"
                className="h-9 rounded-lg pl-9 shadow-none"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-center rounded-lg sm:w-auto"
                  aria-label="Display statuses"
                >
                  <CircleDot className="size-3.5" />
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Visible statuses</DropdownMenuLabel>
                <DropdownMenuSeparator />
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-center rounded-lg sm:w-auto"
                >
                  <SlidersHorizontal className="size-3.5" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <span className="bg-muted text-foreground inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter issues</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Priority
                </DropdownMenuLabel>
                {(["high", "medium", "low"] as const).map((priority) => (
                  <DropdownMenuCheckboxItem
                    key={priority}
                    checked={priorityFilter.includes(priority)}
                    onCheckedChange={() => onPriorityToggle(priority)}
                  >
                    <span className="capitalize">{priority}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Assignee
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={assigneeFilter}
                  onValueChange={(value) =>
                    onAssigneeFilterChange(
                      value as "all" | "assigned" | "unassigned",
                    )
                  }
                >
                  <DropdownMenuRadioItem value="all">
                    Everyone
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="assigned">
                    Assigned
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="unassigned">
                    Unassigned
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-center rounded-lg sm:w-auto"
                >
                  <ArrowUpDown className="size-3.5" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuRadioGroup
                  value={sortBy}
                  onValueChange={(value) =>
                    onSortChange(value as SpreadsheetSortKey)
                  }
                >
                  <DropdownMenuRadioItem value="manual">
                    Manual
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="title">
                    Title
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="priority">
                    Priority
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="due-date">
                    Due date
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>
  );
}

function SpreadsheetCell(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "group-hover:bg-muted/60 h-11 border-r border-b px-4 align-middle text-sm text-zinc-700 transition-colors dark:text-zinc-300",
        props.className,
      )}
    >
      {props.children}
    </td>
  );
}

export function ProjectManagementIssueSpreadsheet1({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const [issues, setIssues] = useState<SpreadsheetIssue[]>(
    INITIAL_SPREADSHEET_ISSUES,
  );
  const [statusFilter, setStatusFilter] =
    useState<IssueStatus[]>(ISSUE_STATUS_OPTIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<
    "all" | "assigned" | "unassigned"
  >("all");
  const [sortBy, setSortBy] = useState<SpreadsheetSortKey>("manual");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const visibleIssues = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
    const filtered = issues.filter((issue) => {
      if (!statusFilter.includes(issue.status)) {
        return false;
      }

      if (
        priorityFilter.length > 0 &&
        !priorityFilter.includes(issue.priority)
      ) {
        return false;
      }

      if (assigneeFilter === "assigned" && !issue.assignee) {
        return false;
      }

      if (assigneeFilter === "unassigned" && issue.assignee) {
        return false;
      }

      if (normalizedQuery.length === 0) {
        return true;
      }

      const searchTarget = [
        issue.code,
        issue.title,
        issue.assignee?.name ?? "",
        issue.labels.join(" "),
        issue.module ?? "",
        issue.cycle ?? "",
        getDisplayStatusLabel(issue.status),
      ]
        .join(" ")
        .toLowerCase();

      return searchTarget.includes(normalizedQuery);
    });

    if (sortBy === "manual") {
      return filtered;
    }

    const priorityWeight: Record<Exclude<IssuePriority, null>, number> = {
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...filtered].sort((left, right) => {
      if (sortBy === "title") {
        return left.title.localeCompare(right.title);
      }

      if (sortBy === "priority") {
        const leftWeight = left.priority
          ? priorityWeight[left.priority]
          : Number.MAX_SAFE_INTEGER;
        const rightWeight = right.priority
          ? priorityWeight[right.priority]
          : Number.MAX_SAFE_INTEGER;
        return leftWeight - rightWeight;
      }

      const leftDate = left.targetDate ?? "9999-99-99";
      const rightDate = right.targetDate ?? "9999-99-99";
      return leftDate.localeCompare(rightDate);
    });
  }, [
    assigneeFilter,
    deferredSearchQuery,
    issues,
    priorityFilter,
    sortBy,
    statusFilter,
  ]);

  const handleToggleStatus = (status: IssueStatus) => {
    setStatusFilter((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  };

  const togglePriorityFilter = (priority: Exclude<IssuePriority, null>) => {
    setPriorityFilter((current) =>
      current.includes(priority)
        ? current.filter((value) => value !== priority)
        : [...current, priority],
    );
  };

  const activeFilterCount =
    priorityFilter.length + (assigneeFilter === "all" ? 0 : 1);
  const hasControlsApplied =
    searchQuery.length > 0 ||
    activeFilterCount > 0 ||
    sortBy !== "manual" ||
    statusFilter.length !== ISSUE_STATUS_OPTIONS.length;

  const resetControls = () => {
    setSearchQuery("");
    setStatusFilter(ISSUE_STATUS_OPTIONS);
    setPriorityFilter([]);
    setAssigneeFilter("all");
    setSortBy("manual");
  };

  const handleCreateIssue = (
    values: Parameters<typeof createProjectIssue>[0],
  ) => {
    const createdIssue = createProjectIssue(values, issues.length);

    setIssues((current) => [
      ...current,
      {
        ...createdIssue,
        assignee: null,
        blocked: false,
        labels: [],
        cycle: null,
        module: null,
      },
    ]);
  };

  return (
    <>
      <div className="bg-background flex h-full flex-col overflow-hidden">
        {!embedded ? (
          <ProjectHeader
            issueCount={visibleIssues.length}
            statusFilter={statusFilter}
            searchQuery={searchQuery}
            activeFilterCount={activeFilterCount}
            hasControlsApplied={hasControlsApplied}
            sortBy={sortBy}
            onToggleStatus={handleToggleStatus}
            onSearchQueryChange={setSearchQuery}
            onPriorityToggle={togglePriorityFilter}
            priorityFilter={priorityFilter}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={setAssigneeFilter}
            onSortChange={setSortBy}
            onResetControls={resetControls}
            onAddIssue={() => setCreateSheetOpen(true)}
          />
        ) : null}

        <div className="flex-1 overflow-hidden">
          <div className="horizontal-scrollbar vertical-scrollbar h-full overflow-auto">
            {visibleIssues.length > 0 ? (
              <table className="bg-background w-full min-w-[1340px] border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th
                      className={cn(
                        "bg-muted sticky top-0 z-30 h-11 border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 sm:left-0 dark:text-zinc-100",
                        embedded
                          ? "w-[300px] max-w-[300px] min-w-[300px]"
                          : "min-w-[320px] sm:min-w-[360px]",
                      )}
                    >
                      Issues
                    </th>
                    {COLUMN_CONFIG.map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "bg-muted sticky top-0 z-20 h-11 border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100",
                          column.width,
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {visibleIssues.map((issue) => (
                    <tr key={issue.id} className="group">
                      <td
                        className={cn(
                          "bg-background group-hover:bg-muted z-10 h-11 border-r border-b px-4 align-middle transition-colors sm:sticky sm:left-0",
                          embedded
                            ? "w-[300px] max-w-[300px] min-w-[300px]"
                            : "min-w-[320px] sm:min-w-[360px]",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <span className="shrink-0 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
                                {issue.code}
                              </span>
                              <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                                {issue.title}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground size-7 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
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
                          <span className="capitalize">
                            {issue.priority ?? "None"}
                          </span>
                        </div>
                      </SpreadsheetCell>

                      <SpreadsheetCell>
                        {issue.assignee ? (
                          <div className="inline-flex items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarImage
                                src={issue.assignee.avatar}
                                alt={issue.assignee.name}
                              />
                              <AvatarFallback className="text-[10px]">
                                {issue.assignee.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-[13px]">
                              {issue.assignee.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            No owner
                          </span>
                        )}
                      </SpreadsheetCell>

                      <SpreadsheetCell>
                        {issue.labels.length ? (
                          <div className="flex flex-nowrap gap-1.5">
                            {issue.labels.slice(0, 2).map((label) => (
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

                      <SpreadsheetCell>
                        <div className="inline-flex items-center gap-2">
                          <CalendarDays className="text-muted-foreground size-3.5" />
                          <span>{issue.startDate ?? "-"}</span>
                        </div>
                      </SpreadsheetCell>

                      <SpreadsheetCell>
                        <div className="inline-flex items-center gap-2">
                          <CalendarDays className="text-muted-foreground size-3.5" />
                          <span>{issue.targetDate ?? "-"}</span>
                        </div>
                      </SpreadsheetCell>

                      <SpreadsheetCell>
                        <div className="inline-flex items-center gap-2">
                          <CircleDot className="text-muted-foreground size-3.5" />
                          <span>{issue.cycle ?? "None"}</span>
                        </div>
                      </SpreadsheetCell>

                      <SpreadsheetCell className="border-r-0">
                        <div className="inline-flex items-center gap-2">
                          <Layers3 className="text-muted-foreground size-3.5" />
                          <span>{issue.module ?? "None"}</span>
                        </div>
                      </SpreadsheetCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <>
                <table className="bg-background w-full min-w-[1340px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th
                        className={cn(
                          "bg-muted h-11 border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100",
                          embedded
                            ? "w-[300px] max-w-[300px] min-w-[300px]"
                            : "min-w-[320px] sm:min-w-[360px]",
                        )}
                      >
                        Issues
                      </th>
                      {COLUMN_CONFIG.map((column) => (
                        <th
                          key={column.key}
                          className={cn(
                            "bg-muted h-11 border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100",
                            column.width,
                          )}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                </table>

                <div className="bg-background flex min-h-[360px] items-center justify-center border-b px-6 py-10">
                  <div className="bg-card border-border/60 w-full max-w-md rounded-2xl border px-8 py-10 text-center shadow-sm">
                    <div className="bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl">
                      <Search className="text-muted-foreground size-5" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-base font-semibold">
                        {hasControlsApplied
                          ? "No issues match the current view"
                          : "No issues yet"}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {hasControlsApplied
                          ? "Try a different search, adjust the filters, or reset the spreadsheet to bring everything back."
                          : "Add your first issue to start filling out the spreadsheet view."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-5 h-9 gap-1.5"
                      onClick={
                        hasControlsApplied
                          ? resetControls
                          : () => setCreateSheetOpen(true)
                      }
                    >
                      {hasControlsApplied ? (
                        <X className="size-3.5" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      {hasControlsApplied ? "Reset view" : "Add issue"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <CreateIssueSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        onCreateIssue={handleCreateIssue}
        defaults={{ status: "Planned" as CreateIssueDefaults["status"] }}
      />
    </>
  );
}

"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  GitPullRequest,
  Globe as Github,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Signal,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  getDisplayStatusLabel,
  INITIAL_PROJECT_ISSUES,
  ISSUE_STATUS_OPTIONS,
  type IssuePriority,
  type IssueStatus,
  PROJECT_ICON,
  PROJECT_TABS,
} from "./issue-core";

type IssueList2Item = {
  id: string;
  code: string;
  title: string;
  status: IssueStatus;
  date: string;
  lane: string;
  priority: IssuePriority;
  blocked: boolean;
  subIssueCount: number;
  comments?: number;
  estimate?: string;
  hasPullRequest?: boolean;
};

const issueMeta: Record<
  string,
  Pick<
    IssueList2Item,
    | "date"
    | "lane"
    | "priority"
    | "blocked"
    | "subIssueCount"
    | "comments"
    | "estimate"
    | "hasPullRequest"
  >
> = {
  "issue-001": {
    date: "12 May",
    lane: "Platform",
    priority: "high",
    blocked: false,
    subIssueCount: 3,
    estimate: "0h",
    hasPullRequest: true,
  },
  "issue-002": {
    date: "3 Apr",
    lane: "Planning",
    priority: "medium",
    blocked: false,
    subIssueCount: 1,
    comments: 2,
    estimate: "0h",
    hasPullRequest: true,
  },
  "issue-003": {
    date: "8 Feb",
    lane: "Views",
    priority: "high",
    blocked: false,
    subIssueCount: 4,
    comments: 2,
    estimate: "0h",
    hasPullRequest: true,
  },
  "issue-004": {
    date: "7 Oct",
    lane: "Guidelines",
    priority: null,
    blocked: true,
    subIssueCount: 0,
    estimate: "0h",
  },
  "issue-005": {
    date: "1 Sept",
    lane: "States",
    priority: "medium",
    blocked: false,
    subIssueCount: 2,
    estimate: "0h",
  },
  "issue-006": {
    date: "26 Jun",
    lane: "Handoffs",
    priority: "low",
    blocked: false,
    subIssueCount: 1,
    estimate: "0h",
    hasPullRequest: true,
  },
  "issue-007": {
    date: "26 Jun",
    lane: "Density",
    priority: "medium",
    blocked: false,
    subIssueCount: 2,
    estimate: "0h",
    hasPullRequest: true,
  },
  "issue-008": {
    date: "20 Mar",
    lane: "Calendar",
    priority: null,
    blocked: false,
    subIssueCount: 0,
    comments: 1,
    estimate: "0h",
    hasPullRequest: true,
  },
};

const baseIssues: IssueList2Item[] = INITIAL_PROJECT_ISSUES.map((issue) => ({
  ...issue,
  date: issueMeta[issue.id]?.date ?? "15 Jan",
  lane: issueMeta[issue.id]?.lane ?? "General",
  priority: issueMeta[issue.id]?.priority ?? null,
  blocked: issueMeta[issue.id]?.blocked ?? false,
  subIssueCount: issueMeta[issue.id]?.subIssueCount ?? 0,
  comments: issueMeta[issue.id]?.comments,
  estimate: issueMeta[issue.id]?.estimate,
  hasPullRequest: issueMeta[issue.id]?.hasPullRequest,
}));

const extraIssues: IssueList2Item[] = [
  {
    id: "issue-109",
    code: "RFC-109",
    title: "Verify saved view presets across workspaces",
    status: "Review",
    date: "18 Jun",
    lane: "Views",
    priority: "medium",
    blocked: false,
    subIssueCount: 1,
    comments: 1,
    estimate: "0h",
    hasPullRequest: true,
  },
  {
    id: "issue-110",
    code: "RFC-110",
    title: "Define backlog import edge cases",
    status: "Backlog",
    date: "4 Aug",
    lane: "Import",
    priority: null,
    blocked: false,
    subIssueCount: 0,
    estimate: "0h",
  },
  {
    id: "issue-111",
    code: "RFC-111",
    title: "Prepare cycle planning defaults",
    status: "Planned",
    date: "11 Apr",
    lane: "Planning",
    priority: "medium",
    blocked: false,
    subIssueCount: 2,
    estimate: "0h",
    hasPullRequest: true,
  },
  {
    id: "issue-112",
    code: "RFC-112",
    title: "Tune inline issue activity affordances",
    status: "In Progress",
    date: "22 May",
    lane: "Activity",
    priority: "high",
    blocked: false,
    subIssueCount: 3,
    comments: 2,
    estimate: "0h",
    hasPullRequest: true,
  },
  {
    id: "issue-113",
    code: "RFC-113",
    title: "Connect keyboard focus states to list navigation",
    status: "In Progress",
    date: "30 May",
    lane: "Accessibility",
    priority: "medium",
    blocked: false,
    subIssueCount: 1,
    estimate: "0h",
    hasPullRequest: true,
  },
  {
    id: "issue-114",
    code: "RFC-114",
    title: "Archive completed project setup tasks",
    status: "Done",
    date: "14 Jun",
    lane: "Operations",
    priority: "low",
    blocked: false,
    subIssueCount: 0,
    estimate: "0h",
  },
  {
    id: "issue-115",
    code: "RFC-115",
    title: "Ship compact issue metadata pass",
    status: "Done",
    date: "19 Jun",
    lane: "Density",
    priority: "medium",
    blocked: false,
    subIssueCount: 1,
    comments: 1,
    estimate: "0h",
    hasPullRequest: true,
  },
];

const issues: IssueList2Item[] = [...baseIssues, ...extraIssues];

const groupOrder: IssueStatus[] = [
  "Review",
  "Backlog",
  "Planned",
  "In Progress",
  "Done",
];

const groupStyles: Record<
  IssueStatus,
  {
    header: string;
    icon: string;
    text: string;
    defaultCollapsed?: boolean;
  }
> = {
  Backlog: {
    header:
      "border-zinc-300 bg-zinc-200/70 dark:border-zinc-800 dark:bg-zinc-900/80",
    icon: "border-zinc-400 text-zinc-400",
    text: "text-zinc-600 dark:text-zinc-300",
  },
  Planned: {
    header:
      "border-cyan-200 bg-cyan-100/60 dark:border-cyan-900 dark:bg-cyan-950/35",
    icon: "border-cyan-400 text-cyan-500",
    text: "text-cyan-700 dark:text-cyan-200",
    defaultCollapsed: true,
  },
  "In Progress": {
    header:
      "border-amber-200 bg-amber-100/60 dark:border-amber-900 dark:bg-amber-950/35",
    icon: "border-amber-400 text-amber-500",
    text: "text-amber-700 dark:text-amber-200",
  },
  Review: {
    header:
      "border-fuchsia-200 bg-fuchsia-100/60 dark:border-fuchsia-900 dark:bg-fuchsia-950/35",
    icon: "border-fuchsia-400 text-fuchsia-500",
    text: "text-fuchsia-700 dark:text-fuchsia-200",
  },
  Done: {
    header:
      "border-emerald-200 bg-emerald-100/60 dark:border-emerald-900 dark:bg-emerald-950/35",
    icon: "border-emerald-400 text-emerald-500",
    text: "text-emerald-700 dark:text-emerald-200",
    defaultCollapsed: true,
  },
};

function StatusGlyph({ status }: { status: IssueStatus }) {
  const styles = groupStyles[status];

  return (
    <span
      className={cn(
        "inline-flex size-3.5 items-center justify-center rounded-full border",
        styles.icon,
      )}
    >
      {status === "Backlog" ? (
        <Circle className="size-2.5" />
      ) : (
        <Check className="size-2.5" />
      )}
    </span>
  );
}

function IssueRow({ issue }: { issue: IssueList2Item }) {
  return (
    <div className="group grid h-11 grid-cols-[34px_92px_34px_minmax(260px,1fr)_auto] items-center border-b border-zinc-200 bg-zinc-100/60 text-[13px] transition-colors last:border-b-0 hover:bg-zinc-200/70 dark:border-zinc-800 dark:bg-zinc-950/55 dark:hover:bg-zinc-900/80">
      <div className="flex justify-end pr-1.5 text-zinc-900 dark:text-zinc-100">
        <Signal className="size-3.5" />
      </div>
      <div className="truncate font-medium text-zinc-500 dark:text-zinc-400">
        {issue.code}
      </div>
      <div className="flex items-center justify-center">
        <StatusGlyph status={issue.status} />
      </div>
      <div className="flex min-w-0 items-center gap-2 pr-4">
        {issue.hasPullRequest ? (
          <GitPullRequest
            className={cn("size-4 shrink-0", groupStyles[issue.status].text)}
          />
        ) : null}
        <span className="truncate text-zinc-950 dark:text-zinc-100">
          {issue.title}
        </span>
        {issue.comments ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 text-[12px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
            <MessageCircle className="size-3.5" />
            {issue.comments}
          </span>
        ) : null}
      </div>
      <div className="flex h-full items-center text-zinc-500 dark:text-zinc-400">
        <div className="flex w-36 items-center justify-start border-l border-zinc-200 px-3 dark:border-zinc-800">
          <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 text-[12px] dark:border-zinc-800 dark:bg-zinc-950">
            <Github className="size-4" />
            <span className="truncate">{issue.lane}</span>
          </span>
        </div>
        <div className="flex w-16 items-center gap-1 border-l border-zinc-200 px-3 dark:border-zinc-800">
          <Circle className="size-4 text-zinc-300 dark:text-zinc-700" />
          <span>{issue.estimate}</span>
        </div>
        <div className="w-20 border-l border-zinc-200 px-3 dark:border-zinc-800">
          {issue.date}
        </div>
        <div className="flex w-12 justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-200/70 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            aria-label={`Assign ${issue.code}`}
          >
            <UserRound className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function IssueGroup({
  status,
  rows,
  collapsed,
  onToggle,
}: {
  status: IssueStatus;
  rows: IssueList2Item[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const styles = groupStyles[status];

  return (
    <section className="overflow-hidden rounded-[4px] border border-zinc-300 dark:border-zinc-800">
      <button
        type="button"
        className={cn(
          "flex h-[42px] w-full items-center gap-2 px-3 text-left text-[14px] font-medium",
          styles.header,
          styles.text,
        )}
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 text-zinc-950 dark:text-zinc-100" />
        ) : (
          <ChevronDown className="size-3.5 text-zinc-950 dark:text-zinc-100" />
        )}
        <StatusGlyph status={status} />
        <span>{getDisplayStatusLabel(status)}</span>
        <span className="text-zinc-500 dark:text-zinc-400">{rows.length}</span>
      </button>

      {!collapsed && rows.length > 0 ? (
        <div>
          {rows.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type IssueListHeaderProps = {
  issueCount: number;
  statusFilter: IssueStatus[];
  onToggleStatus: (status: IssueStatus) => void;
};

function IssueListHeader(props: IssueListHeaderProps) {
  const { issueCount, statusFilter, onToggleStatus } = props;
  const ProjectIcon = PROJECT_ICON;

  return (
    <>
      <div className="border-b bg-white dark:bg-zinc-950">
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

            <Button size="sm" className="h-8 shrink-0 gap-1.5">
              <Plus className="size-3.5" />
              Add issue
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-11 items-center justify-between border-b bg-white px-4 py-1.5 sm:px-6 dark:bg-zinc-950">
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

export function ProjectManagementIssueList2() {
  const [collapsedGroups, setCollapsedGroups] = useState<IssueStatus[]>(
    groupOrder.filter((status) => groupStyles[status].defaultCollapsed),
  );
  const [statusFilter, setStatusFilter] =
    useState<IssueStatus[]>(ISSUE_STATUS_OPTIONS);

  const groupedIssues = useMemo(
    () =>
      groupOrder
        .filter((status) => statusFilter.includes(status))
        .map((status) => ({
          status,
          issues: issues.filter((issue) => issue.status === status),
        })),
    [statusFilter],
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

  const toggleGroup = (status: IssueStatus) => {
    setCollapsedGroups((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status],
    );
  };

  return (
    <main className="bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <IssueListHeader
        issueCount={visibleIssueCount}
        statusFilter={statusFilter}
        onToggleStatus={toggleStatus}
      />

      <div className="flex-1 overflow-auto bg-white p-3 dark:bg-zinc-950">
        <div className="min-w-[760px] space-y-2 md:min-w-0">
          {groupedIssues.map((group) => (
            <IssueGroup
              key={group.status}
              status={group.status}
              rows={group.issues}
              collapsed={collapsedGroups.includes(group.status)}
              onToggle={() => toggleGroup(group.status)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

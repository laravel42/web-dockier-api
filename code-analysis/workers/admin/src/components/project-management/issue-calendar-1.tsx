"use client";

import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
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
  TODAY,
} from "./issue-core";
import { IssueDetailsSheet } from "./issue-details-sheet";
import type { GanttIssue, IssueStatus } from "./issue-gantt-1/types";
import {
  addDays,
  differenceInCalendarDays,
  toIsoDate,
} from "./issue-gantt-1/utils";

type CalendarView = "month" | "week";

type IssueCalendarItem = GanttIssue & {
  blocked: boolean;
  priority: IssuePriority;
  lane?: string;
  updateLabel: string;
  subIssueCount: number;
};

type CalendarDay = {
  date: Date;
  key: string;
  isToday: boolean;
  isCurrentMonth: boolean;
};

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const monthShortFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

const STATUS_STYLES: Record<
  IssueStatus,
  {
    dotClassName: string;
    rowClassName: string;
  }
> = {
  Backlog: {
    dotClassName: "bg-zinc-400 dark:bg-zinc-500",
    rowClassName:
      "border-zinc-200/90 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
  },
  Planned: {
    dotClassName: "bg-cyan-400 dark:bg-cyan-500",
    rowClassName:
      "border-cyan-200/90 bg-cyan-50/60 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/25 dark:text-cyan-100",
  },
  "In Progress": {
    dotClassName: "bg-amber-400 dark:bg-amber-500",
    rowClassName:
      "border-amber-200/90 bg-amber-50/60 text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100",
  },
  Review: {
    dotClassName: "bg-fuchsia-400 dark:bg-fuchsia-500",
    rowClassName:
      "border-fuchsia-200/90 bg-fuchsia-50/60 text-fuchsia-800 dark:border-fuchsia-900 dark:bg-fuchsia-950/25 dark:text-fuchsia-100",
  },
  Done: {
    dotClassName: "bg-emerald-400 dark:bg-emerald-500",
    rowClassName:
      "border-emerald-200/90 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100",
  },
};

const ISSUE_META: Record<
  string,
  Pick<
    IssueCalendarItem,
    "blocked" | "priority" | "lane" | "updateLabel" | "subIssueCount"
  >
> = {
  "issue-001": {
    blocked: false,
    priority: "high",
    lane: "Platform",
    updateLabel: "Updated 2h ago",
    subIssueCount: 3,
  },
  "issue-002": {
    blocked: false,
    priority: "medium",
    lane: "Planning",
    updateLabel: "Updated today",
    subIssueCount: 1,
  },
  "issue-003": {
    blocked: false,
    priority: "high",
    lane: "Views",
    updateLabel: "Updated yesterday",
    subIssueCount: 4,
  },
  "issue-004": {
    blocked: true,
    priority: null,
    lane: "Guidelines",
    updateLabel: "Blocked",
    subIssueCount: 0,
  },
  "issue-005": {
    blocked: false,
    priority: "medium",
    lane: "States",
    updateLabel: "Updated today",
    subIssueCount: 2,
  },
  "issue-006": {
    blocked: false,
    priority: "low",
    lane: "Handoffs",
    updateLabel: "Closed today",
    subIssueCount: 1,
  },
  "issue-007": {
    blocked: false,
    priority: "medium",
    lane: "Density",
    updateLabel: "Updated today",
    subIssueCount: 2,
  },
  "issue-008": {
    blocked: false,
    priority: null,
    lane: "Calendar",
    updateLabel: "No owner yet",
    subIssueCount: 0,
  },
};

const INITIAL_CALENDAR_ISSUES: IssueCalendarItem[] = INITIAL_PROJECT_ISSUES.map(
  (issue) => ({
    ...issue,
    blocked: ISSUE_META[issue.id]?.blocked ?? false,
    priority: ISSUE_META[issue.id]?.priority ?? null,
    lane: ISSUE_META[issue.id]?.lane,
    updateLabel: ISSUE_META[issue.id]?.updateLabel ?? "Updated today",
    subIssueCount: ISSUE_META[issue.id]?.subIssueCount ?? 0,
  }),
);

function startOfWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  return addDays(date, mondayOffset);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isSameDay(left: Date, right: Date) {
  return differenceInCalendarDays(left, right) === 0;
}

function getDayKey(date: Date) {
  return toIsoDate(date);
}

function getVisibleDate(issue: IssueCalendarItem) {
  if (issue.targetDate) return issue.targetDate;
  if (issue.startDate) return issue.startDate;

  return null;
}

function getShortWeekday(date: Date) {
  const label = weekdayFormatter.format(date);

  if (label === "Thu") return "Thu";
  return label;
}

function buildMonthGrid(anchorDate: Date) {
  const monthStart = startOfMonth(anchorDate);
  const monthEnd = endOfMonth(anchorDate);
  const rangeStart = startOfWeek(monthStart);
  const rangeEnd = addDays(startOfWeek(monthEnd), 6);
  const days: CalendarDay[] = [];

  for (
    let index = 0;
    index <= differenceInCalendarDays(rangeEnd, rangeStart);
    index += 1
  ) {
    const date = addDays(rangeStart, index);

    days.push({
      date,
      key: getDayKey(date),
      isToday: isSameDay(date, TODAY),
      isCurrentMonth: date.getMonth() === anchorDate.getMonth(),
    });
  }

  const weeks: CalendarDay[][] = [];

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
}

function buildWeekGrid(anchorDate: Date) {
  const start = startOfWeek(anchorDate);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);

    return {
      date,
      key: getDayKey(date),
      isToday: isSameDay(date, TODAY),
      isCurrentMonth: true,
    };
  });
}

function CalendarTopRail(props: {
  statusFilter: IssueStatus[];
  onToggleStatus: (status: IssueStatus) => void;
  onAddIssue: () => void;
}) {
  const { statusFilter, onToggleStatus, onAddIssue } = props;
  const ProjectIcon = PROJECT_ICON;

  return (
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
  );
}

function CalendarHeader(props: {
  view: CalendarView;
  anchorDate: Date;
  onChangeView: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const { view, anchorDate, onChangeView, onPrevious, onNext, onToday } = props;

  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <div className="text-foreground shrink-0 text-[18px] font-semibold">
          {view === "month"
            ? monthFormatter.format(anchorDate)
            : `${monthShortFormatter.format(addDays(startOfWeek(anchorDate), 0))} - ${monthShortFormatter.format(addDays(startOfWeek(anchorDate), 6))}, ${anchorDate.getFullYear()}`}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            onClick={onPrevious}
            aria-label="Previous range"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            onClick={onNext}
            aria-label="Next range"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {(["month", "week"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChangeView(mode)}
            className={cn(
              "hover:bg-muted rounded-md px-2.5 py-1 text-[13px] font-medium capitalize transition-colors",
              mode === view && "bg-muted text-foreground",
            )}
          >
            {mode}
          </button>
        ))}

        <button
          type="button"
          className="hover:bg-muted rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors"
          onClick={onToday}
        >
          Today
        </button>
      </div>
    </div>
  );
}

function CalendarWeekHeader(props: { days: CalendarDay[] }) {
  const { days } = props;

  return (
    <div className="grid grid-cols-7 border-b bg-zinc-50/80 dark:bg-zinc-950/60">
      {days.map((day) => (
        <div
          key={day.key}
          className="flex h-12 items-center justify-end border-r px-4 text-[13px] font-medium text-zinc-700 last:border-r-0 dark:text-zinc-300"
        >
          {getShortWeekday(day.date)}
        </div>
      ))}
    </div>
  );
}

function CalendarIssueBlock(props: {
  issue: IssueCalendarItem;
  isDragging: boolean;
  onDragStart: (issueId: string) => void;
  onDragEnd: () => void;
  onOpenIssue: (issueId: string) => void;
}) {
  const { issue, isDragging, onDragStart, onDragEnd, onOpenIssue } = props;
  const styles = STATUS_STYLES[issue.status];

  return (
    <button
      type="button"
      draggable
      onDragStart={() => onDragStart(issue.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpenIssue(issue.id)}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border px-2 text-left text-[12px] font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition",
        styles.rowClassName,
        "hover:border-zinc-300 hover:bg-white dark:hover:border-zinc-700 dark:hover:bg-zinc-950",
        isDragging && "opacity-40",
      )}
      title={issue.title}
    >
      <span
        className={cn("h-4 w-0.5 shrink-0 rounded-full", styles.dotClassName)}
      />
      <span className="min-w-0 truncate">
        <span className="text-zinc-500 dark:text-zinc-400">{issue.code}</span>
        <span className="mx-1"> </span>
        <span>{issue.title}</span>
      </span>
    </button>
  );
}

function CalendarQuickAdd(props: { onOpen: () => void }) {
  const { onOpen } = props;

  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground mt-auto flex h-7 items-center gap-1.5 px-1 text-[12px] font-medium opacity-0 transition group-hover:opacity-100"
      onClick={onOpen}
    >
      <Plus className="size-3.5" />
      Add issue
    </button>
  );
}

function CalendarDayTile(props: {
  day: CalendarDay;
  issues: IssueCalendarItem[];
  draggingIssueId: string | null;
  dropTargetDateKey: string | null;
  onOpenComposer: (date: Date) => void;
  onDragStart: (issueId: string) => void;
  onDragEnd: () => void;
  onDragOverDate: (dateKey: string) => void;
  onDropOnDate: (date: Date) => void;
  onOpenIssue: (issueId: string) => void;
}) {
  const {
    day,
    issues,
    draggingIssueId,
    dropTargetDateKey,
    onOpenComposer,
    onDragStart,
    onDragEnd,
    onDragOverDate,
    onDropOnDate,
    onOpenIssue,
  } = props;

  return (
    <div className="group flex h-full min-h-[9rem] w-full flex-col">
      <div className="hidden flex-shrink-0 justify-end px-3 py-2 text-right text-[12px] font-medium md:flex">
        <div
          className={cn(
            "flex items-center gap-1.5",
            day.isCurrentMonth ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {day.date.getDate() === 1 ? (
            <span className="text-muted-foreground">
              {monthShortFormatter.format(day.date)}
            </span>
          ) : null}

          {day.isToday ? (
            <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-full text-[11px] font-semibold">
              {day.date.getDate()}
            </span>
          ) : (
            <span>{day.date.getDate()}</span>
          )}
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          onDragOverDate(day.key);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropOnDate(day.date);
        }}
        className={cn(
          "flex h-full flex-col bg-white px-2 pb-2 dark:bg-zinc-950",
          !day.isCurrentMonth && "bg-zinc-50/50 dark:bg-zinc-950/80",
          dropTargetDateKey === day.key && "bg-zinc-50 dark:bg-zinc-900/70",
        )}
      >
        <div className="flex min-h-[5.5rem] flex-col gap-1 pt-1">
          {issues.map((issue) => (
            <CalendarIssueBlock
              key={issue.id}
              issue={issue}
              isDragging={draggingIssueId === issue.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onOpenIssue={onOpenIssue}
            />
          ))}
        </div>

        <CalendarQuickAdd onOpen={() => onOpenComposer(day.date)} />
      </div>
    </div>
  );
}

export function ProjectManagementIssueCalendar1() {
  const [issues, setIssues] = useState<IssueCalendarItem[]>(
    INITIAL_CALENDAR_ISSUES,
  );
  const [statusFilter, setStatusFilter] =
    useState<IssueStatus[]>(ISSUE_STATUS_OPTIONS);
  const [view, setView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState<Date>(TODAY);
  const [createSheetDefaults, setCreateSheetDefaults] =
    useState<CreateIssueDefaults>({
      status: "Planned",
      targetDate: getDayKey(TODAY),
    });
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [dropTargetDateKey, setDropTargetDateKey] = useState<string | null>(
    null,
  );

  const visibleIssues = useMemo(
    () => issues.filter((issue) => statusFilter.includes(issue.status)),
    [issues, statusFilter],
  );

  const monthDays = useMemo(() => buildWeekGrid(anchorDate), [anchorDate]);
  const monthWeeks = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => buildWeekGrid(anchorDate), [anchorDate]);
  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  const issuesByDay = useMemo(() => {
    const grouped = new Map<string, IssueCalendarItem[]>();

    for (const issue of visibleIssues) {
      const visibleDate = getVisibleDate(issue);

      if (!visibleDate) continue;

      const currentIssues = grouped.get(visibleDate) ?? [];

      currentIssues.push(issue);
      grouped.set(visibleDate, currentIssues);
    }

    return grouped;
  }, [visibleIssues]);

  const toggleStatus = (status: IssueStatus) => {
    setStatusFilter((currentStatuses) => {
      const nextStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter((value) => value !== status)
        : [...currentStatuses, status];

      return nextStatuses.length > 0 ? nextStatuses : currentStatuses;
    });
  };

  const moveAnchorDate = (direction: -1 | 1) => {
    setAnchorDate((currentDate) =>
      view === "month"
        ? new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + direction,
            1,
          )
        : addDays(currentDate, direction * 7),
    );
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
      status: "Planned",
      targetDate: getDayKey(TODAY),
    });
  };

  const handleDropOnDate = (date: Date) => {
    if (!draggingIssueId) return;

    const nextDate = getDayKey(date);

    setIssues((currentIssues) =>
      currentIssues.map((issue) =>
        issue.id === draggingIssueId
          ? {
              ...issue,
              targetDate: nextDate,
            }
          : issue,
      ),
    );
    setDraggingIssueId(null);
    setDropTargetDateKey(null);
  };

  const handleSaveIssue = (updatedIssue: IssueCalendarItem) => {
    setIssues((currentIssues) =>
      currentIssues.map((issue) =>
        issue.id === updatedIssue.id ? { ...issue, ...updatedIssue } : issue,
      ),
    );
  };

  return (
    <main className="bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <CalendarTopRail
        statusFilter={statusFilter}
        onToggleStatus={toggleStatus}
        onAddIssue={handleTopAddIssue}
      />

      <CalendarHeader
        view={view}
        anchorDate={anchorDate}
        onChangeView={setView}
        onPrevious={() => moveAnchorDate(-1)}
        onNext={() => moveAnchorDate(1)}
        onToday={() => setAnchorDate(TODAY)}
      />

      <div className="flex-1 overflow-auto">
        <CalendarWeekHeader days={view === "month" ? monthDays : weekDays} />

        {view === "month" ? (
          <div className="grid grid-cols-1 divide-y">
            {monthWeeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                className="grid min-h-[8.75rem] grid-cols-7 divide-x"
              >
                {week.map((day) => (
                  <CalendarDayTile
                    key={day.key}
                    day={day}
                    issues={issuesByDay.get(day.key) ?? []}
                    draggingIssueId={draggingIssueId}
                    dropTargetDateKey={dropTargetDateKey}
                    onOpenComposer={(date) =>
                      openCreateIssueSheet({
                        status: "Planned",
                        targetDate: getDayKey(date),
                      })
                    }
                    onDragStart={setDraggingIssueId}
                    onDragEnd={() => {
                      setDraggingIssueId(null);
                      setDropTargetDateKey(null);
                    }}
                    onDragOverDate={setDropTargetDateKey}
                    onDropOnDate={handleDropOnDate}
                    onOpenIssue={setSelectedIssueId}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-full grid-cols-7 divide-x">
            {weekDays.map((day) => (
              <CalendarDayTile
                key={day.key}
                day={day}
                issues={issuesByDay.get(day.key) ?? []}
                draggingIssueId={draggingIssueId}
                dropTargetDateKey={dropTargetDateKey}
                onOpenComposer={(date) =>
                  openCreateIssueSheet({
                    status: "Planned",
                    targetDate: getDayKey(date),
                  })
                }
                onDragStart={setDraggingIssueId}
                onDragEnd={() => {
                  setDraggingIssueId(null);
                  setDropTargetDateKey(null);
                }}
                onDragOverDate={setDropTargetDateKey}
                onDropOnDate={handleDropOnDate}
                onOpenIssue={setSelectedIssueId}
              />
            ))}
          </div>
        )}
      </div>

      <CreateIssueSheet
        open={isCreateSheetOpen}
        defaults={createSheetDefaults}
        onOpenChange={setIsCreateSheetOpen}
        onCreateIssue={handleCreateIssue}
      />
      <IssueDetailsSheet
        open={Boolean(selectedIssue)}
        issue={selectedIssue}
        onOpenChange={(open) => {
          if (!open) setSelectedIssueId(null);
        }}
        onSaveIssue={(updatedIssue) =>
          handleSaveIssue(updatedIssue as IssueCalendarItem)
        }
      />
    </main>
  );
}

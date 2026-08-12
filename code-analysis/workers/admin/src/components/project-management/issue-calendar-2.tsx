"use client";

import { CalendarDays, ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { CreateIssueSheet } from "./create-issue-sheet";
import {
  type CreateIssueDefaults,
  createProjectIssue,
  INITIAL_PROJECT_ISSUES,
  type ProjectIssue,
  TODAY,
} from "./issue-core";
import { IssueDetailsSheet } from "./issue-details-sheet";
import { addDays, toIsoDate } from "./issue-gantt-1/utils";

type WeekEventParticipant = {
  initials: string;
  name: string;
  avatar: string;
};

type WeekEvent = {
  id: string;
  issueId: string;
  code: string;
  title: string;
  timeRange: string;
  dayColumnClass: string;
  gridRow: string;
  cardClassName: string;
  textClassName: string;
  timeClassName: string;
  participants: WeekEventParticipant[];
  participantOverflow: number;
  collaborationLabel: string;
  variant: "compact" | "regular" | "expanded";
};

const INITIAL_ANCHOR_DATE = new Date(
  TODAY.getFullYear(),
  TODAY.getMonth(),
  TODAY.getDate(),
);
const INITIAL_SCROLL_MINUTE = 8 * 60;

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const RANGE_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
});

function startOfWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  return addDays(date, mondayOffset);
}

function buildWeekDays(anchorDate: Date) {
  const weekStart = startOfWeek(anchorDate);

  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function buildCreateDefaults(anchorDate: Date): CreateIssueDefaults {
  const weekStart = startOfWeek(anchorDate);

  return {
    status: "Planned",
    startDate: toIsoDate(weekStart),
    targetDate: toIsoDate(addDays(weekStart, 2)),
  };
}

function getEventColumn(dayColumnClass: string) {
  const match = dayColumnClass.match(/sm:col-start-(\d+)/);

  return match ? Number(match[1]) : 1;
}

function getWeekEventVariant(gridSpan: number) {
  if (gridSpan <= 18) return "compact";
  if (gridSpan < 42) return "regular";
  return "expanded";
}

function buildWeekEvents(
  issues: ProjectIssue[],
  weekDays: Date[],
  eventColumnOverrides: Record<string, number>,
): WeekEvent[] {
  const issueMap = new Map(issues.map((issue) => [issue.id, issue]));
  const participantsByIssueId: Record<
    string,
    {
      participants: WeekEventParticipant[];
      participantOverflow: number;
      collaborationLabel: string;
    }
  > = {
    "issue-001": {
      participants: [
        {
          initials: "NO",
          name: "Nina Oliver",
          avatar: "/avatars/avatar-5.png",
        },
        {
          initials: "LM",
          name: "Lena Moss",
          avatar: "/avatars/avatar-3.png",
        },
        {
          initials: "AR",
          name: "Ava Reed",
          avatar: "/avatars/avatar-1.png",
        },
      ],
      participantOverflow: 4,
      collaborationLabel: "Platform sync",
    },
    "issue-002": {
      participants: [
        {
          initials: "NO",
          name: "Nina Oliver",
          avatar: "/avatars/avatar-5.png",
        },
        {
          initials: "KY",
          name: "Kai Young",
          avatar: "/avatars/avatar-black-2.png",
        },
      ],
      participantOverflow: 0,
      collaborationLabel: "Planning review",
    },
    "issue-003": {
      participants: [
        {
          initials: "KY",
          name: "Kai Young",
          avatar: "/avatars/avatar-black-2.png",
        },
        {
          initials: "AR",
          name: "Ava Reed",
          avatar: "/avatars/avatar-1.png",
        },
        {
          initials: "NO",
          name: "Nina Oliver",
          avatar: "/avatars/avatar-5.png",
        },
      ],
      participantOverflow: 2,
      collaborationLabel: "Views review",
    },
    "issue-004": {
      participants: [],
      participantOverflow: 0,
      collaborationLabel: "Waiting on docs",
    },
    "issue-005": {
      participants: [
        {
          initials: "LM",
          name: "Lena Moss",
          avatar: "/avatars/avatar-3.png",
        },
        {
          initials: "AR",
          name: "Ava Reed",
          avatar: "/avatars/avatar-1.png",
        },
      ],
      participantOverflow: 1,
      collaborationLabel: "State review",
    },
    "issue-006": {
      participants: [
        {
          initials: "LM",
          name: "Lena Moss",
          avatar: "/avatars/avatar-3.png",
        },
        {
          initials: "NO",
          name: "Nina Oliver",
          avatar: "/avatars/avatar-5.png",
        },
      ],
      participantOverflow: 0,
      collaborationLabel: "Handoff notes",
    },
    "issue-007": {
      participants: [
        {
          initials: "AR",
          name: "Ava Reed",
          avatar: "/avatars/avatar-1.png",
        },
        {
          initials: "KY",
          name: "Kai Young",
          avatar: "/avatars/avatar-black-2.png",
        },
      ],
      participantOverflow: 3,
      collaborationLabel: "Density QA",
    },
    "issue-008": {
      participants: [
        {
          initials: "LM",
          name: "Lena Moss",
          avatar: "/avatars/avatar-3.png",
        },
      ],
      participantOverflow: 0,
      collaborationLabel: "Prep follow-up",
    },
  };
  const toneByStatus = {
    Backlog: {
      cardClassName:
        "border border-zinc-200/90 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900",
      textClassName: "text-zinc-700 dark:text-zinc-300",
      timeClassName:
        "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-300",
    },
    Planned: {
      cardClassName:
        "border border-cyan-200/90 bg-cyan-50 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950 dark:hover:bg-cyan-900/90",
      textClassName: "text-cyan-800 dark:text-cyan-100",
      timeClassName:
        "text-cyan-600 group-hover:text-cyan-800 dark:text-cyan-300 dark:group-hover:text-cyan-100",
    },
    "In Progress": {
      cardClassName:
        "border border-amber-200/90 bg-amber-50 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:hover:bg-amber-900/90",
      textClassName: "text-amber-800 dark:text-amber-100",
      timeClassName:
        "text-amber-600 group-hover:text-amber-800 dark:text-amber-300 dark:group-hover:text-amber-100",
    },
    Review: {
      cardClassName:
        "border border-fuchsia-200/90 bg-fuchsia-50 hover:bg-fuchsia-100 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:hover:bg-fuchsia-900/90",
      textClassName: "text-fuchsia-800 dark:text-fuchsia-100",
      timeClassName:
        "text-fuchsia-600 group-hover:text-fuchsia-800 dark:text-fuchsia-300 dark:group-hover:text-fuchsia-100",
    },
    Done: {
      cardClassName:
        "border border-emerald-200/90 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:hover:bg-emerald-900/90",
      textClassName: "text-emerald-800 dark:text-emerald-100",
      timeClassName:
        "text-emerald-600 group-hover:text-emerald-800 dark:text-emerald-300 dark:group-hover:text-emerald-100",
    },
  } as const;

  const layouts: ReadonlyArray<{
    id: string;
    issueId: string;
    timeRange: string;
    dayColumnClass: string;
    gridRow: string;
  }> = [
    {
      id: "event-issue-006-early",
      issueId: "issue-006",
      timeRange: "1:00 - 2:30 AM",
      dayColumnClass: "sm:col-start-1",
      gridRow: "14 / span 36",
    },
    {
      id: "event-issue-008-early",
      issueId: "issue-008",
      timeRange: "3:15 - 4:15 AM",
      dayColumnClass: "sm:col-start-2",
      gridRow: "41 / span 12",
    },
    {
      id: "event-issue-003-early",
      issueId: "issue-003",
      timeRange: "1:45 - 3:45 AM",
      dayColumnClass: "sm:col-start-4",
      gridRow: "23 / span 48",
    },
    {
      id: "event-issue-001-early",
      issueId: "issue-001",
      timeRange: "4:30 - 5:30 AM",
      dayColumnClass: "sm:col-start-6",
      gridRow: "56 / span 24",
    },
    {
      id: "event-issue-002",
      issueId: "issue-002",
      timeRange: "9:00 - 9:30 AM",
      dayColumnClass: "sm:col-start-2",
      gridRow: "110 / span 12",
    },
    {
      id: "event-issue-005",
      issueId: "issue-005",
      timeRange: "10:00 - 11:30 AM",
      dayColumnClass: "sm:col-start-3",
      gridRow: "122 / span 36",
    },
    {
      id: "event-issue-001",
      issueId: "issue-001",
      timeRange: "9:00 - 10:30 AM",
      dayColumnClass: "sm:col-start-4",
      gridRow: "110 / span 36",
    },
    {
      id: "event-issue-003",
      issueId: "issue-003",
      timeRange: "11:30 AM - 1:00 PM",
      dayColumnClass: "sm:col-start-4",
      gridRow: "158 / span 36",
    },
    {
      id: "event-issue-007",
      issueId: "issue-007",
      timeRange: "9:30 - 10:00 AM",
      dayColumnClass: "sm:col-start-5",
      gridRow: "116 / span 12",
    },
    {
      id: "event-issue-004",
      issueId: "issue-004",
      timeRange: "10:00 - 11:15 AM",
      dayColumnClass: "sm:col-start-6",
      gridRow: "122 / span 30",
    },
  ];

  const weekDayKeys = weekDays.map((day) => toIsoDate(day));
  const layoutIssueIds = new Set(layouts.map((layout) => layout.issueId));
  const additionalLayouts = issues.flatMap((issue) => {
    if (layoutIssueIds.has(issue.id)) return [];

    const scheduledDateKey = issue.targetDate ?? issue.startDate;

    if (!scheduledDateKey) return [];

    const dayIndex = weekDayKeys.indexOf(scheduledDateKey);

    if (dayIndex === -1) return [];

    return [
      {
        id: `event-${issue.id}`,
        issueId: issue.id,
        timeRange: "Created issue",
        dayColumnClass: `sm:col-start-${eventColumnOverrides[`event-${issue.id}`] ?? dayIndex + 1}`,
        gridRow: `${110 + dayIndex * 18} / span 12`,
      },
    ];
  });

  return [...layouts, ...additionalLayouts].flatMap((layout) => {
    const issue = issueMap.get(layout.issueId);

    if (!issue) return [];

    const participantMeta = participantsByIssueId[layout.issueId] ?? {
      participants: [],
      participantOverflow: 0,
      collaborationLabel: "",
    };
    const gridSpanMatch = layout.gridRow.match(/span (\d+)/);
    const gridSpan = gridSpanMatch ? Number(gridSpanMatch[1]) : 0;
    const variant = getWeekEventVariant(gridSpan);
    const tone =
      layout.id === "event-issue-005"
        ? {
            cardClassName:
              "border border-blue-200/90 bg-blue-50 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:hover:bg-blue-900/90",
            textClassName: "text-blue-700 dark:text-blue-300",
            timeClassName:
              "text-blue-500 group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300",
          }
        : layout.issueId === "issue-001"
          ? {
              cardClassName:
                "border border-pink-200/90 bg-pink-50 hover:bg-pink-100 dark:border-pink-900 dark:bg-pink-950 dark:hover:bg-pink-900/90",
              textClassName: "text-pink-700 dark:text-pink-300",
              timeClassName:
                "text-pink-500 group-hover:text-pink-700 dark:text-pink-400 dark:group-hover:text-pink-300",
            }
          : toneByStatus[issue.status];

    return [
      {
        id: layout.id,
        issueId: layout.issueId,
        code: issue.code,
        title: issue.title,
        timeRange: layout.timeRange,
        dayColumnClass: `sm:col-start-${eventColumnOverrides[layout.id] ?? getEventColumn(layout.dayColumnClass)}`,
        gridRow: layout.gridRow,
        cardClassName: tone.cardClassName,
        textClassName: tone.textClassName,
        timeClassName: tone.timeClassName,
        participants: participantMeta.participants,
        participantOverflow: participantMeta.participantOverflow,
        collaborationLabel: participantMeta.collaborationLabel,
        variant,
      },
    ];
  });
}

export function ProjectManagementIssueCalendar2() {
  const [anchorDate, setAnchorDate] = useState(INITIAL_ANCHOR_DATE);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<CreateIssueDefaults>(
    buildCreateDefaults(INITIAL_ANCHOR_DATE),
  );
  const [issues, setIssues] = useState(INITIAL_PROJECT_ISSUES);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<number | null>(null);
  const [eventColumnOverrides, setEventColumnOverrides] = useState<
    Record<string, number>
  >({});

  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerNavRef = useRef<HTMLDivElement | null>(null);
  const containerOffsetRef = useRef<HTMLDivElement | null>(null);

  const weekDays = useMemo(() => buildWeekDays(anchorDate), [anchorDate]);
  const weekEvents = useMemo(
    () => buildWeekEvents(issues, weekDays, eventColumnOverrides),
    [eventColumnOverrides, issues, weekDays],
  );
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  useEffect(() => {
    const container = containerRef.current;
    const containerNav = containerNavRef.current;
    const containerOffset = containerOffsetRef.current;

    if (!container || !containerNav || !containerOffset) return;

    const currentMinute = INITIAL_SCROLL_MINUTE;
    container.scrollTop =
      ((container.scrollHeight -
        containerNav.offsetHeight -
        containerOffset.offsetHeight) *
        currentMinute) /
      1440;
  }, []);

  const openCreateSheet = () => {
    setCreateDefaults(buildCreateDefaults(anchorDate));
    setIsCreateSheetOpen(true);
  };

  const getGridColumnFromClientX = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const columnWidth = rect.width / 7;
    const rawColumn = Math.floor((clientX - rect.left) / columnWidth) + 1;

    return Math.min(7, Math.max(1, rawColumn));
  };

  const handleDropOnCalendarGrid = (event: DragEvent<HTMLOListElement>) => {
    event.preventDefault();

    if (!draggingEventId) return;

    const targetColumn = getGridColumnFromClientX(
      event.clientX,
      event.currentTarget,
    );
    const draggedEvent = weekEvents.find((item) => item.id === draggingEventId);
    const targetDate = weekDays[targetColumn - 1];

    if (!draggedEvent || !targetDate) return;

    const targetDateKey = toIsoDate(targetDate);

    setEventColumnOverrides((currentOverrides) => ({
      ...currentOverrides,
      [draggingEventId]: targetColumn,
    }));
    setIssues((currentIssues) =>
      currentIssues.map((issue) =>
        issue.id === draggedEvent.issueId
          ? {
              ...issue,
              targetDate: targetDateKey,
            }
          : issue,
      ),
    );
    setDraggingEventId(null);
    setDropTargetColumn(null);
  };

  const handleSaveIssue = (updatedIssue: ProjectIssue) => {
    setIssues((currentIssues) =>
      currentIssues.map((issue) =>
        issue.id === updatedIssue.id ? { ...issue, ...updatedIssue } : issue,
      ),
    );
  };

  return (
    <main className="bg-background text-foreground flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-full flex-col">
        <header className="border-border flex flex-none items-center justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
          <h1 className="text-foreground text-lg font-semibold sm:text-base">
            <time dateTime={toIsoDate(anchorDate)}>
              {MONTH_FORMATTER.format(anchorDate)}
            </time>
          </h1>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 xl:flex">
              <button
                type="button"
                onClick={() => setAnchorDate(INITIAL_ANCHOR_DATE)}
                className="border-input bg-background text-foreground hover:bg-muted flex h-9 items-center rounded-md border px-3.5 text-sm font-semibold shadow-xs"
              >
                Today
              </button>
              <div className="border-input bg-background text-foreground flex h-9 overflow-hidden rounded-md border text-sm font-semibold shadow-xs">
                <button
                  type="button"
                  className="hover:bg-muted flex items-center gap-2 px-3.5"
                >
                  Last 7 days
                  <ChevronDown
                    className="-mr-1 size-4 text-gray-400"
                    aria-hidden="true"
                  />
                </button>
                <div className="border-border flex items-center gap-2 border-l px-3.5">
                  <CalendarDays className="size-4 text-gray-500 dark:text-zinc-400" />
                  {RANGE_DAY_FORMATTER.format(weekStart)} -{" "}
                  {RANGE_DAY_FORMATTER.format(weekEnd)}
                </div>
              </div>
            </div>

            <div className="hidden md:ml-4 md:flex md:items-center">
              <button
                type="button"
                onClick={openCreateSheet}
                className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-semibold shadow-xs hover:opacity-90"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add issue
              </button>
            </div>

            <button
              type="button"
              className="-mx-2 ml-2 flex items-center rounded-full border border-transparent p-2 text-gray-400 hover:text-gray-500 md:hidden dark:text-zinc-500"
              onClick={openCreateSheet}
            >
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          ref={containerRef}
          className="bg-background isolate flex flex-auto flex-col overflow-auto"
        >
          <div
            style={{ width: "165%" }}
            className="flex min-w-[980px] flex-none flex-col sm:max-w-none sm:min-w-0 md:max-w-full"
          >
            <div
              ref={containerNavRef}
              className="bg-background border-border sticky top-0 z-30 flex-none border-b"
            >
              <div className="bg-background text-muted-foreground grid grid-cols-7 text-sm/6 sm:hidden">
                {weekDays.map((day) => {
                  const isSelected =
                    day.getFullYear() === anchorDate.getFullYear() &&
                    day.getMonth() === anchorDate.getMonth() &&
                    day.getDate() === anchorDate.getDate();

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      className="flex flex-col items-center pt-2 pb-3"
                    >
                      {day.toLocaleDateString("en-US", {
                        weekday: "narrow",
                      })}
                      <span
                        className={`mt-1 flex size-8 items-center justify-center font-semibold ${
                          isSelected
                            ? "bg-primary text-primary-foreground rounded-full"
                            : "text-foreground"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="border-border bg-background text-muted-foreground hidden grid-cols-7 divide-x sm:grid">
                <div className="col-end-1 w-14" />
                {weekDays.map((day) => {
                  const isSelected =
                    day.getFullYear() === anchorDate.getFullYear() &&
                    day.getMonth() === anchorDate.getMonth() &&
                    day.getDate() === anchorDate.getDate();

                  return (
                    <div
                      key={day.toISOString()}
                      className="flex items-center justify-center py-3"
                    >
                      <span
                        className={
                          isSelected ? "flex items-baseline" : undefined
                        }
                      >
                        {day.toLocaleDateString("en-US", { weekday: "short" })}{" "}
                        <span
                          className={
                            isSelected
                              ? "bg-primary text-primary-foreground ml-1.5 flex size-8 items-center justify-center rounded-full font-semibold"
                              : "text-foreground items-center justify-center font-semibold"
                          }
                        >
                          {day.getDate()}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-auto">
              <div className="bg-background border-border sticky left-0 z-10 w-14 flex-none border-r" />

              <div className="grid flex-auto grid-cols-1 grid-rows-1">
                <div
                  className="divide-border col-start-1 col-end-2 row-start-1 grid divide-y"
                  style={{ gridTemplateRows: "repeat(24, minmax(7rem, 1fr))" }}
                >
                  <div ref={containerOffsetRef} className="row-end-1 h-7" />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour}>
                      <div className="text-muted-foreground sticky left-0 z-20 -mt-2.5 -ml-14 w-14 pr-2 text-right text-xs/5">
                        {new Intl.DateTimeFormat("en-US", {
                          hour: "numeric",
                        }).format(new Date(2022, 0, 12, hour))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="divide-border border-border col-start-1 col-end-2 row-start-1 grid grid-cols-7 grid-rows-1 divide-x border-r">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "row-span-full transition-colors",
                        dropTargetColumn === index + 1 && "bg-muted/60",
                      )}
                      style={{ gridColumnStart: index + 1 }}
                    />
                  ))}
                  <div className="relative col-start-7 row-span-full">
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-0 top-7 bottom-0 transition-colors",
                        dropTargetColumn === 7 && "brightness-125",
                      )}
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--muted) 38%, transparent)",
                        backgroundImage:
                          "linear-gradient(to bottom, transparent calc(100% - 1px), color-mix(in oklch, var(--border) 72%, transparent) calc(100% - 1px)), repeating-linear-gradient(-32deg, color-mix(in oklch, var(--muted-foreground) 10%, transparent) 0 2px, transparent 2px 12px)",
                        backgroundRepeat: "repeat-y, repeat",
                        backgroundSize: "100% 7rem, auto",
                      }}
                    />
                  </div>
                </div>

                <div
                  className="pointer-events-none col-start-1 col-end-2 row-start-1"
                  style={{
                    backgroundImage:
                      "linear-gradient(to bottom, transparent calc(100% - 1px), color-mix(in oklch, var(--border) 72%, transparent) calc(100% - 1px))",
                    backgroundPosition: "0 1.75rem",
                    backgroundRepeat: "repeat-y",
                    backgroundSize: "100% 7rem",
                  }}
                />

                <ol
                  className="col-start-1 col-end-2 row-start-1 grid grid-cols-7"
                  onDragOver={(event) => {
                    if (!draggingEventId) return;

                    event.preventDefault();
                    setDropTargetColumn(
                      getGridColumnFromClientX(
                        event.clientX,
                        event.currentTarget,
                      ),
                    );
                  }}
                  onDrop={handleDropOnCalendarGrid}
                  style={{
                    gridTemplateRows:
                      "1.75rem repeat(288, minmax(0, 1fr)) auto",
                  }}
                >
                  {weekEvents.map((event) => {
                    const column = getEventColumn(event.dayColumnClass);

                    return (
                      <li
                        key={event.id}
                        className={`relative mt-px flex ${event.dayColumnClass}`}
                        style={{ gridRow: event.gridRow, gridColumn: column }}
                      >
                        <a
                          href="#"
                          draggable
                          className={cn(
                            "group absolute inset-1 flex cursor-grab flex-col overflow-hidden rounded-lg px-2.5 py-2 text-xs/5 transition-opacity active:cursor-grabbing sm:px-3 sm:py-2.5",
                            event.cardClassName,
                            draggingEventId === event.id && "opacity-45",
                          )}
                          onDragStart={() => {
                            setDraggingEventId(event.id);
                            setDropTargetColumn(column);
                          }}
                          onDragEnd={() => {
                            setDraggingEventId(null);
                            setDropTargetColumn(null);
                          }}
                          onClick={(clickedEvent) => {
                            clickedEvent.preventDefault();
                            setSelectedIssueId(event.issueId);
                          }}
                        >
                          <p
                            className={cn(
                              "min-w-0 font-semibold",
                              event.variant === "compact"
                                ? "text-[12px] leading-5"
                                : "text-[13px] leading-6",
                              event.textClassName,
                            )}
                            style={{
                              display: "-webkit-box",
                              WebkitBoxOrient: "vertical",
                              WebkitLineClamp:
                                event.variant === "compact"
                                  ? 2
                                  : event.variant === "regular"
                                    ? 3
                                    : 4,
                              overflow: "hidden",
                            }}
                          >
                            <span className="mr-1.5 font-medium opacity-70">
                              {event.code}
                            </span>
                            {event.title}
                          </p>
                          <p
                            className={`mt-1 text-[11px] font-medium ${event.timeClassName}`}
                          >
                            {event.timeRange}
                          </p>

                          {event.variant === "expanded" ? (
                            <div className="mt-auto flex min-w-0 items-end gap-2 pt-3">
                              <div className="flex shrink-0 items-center">
                                {event.participants.length > 0 ? (
                                  <>
                                    <div className="flex items-center">
                                      {event.participants
                                        .slice(0, 3)
                                        .map((participant, index) => (
                                          <Avatar
                                            key={`${event.id}-${participant.initials}`}
                                            className="-ml-1 size-6 border border-white shadow-sm first:ml-0 dark:border-zinc-900"
                                            style={{ zIndex: 3 - index }}
                                          >
                                            <AvatarImage
                                              src={participant.avatar}
                                              alt={participant.name}
                                            />
                                            <AvatarFallback className="bg-slate-200 text-[9px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                                              {participant.initials}
                                            </AvatarFallback>
                                          </Avatar>
                                        ))}
                                    </div>

                                    {event.participantOverflow > 0 ? (
                                      <span
                                        className={`ml-2 shrink-0 text-[11px] font-medium ${event.timeClassName}`}
                                      >
                                        +{event.participantOverflow}
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span
                                    className={`inline-flex items-center rounded-full border border-white/70 bg-white/70 px-2 py-1 text-[10px] font-medium dark:border-zinc-800/80 dark:bg-zinc-900/70 ${event.timeClassName}`}
                                  >
                                    {event.collaborationLabel
                                      ? `No owner · ${event.collaborationLabel}`
                                      : "No owner"}
                                  </span>
                                )}
                              </div>

                              {event.participants.length > 0 ? (
                                <span
                                  className={`min-w-0 flex-1 truncate text-right text-[11px] font-medium ${event.timeClassName}`}
                                >
                                  {event.collaborationLabel}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreateIssueSheet
        open={isCreateSheetOpen}
        defaults={createDefaults}
        onOpenChange={setIsCreateSheetOpen}
        onCreateIssue={(values) => {
          setIssues((currentIssues) => [
            ...currentIssues,
            createProjectIssue(values, currentIssues.length),
          ]);
        }}
      />
      <IssueDetailsSheet
        open={Boolean(selectedIssue)}
        issue={selectedIssue}
        onOpenChange={(open) => {
          if (!open) setSelectedIssueId(null);
        }}
        onSaveIssue={handleSaveIssue}
      />
    </main>
  );
}

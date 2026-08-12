import { ArrowRight, Plus } from "lucide-react";
import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
  type UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  BLOCK_HEIGHT,
  SIDEBAR_WIDTH,
  TIMELINE_HEADER_HEIGHT,
  TODAY,
  VIEW_CONFIG,
} from "./data";
import { IssueGanttSidebar } from "./sidebar";
import type { GanttIssue, TimelineRange, TimelineView } from "./types";
import {
  addDays,
  buildInitialRange,
  buildTimeline,
  clamp,
  differenceInCalendarDays,
  ensureRangeContainsIssues,
  extendRange,
  formatHeaderWeekday,
  formatWeekHeaderWeekday,
  getIssueBarClassName,
  parseLocalDate,
  toIsoDate,
} from "./utils";

const hoverDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

type DragMode = "move" | "resize-start" | "resize-end";

type DragState = {
  issueId: string;
  mode: DragMode;
  pointerStartX: number;
  originalStartDate?: string;
  originalTargetDate?: string;
};

type HoverPlacement = {
  issueId: string | null;
  x: number;
};

type IssueGanttTimelineProps = {
  issues: GanttIssue[];
  view: TimelineView;
  embedded?: boolean;
  highlightToday: boolean;
  scrollToTodayRequest: number;
  activeIssueId: string | null;
  hoveredIssueId: string | null;
  quickAdd: ReactNode;
  onActiveIssueChange: (issueId: string | null) => void;
  onHoveredIssueChange: (issueId: string | null) => void;
  onIssuesChange: Dispatch<SetStateAction<GanttIssue[]>>;
};

export function IssueGanttTimeline(props: IssueGanttTimelineProps) {
  const {
    issues,
    view,
    embedded = false,
    highlightToday,
    scrollToTodayRequest,
    activeIssueId,
    hoveredIssueId,
    quickAdd,
    onActiveIssueChange,
    onHoveredIssueChange,
    onIssuesChange,
  } = props;
  const [range, setRange] = useState<TimelineRange>(() =>
    buildInitialRange(view, issues),
  );
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [hoverPlacement, setHoverPlacement] = useState<HoverPlacement>({
    issueId: null,
    x: 0,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const pendingLeftShiftRef = useRef(0);
  const isExtendingRef = useRef(false);
  const didInitialScrollRef = useRef(false);

  const timeline = useMemo(() => buildTimeline(range, view), [range, view]);

  const positionedIssues = useMemo(
    () =>
      issues.map((issue, index) => {
        if (!issue.startDate || !issue.targetDate) {
          return {
            issue,
            index,
            left: 0,
            width: 0,
            visible: false,
          };
        }

        const startDate = parseLocalDate(issue.startDate);
        const targetDate = parseLocalDate(issue.targetDate);

        return {
          issue,
          index,
          left:
            differenceInCalendarDays(startDate, range.start) *
            timeline.dayWidth,
          width:
            (Math.abs(differenceInCalendarDays(targetDate, startDate)) + 1) *
            timeline.dayWidth,
          visible: true,
        };
      }),
    [issues, range.start, timeline.dayWidth],
  );

  const sidebarWidth = embedded
    ? clientWidth >= 1280
      ? 340
      : 300
    : SIDEBAR_WIDTH;

  const scrollToToday = () => {
    const container = scrollContainerRef.current;

    if (!container) return;

    const todayIndex = differenceInCalendarDays(TODAY, range.start);
    const todayOffset = todayIndex * timeline.dayWidth;
    const sidebarOffset = isSidebarPinned ? 0 : sidebarWidth;
    const viewportWidth =
      container.clientWidth - (isSidebarPinned ? sidebarWidth : 0);

    container.scrollLeft = Math.max(
      0,
      sidebarOffset + todayOffset - viewportWidth / 2,
    );
  };

  const scrollToFirstScheduledIssue = () => {
    const container = scrollContainerRef.current;

    if (!container) return;

    const firstStartDate = issues
      .map((issue) => issue.startDate)
      .filter(Boolean)
      .map((value) => parseLocalDate(value!))
      .sort((left, right) => left.getTime() - right.getTime())[0];

    if (!firstStartDate) return;

    const firstOffset =
      differenceInCalendarDays(firstStartDate, range.start) * timeline.dayWidth;
    const sidebarOffset = isSidebarPinned ? 0 : sidebarWidth;

    container.scrollLeft = Math.max(0, sidebarOffset + firstOffset - 16);
  };

  useEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToTodayRequest]);

  useEffect(() => {
    if (didInitialScrollRef.current || clientWidth === 0) return;

    didInitialScrollRef.current = true;
    if (embedded) {
      scrollToFirstScheduledIssue();
    } else {
      scrollToToday();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientWidth, isSidebarPinned, sidebarWidth, embedded]);

  useEffect(() => {
    const ensured = ensureRangeContainsIssues(range, view, issues);
    const rangeChanged =
      ensured.range.start.getTime() !== range.start.getTime() ||
      ensured.range.end.getTime() !== range.end.getTime();

    if (!rangeChanged) return;

    if (ensured.addedLeftDays > 0) {
      pendingLeftShiftRef.current = ensured.addedLeftDays * timeline.dayWidth;
    }

    setRange(ensured.range);
  }, [issues, range, timeline.dayWidth, view]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) return;

    if (pendingLeftShiftRef.current > 0) {
      container.scrollLeft += pendingLeftShiftRef.current;
      pendingLeftShiftRef.current = 0;
    }

    isExtendingRef.current = false;
  }, [timeline.width]);

  const updateIssueDate = useCallback(
    (issueId: string, transform: (issue: GanttIssue) => GanttIssue) => {
      onIssuesChange((currentIssues) =>
        currentIssues.map((issue) =>
          issue.id === issueId ? transform(issue) : issue,
        ),
      );
    },
    [onIssuesChange],
  );

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    issue: GanttIssue,
    mode: DragMode,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!issue.startDate || !issue.targetDate) return;

    onActiveIssueChange(issue.id);
    dragStateRef.current = {
      issueId: issue.id,
      mode,
      pointerStartX: event.clientX,
      originalStartDate: issue.startDate,
      originalTargetDate: issue.targetDate,
    };
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) return;

      const originalStartDate = dragState.originalStartDate
        ? parseLocalDate(dragState.originalStartDate)
        : undefined;
      const originalTargetDate = dragState.originalTargetDate
        ? parseLocalDate(dragState.originalTargetDate)
        : undefined;

      if (!originalStartDate || !originalTargetDate) return;

      const deltaDays = Math.round(
        (event.clientX - dragState.pointerStartX) / timeline.dayWidth,
      );

      updateIssueDate(dragState.issueId, (issue) => {
        if (dragState.mode === "move") {
          return {
            ...issue,
            startDate: toIsoDate(addDays(originalStartDate, deltaDays)),
            targetDate: toIsoDate(addDays(originalTargetDate, deltaDays)),
          };
        }

        if (dragState.mode === "resize-start") {
          const maxStartDate = addDays(originalTargetDate, -1);
          const nextStartDate = addDays(originalStartDate, deltaDays);

          return {
            ...issue,
            startDate: toIsoDate(
              nextStartDate > maxStartDate ? maxStartDate : nextStartDate,
            ),
          };
        }

        const minTargetDate = addDays(originalStartDate, 1);
        const nextTargetDate = addDays(originalTargetDate, deltaDays);

        return {
          ...issue,
          targetDate: toIsoDate(
            nextTargetDate < minTargetDate ? minTargetDate : nextTargetDate,
          ),
        };
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [timeline.dayWidth, updateIssueDate]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) return;

    const syncViewportMetrics = () => {
      setViewportHeight(container.clientHeight);
      setClientWidth(container.clientWidth);
      setScrollLeft(container.scrollLeft);
      setIsSidebarPinned(window.matchMedia("(min-width: 640px)").matches);
    };

    syncViewportMetrics();

    const observer = new ResizeObserver(() => {
      syncViewportMetrics();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const selectIssue = (issue: GanttIssue) => {
    onActiveIssueChange(issue.id);

    if (!issue.startDate) return;

    const container = scrollContainerRef.current;

    if (!container) return;

    const startOffset =
      differenceInCalendarDays(parseLocalDate(issue.startDate), range.start) *
      timeline.dayWidth;

    container.scrollLeft = Math.max(0, startOffset - 48);
  };

  const extendTimelineWindow = (direction: "left" | "right") => {
    if (isExtendingRef.current) return;

    const extension = extendRange(range, view, direction);

    if (direction === "left") {
      pendingLeftShiftRef.current =
        extension.addedDays * VIEW_CONFIG[view].dayWidth;
    }

    isExtendingRef.current = true;
    setRange({
      start: extension.start,
      end: extension.end,
    });
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { clientWidth, scrollLeft, scrollWidth } = event.currentTarget;
    setClientWidth(clientWidth);
    setScrollLeft(scrollLeft);

    if (scrollLeft < clientWidth) {
      extendTimelineWindow("left");
      return;
    }

    if (scrollWidth - (scrollLeft + clientWidth) < clientWidth) {
      extendTimelineWindow("right");
    }
  };

  const gridHeight = Math.max(issues.length * BLOCK_HEIGHT, BLOCK_HEIGHT);
  const chartBodyHeight = Math.max(
    gridHeight,
    Math.max(0, viewportHeight - TIMELINE_HEADER_HEIGHT),
  );
  const sidebarOffset = isSidebarPinned ? 0 : sidebarWidth;
  const timelineViewportWidth = Math.max(
    0,
    clientWidth - (isSidebarPinned ? sidebarWidth : 0),
  );
  const timelineViewportStart = Math.max(0, scrollLeft - sidebarOffset);
  const timelineViewportEnd = timelineViewportStart + timelineViewportWidth;
  const gridBackgroundImage =
    view === "week"
      ? "linear-gradient(to right, color-mix(in oklab, var(--border) 85%, transparent) 1px, transparent 1px)"
      : "none";
  const gridBackgroundSize =
    view === "week" ? `${timeline.dayWidth}px 100%` : "auto";

  const placeUnscheduledIssue = (issue: GanttIssue, timelineX: number) => {
    const dayIndex = clamp(
      Math.floor(timelineX / timeline.dayWidth),
      0,
      Math.max(0, timeline.days.length - 1),
    );
    const startDate = addDays(range.start, dayIndex);
    const targetDate = addDays(startDate, view === "quarter" ? 7 : 1);

    updateIssueDate(issue.id, (currentIssue) => ({
      ...currentIssue,
      startDate: toIsoDate(startDate),
      targetDate: toIsoDate(targetDate),
    }));
  };

  const updateHoverPlacement = (
    event: ReactMouseEvent<HTMLDivElement>,
    issueId: string,
  ) => {
    const nextX = clamp(
      event.clientX - event.currentTarget.getBoundingClientRect().left,
      0,
      timeline.width,
    );

    setHoverPlacement({
      issueId,
      x: nextX,
    });
  };

  const hoverDayIndex = clamp(
    Math.floor(hoverPlacement.x / timeline.dayWidth),
    0,
    Math.max(0, timeline.days.length - 1),
  );
  const hoverStartDate = timeline.days[hoverDayIndex]?.date;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div className="flex min-h-full w-max min-w-full">
          <IssueGanttSidebar
            issues={issues}
            sidebarWidth={sidebarWidth}
            hoveredIssueId={hoveredIssueId}
            onSelectIssue={selectIssue}
            onHoveredIssueChange={onHoveredIssueChange}
          />

          <section className="relative">
            <div
              className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur-sm"
              style={{
                width: `${timeline.width}px`,
                height: `${TIMELINE_HEADER_HEIGHT}px`,
              }}
            >
              {view === "week" ? (
                <div className="flex h-full">
                  {timeline.weekBlocks.map((weekBlock) => (
                    <div
                      key={weekBlock.key}
                      className="border-border/60 flex shrink-0 flex-col border-r"
                      style={{
                        width: `${weekBlock.length * timeline.dayWidth}px`,
                      }}
                    >
                      <div className="border-border/60 flex h-7 items-center justify-between border-b px-3">
                        <div className="text-muted-foreground text-[13px] font-normal whitespace-nowrap">
                          {weekBlock.title}
                        </div>
                        <div className="text-muted-foreground/80 text-[10px] font-medium whitespace-nowrap">
                          {weekBlock.label}
                        </div>
                      </div>

                      <div className="flex h-5">
                        {weekBlock.days.map((day) => (
                          <div
                            key={day.key}
                            className={cn(
                              "border-border/60 flex shrink-0 items-center justify-between border-r px-2 text-[11px]",
                              day.isWeekend && "bg-muted/35",
                              day.isToday && highlightToday && "bg-primary/5",
                            )}
                            style={{ width: `${timeline.dayWidth}px` }}
                          >
                            <span className="text-muted-foreground font-medium">
                              {formatWeekHeaderWeekday(day.date)}
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                day.isToday &&
                                  highlightToday &&
                                  "border-primary/12 bg-primary/10 text-foreground rounded-sm border px-1",
                              )}
                            >
                              {day.date.getDate()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : view === "month" ? (
                <div className="flex h-full flex-col">
                  <div className="flex h-7">
                    {timeline.monthBlocks.map((monthBlock) => (
                      <div
                        key={monthBlock.key}
                        className="border-border/60 flex shrink-0 items-center border-r px-3"
                        style={{
                          width: `${monthBlock.length * timeline.dayWidth}px`,
                        }}
                      >
                        <div className="text-muted-foreground text-[13px] font-normal whitespace-nowrap">
                          {monthBlock.title}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-border/60 relative flex h-5 border-t">
                    {timeline.monthWeekBlocks.map((weekBlock) =>
                      weekBlock.isCurrentWeek && highlightToday ? (
                        <div
                          key={`${weekBlock.key}-header-overlay`}
                          className="border-primary/10 bg-primary/5 pointer-events-none absolute inset-y-0 border-x"
                          style={{
                            left: `${weekBlock.startIndex * timeline.dayWidth}px`,
                            width: `${weekBlock.length * timeline.dayWidth}px`,
                          }}
                        />
                      ) : null,
                    )}
                    {timeline.monthWeekBlocks.map((weekBlock) => (
                      <div
                        key={weekBlock.key}
                        className="border-border/60 relative z-[1] flex shrink-0 items-center justify-between border-r px-2 text-[10px]"
                        style={{
                          width: `${weekBlock.length * timeline.dayWidth}px`,
                        }}
                      >
                        <span className="text-foreground/85 font-medium">
                          {weekBlock.shortLabel}
                        </span>
                        <span className="text-muted-foreground/80">
                          {weekBlock.rangeLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : view === "quarter" ? (
                <div className="flex h-full">
                  {timeline.quarterBlocks.map((quarterBlock) => (
                    <div
                      key={quarterBlock.key}
                      className="border-border/60 flex shrink-0 flex-col border-r"
                      style={{
                        width: `${quarterBlock.length * timeline.dayWidth}px`,
                      }}
                    >
                      <div className="flex h-7 items-center px-3">
                        <div className="text-muted-foreground flex items-center gap-2 text-[13px] font-normal whitespace-nowrap">
                          <span>{quarterBlock.title}</span>
                          {quarterBlock.isCurrentQuarter && highlightToday ? (
                            <span className="border-border/70 bg-muted/60 text-foreground/80 rounded-sm border px-1 text-[9px] font-medium">
                              Current
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="border-border/60 relative flex h-5 border-t">
                        {quarterBlock.months.map((monthBlock) =>
                          monthBlock.isCurrentMonth && highlightToday ? (
                            <div
                              key={`${monthBlock.key}-header-overlay`}
                              className="border-primary/10 bg-primary/5 pointer-events-none absolute inset-y-0 border-x"
                              style={{
                                left: `${(monthBlock.startIndex - quarterBlock.startIndex) * timeline.dayWidth}px`,
                                width: `${monthBlock.length * timeline.dayWidth}px`,
                              }}
                            />
                          ) : null,
                        )}
                        {quarterBlock.months.map((monthBlock) => (
                          <div
                            key={monthBlock.key}
                            className="border-border/60 relative z-[1] flex shrink-0 items-center justify-center border-r text-[10px] font-medium"
                            style={{
                              width: `${monthBlock.length * timeline.dayWidth}px`,
                            }}
                          >
                            <span
                              className={cn(
                                monthBlock.isCurrentMonth
                                  ? "text-foreground"
                                  : "text-muted-foreground/80",
                              )}
                            >
                              {monthBlock.shortLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex h-[calc(100%-24px)]">
                    {timeline.days.map((day) => (
                      <div
                        key={day.key}
                        className={cn(
                          "border-border/60 flex shrink-0 items-center justify-center border-r text-[11px]",
                          day.isWeekend && "bg-muted/35",
                          day.isToday && highlightToday && "bg-primary/5",
                        )}
                        style={{ width: `${timeline.dayWidth}px` }}
                      >
                        <span
                          className={cn(
                            "text-muted-foreground flex items-center gap-1.5",
                            day.isToday &&
                              highlightToday &&
                              "border-primary/12 bg-primary/10 text-foreground rounded-full border px-1.5 py-0.5",
                          )}
                        >
                          <span>{day.date.getDate()}</span>
                          <span>{formatHeaderWeekday(day.date)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div
              className="relative"
              style={{
                width: `${timeline.width}px`,
                height: `${chartBodyHeight}px`,
                backgroundImage: gridBackgroundImage,
                backgroundSize: gridBackgroundSize,
              }}
            >
              {view === "week"
                ? timeline.days.map((day, index) => (
                    <div
                      key={`${day.key}-highlight`}
                      className={cn(
                        "pointer-events-none absolute top-0 h-full",
                        day.isWeekend && "bg-muted/25",
                        day.isToday &&
                          highlightToday &&
                          "border-primary/12 bg-primary/4 border-x",
                      )}
                      style={{
                        left: `${index * timeline.dayWidth}px`,
                        width: `${timeline.dayWidth}px`,
                      }}
                    />
                  ))
                : view === "month"
                  ? timeline.monthWeekBlocks.map((weekBlock) => (
                      <div
                        key={`${weekBlock.key}-column`}
                        className={cn(
                          "pointer-events-none absolute top-0 h-full border-r",
                          weekBlock.isCurrentWeek &&
                            highlightToday &&
                            "border-primary/10 bg-primary/5 border-x",
                        )}
                        style={{
                          left: `${weekBlock.startIndex * timeline.dayWidth}px`,
                          width: `${weekBlock.length * timeline.dayWidth}px`,
                        }}
                      />
                    ))
                  : timeline.monthBlocks.map((monthBlock) => (
                      <div
                        key={`${monthBlock.key}-column`}
                        className={cn(
                          "pointer-events-none absolute top-0 h-full border-r",
                          monthBlock.isCurrentMonth &&
                            highlightToday &&
                            "border-primary/10 bg-primary/5 border-x",
                        )}
                        style={{
                          left: `${monthBlock.startIndex * timeline.dayWidth}px`,
                          width: `${monthBlock.length * timeline.dayWidth}px`,
                        }}
                      />
                    ))}

              {positionedIssues.map(
                ({ issue, index, left, width, visible }) => {
                  const minimumBarWidth =
                    view === "quarter" ? 52 : timeline.dayWidth;
                  const barWidth = Math.max(width, minimumBarWidth);
                  const isHiddenOnLeft =
                    left + barWidth < timelineViewportStart;
                  const isHiddenOnRight = left > timelineViewportEnd;
                  const isBlockHidden =
                    visible &&
                    timelineViewportWidth > 0 &&
                    (isHiddenOnLeft || isHiddenOnRight);
                  const showInlineAdd =
                    !visible &&
                    hoveredIssueId === issue.id &&
                    hoverPlacement.issueId === issue.id;

                  return (
                    <div key={issue.id}>
                      <div
                        onMouseEnter={() => onHoveredIssueChange(issue.id)}
                        onMouseLeave={() => {
                          onHoveredIssueChange(null);
                          setHoverPlacement((currentPlacement) =>
                            currentPlacement.issueId === issue.id
                              ? { issueId: null, x: 0 }
                              : currentPlacement,
                          );
                        }}
                        onMouseMove={(event) =>
                          updateHoverPlacement(event, issue.id)
                        }
                        className={cn(
                          "absolute left-0 w-full transition-colors",
                          hoveredIssueId === issue.id &&
                            "bg-muted/70 dark:bg-muted/55",
                        )}
                        style={{
                          top: `${index * BLOCK_HEIGHT}px`,
                          height: `${BLOCK_HEIGHT}px`,
                        }}
                      >
                        {isBlockHidden ? (
                          <button
                            type="button"
                            className="bg-background/95 text-muted-foreground hover:text-foreground absolute top-1/2 z-[6] grid h-8 w-8 -translate-y-1/2 place-items-center rounded-sm border transition-colors"
                            style={{
                              left: `${clamp(
                                timelineViewportStart + 8,
                                8,
                                Math.max(8, timeline.width - 40),
                              )}px`,
                            }}
                            onClick={() => selectIssue(issue)}
                          >
                            <ArrowRight
                              className={cn(
                                "size-3.5",
                                isHiddenOnLeft && "rotate-180",
                              )}
                            />
                          </button>
                        ) : null}

                        {showInlineAdd ? (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="bg-background/95 text-muted-foreground hover:text-foreground absolute top-1/2 z-[6] grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-sm border transition-[color,background-color,opacity] duration-150"
                                  style={{
                                    left: `${clamp(
                                      hoverPlacement.x,
                                      16,
                                      Math.max(16, timeline.width - 16),
                                    )}px`,
                                  }}
                                  onClick={() =>
                                    placeUnscheduledIssue(
                                      issue,
                                      hoverPlacement.x,
                                    )
                                  }
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              {hoverStartDate ? (
                                <TooltipContent side="top">
                                  {hoverDateFormatter.format(hoverStartDate)}
                                </TooltipContent>
                              ) : null}
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </div>

                      {visible ? (
                        <div
                          className="absolute px-1"
                          style={{
                            top: `${index * BLOCK_HEIGHT + 6}px`,
                            left: `${clamp(left, 0, timeline.width)}px`,
                            width: `${barWidth}px`,
                          }}
                        >
                          <div
                            className={cn(
                              "group relative flex h-[34px] items-center overflow-hidden rounded-md border",
                              getIssueBarClassName(issue.status),
                              activeIssueId === issue.id &&
                                "ring-primary/18 ring-2",
                            )}
                            onMouseEnter={() => onHoveredIssueChange(issue.id)}
                            onMouseLeave={() => onHoveredIssueChange(null)}
                            onClick={() => onActiveIssueChange(issue.id)}
                          >
                            <button
                              type="button"
                              aria-label={`Resize ${issue.title} from start`}
                              className="absolute top-0 left-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                              onPointerDown={(event) =>
                                beginDrag(event, issue, "resize-start")
                              }
                            />
                            <button
                              type="button"
                              aria-label={`Move ${issue.title}`}
                              className="flex h-full w-full cursor-grab items-center px-2.5 text-left active:cursor-grabbing"
                              onPointerDown={(event) =>
                                beginDrag(event, issue, "move")
                              }
                            >
                              <span className="truncate text-[13px] leading-none font-medium">
                                {issue.title}
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Resize ${issue.title} from end`}
                              className="absolute top-0 right-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                              onPointerDown={(event) =>
                                beginDrag(event, issue, "resize-end")
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                },
              )}
            </div>
          </section>
        </div>
      </div>

      {quickAdd}
    </div>
  );
}

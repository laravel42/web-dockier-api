import { TODAY, VIEW_CONFIG } from "./data";
import type {
  GanttIssue,
  IssueStatus,
  TimelineDay,
  TimelineMonthBlock,
  TimelineMonthWeekBlock,
  TimelineQuarterBlock,
  TimelineRange,
  TimelineView,
  TimelineWeekBlock,
} from "./types";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});
const monthShortFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + amount);

  return nextDate;
}

export function differenceInCalendarDays(left: Date, right: Date) {
  const leftCopy = new Date(left);
  const rightCopy = new Date(right);

  leftCopy.setHours(0, 0, 0, 0);
  rightCopy.setHours(0, 0, 0, 0);

  return Math.round(
    (leftCopy.getTime() - rightCopy.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStartOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function getEndOfWeek(date: Date) {
  return addDays(getStartOfWeek(date), 6);
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEndOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function normalizeRangeForView(range: TimelineRange, view: TimelineView) {
  if (view === "week" || view === "month") {
    return {
      start: getStartOfWeek(range.start),
      end: getEndOfWeek(range.end),
    };
  }

  if (view === "quarter") {
    return {
      start: getStartOfMonth(range.start),
      end: getEndOfMonth(range.end),
    };
  }

  return range;
}

function getWeekNumberByDate(date: Date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const daysOffset = firstDayOfYear.getDay();
  const firstWeekStart =
    firstDayOfYear.getTime() - daysOffset * 24 * 60 * 60 * 1000;
  const weekStart = new Date(firstWeekStart);

  return (
    Math.floor(
      (date.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
    ) + 1
  );
}

function getBoundaryDate(
  issues: GanttIssue[],
  key: "startDate" | "targetDate",
  comparator: "min" | "max",
) {
  const dates = issues
    .map((issue) => issue[key])
    .filter(Boolean)
    .map((value) => parseLocalDate(value!));

  if (dates.length === 0) return undefined;

  return dates.reduce((selected, current) => {
    if (comparator === "min") {
      return current.getTime() < selected.getTime() ? current : selected;
    }

    return current.getTime() > selected.getTime() ? current : selected;
  });
}

export function buildInitialRange(
  view: TimelineView,
  issues: GanttIssue[],
): TimelineRange {
  const config = VIEW_CONFIG[view];
  const earliestStart = getBoundaryDate(issues, "startDate", "min");
  const latestEnd = getBoundaryDate(issues, "targetDate", "max");

  const start = addDays(
    earliestStart && earliestStart.getTime() < TODAY.getTime()
      ? earliestStart
      : TODAY,
    -config.initialPastDays,
  );
  const end = addDays(
    latestEnd && latestEnd.getTime() > TODAY.getTime() ? latestEnd : TODAY,
    config.initialFutureDays,
  );

  return normalizeRangeForView({ start, end }, view);
}

export function extendRange(
  range: TimelineRange,
  view: TimelineView,
  direction: "left" | "right",
) {
  const extensionDays = VIEW_CONFIG[view].extensionDays;
  const nextRange = normalizeRangeForView(
    direction === "left"
      ? {
          start: addDays(range.start, -extensionDays),
          end: range.end,
        }
      : {
          start: range.start,
          end: addDays(range.end, extensionDays),
        },
    view,
  );

  return {
    ...nextRange,
    addedDays:
      direction === "left"
        ? Math.max(0, differenceInCalendarDays(range.start, nextRange.start))
        : 0,
  };
}

export function ensureRangeContainsIssues(
  range: TimelineRange,
  view: TimelineView,
  issues: GanttIssue[],
) {
  const extensionDays = VIEW_CONFIG[view].extensionDays;
  const earliestStart = getBoundaryDate(issues, "startDate", "min");
  const latestEnd = getBoundaryDate(issues, "targetDate", "max");
  let nextStart = range.start;
  let nextEnd = range.end;

  if (earliestStart && earliestStart.getTime() < range.start.getTime()) {
    nextStart = addDays(earliestStart, -extensionDays);
  }

  if (latestEnd && latestEnd.getTime() > range.end.getTime()) {
    nextEnd = addDays(latestEnd, extensionDays);
  }

  const normalizedRange = normalizeRangeForView(
    {
      start: nextStart,
      end: nextEnd,
    },
    view,
  );

  return {
    range: normalizedRange,
    addedLeftDays: Math.max(
      0,
      differenceInCalendarDays(range.start, normalizedRange.start),
    ),
  };
}

export function buildTimeline(range: TimelineRange, view: TimelineView) {
  const config = VIEW_CONFIG[view];
  const days: TimelineDay[] = [];

  for (
    let index = 0;
    index <= differenceInCalendarDays(range.end, range.start);
    index += 1
  ) {
    const date = addDays(range.start, index);

    days.push({
      date,
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      isToday: differenceInCalendarDays(date, TODAY) === 0,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    });
  }

  const monthBlocks = days.reduce<TimelineMonthBlock[]>(
    (segments, day, index) => {
      const key = `${day.date.getFullYear()}-${day.date.getMonth()}`;
      const currentSegment = segments[segments.length - 1];

      if (currentSegment?.key === key) {
        currentSegment.length += 1;
        return segments;
      }

      segments.push({
        key,
        title: monthFormatter.format(day.date),
        shortLabel: monthShortFormatter.format(day.date),
        startIndex: index,
        length: 1,
        isCurrentMonth:
          day.date.getFullYear() === TODAY.getFullYear() &&
          day.date.getMonth() === TODAY.getMonth(),
      });
      return segments;
    },
    [],
  );

  const weekBlocks: TimelineWeekBlock[] = [];
  const monthWeekBlocks: TimelineMonthWeekBlock[] = [];

  if (view === "week" || view === "month") {
    for (let index = 0; index < days.length; index += 7) {
      const weekDays = days.slice(index, index + 7);

      if (weekDays.length === 0) continue;

      const startDate = weekDays[0]!.date;
      const endDate = weekDays[weekDays.length - 1]!.date;
      const weekNumber = getWeekNumberByDate(startDate);
      const commonWeek = {
        key: `${startDate.getFullYear()}-${startDate.getMonth()}-${startDate.getDate()}`,
        startIndex: index,
        length: weekDays.length,
        isCurrentWeek: weekDays.some((day) => day.isToday),
      };

      monthWeekBlocks.push({
        ...commonWeek,
        rangeLabel: `${startDate.getDate()}-${endDate.getDate()}`,
        shortLabel: `W${weekNumber}`,
      });

      if (view === "week") {
        const title =
          startDate.getMonth() === endDate.getMonth() &&
          startDate.getFullYear() === endDate.getFullYear()
            ? monthFormatter.format(startDate)
            : `${monthFormatter.format(startDate)} - ${monthFormatter.format(endDate)}`;

        weekBlocks.push({
          ...commonWeek,
          title,
          label: `Week ${weekNumber}`,
          days: weekDays,
        });
      }
    }
  }

  const quarterBlocks = monthBlocks.reduce<TimelineQuarterBlock[]>(
    (quarters, monthBlock) => {
      const quarterNumber = Math.floor(
        days[monthBlock.startIndex]!.date.getMonth() / 3,
      );
      const year = days[monthBlock.startIndex]!.date.getFullYear();
      const key = `${year}-Q${quarterNumber + 1}`;
      const currentQuarter = quarters[quarters.length - 1];

      if (currentQuarter?.key === key) {
        currentQuarter.length += monthBlock.length;
        currentQuarter.months.push(monthBlock);
        return quarters;
      }

      const quarterStartMonth = quarterNumber * 3;
      const quarterEndMonth = quarterStartMonth + 2;

      quarters.push({
        key,
        title: `${monthShortFormatter.format(new Date(year, quarterStartMonth, 1))} - ${monthShortFormatter.format(new Date(year, quarterEndMonth, 1))} ${year}`,
        shortLabel: `Q${quarterNumber + 1}`,
        startIndex: monthBlock.startIndex,
        length: monthBlock.length,
        isCurrentQuarter:
          year === TODAY.getFullYear() &&
          quarterNumber === Math.floor(TODAY.getMonth() / 3),
        months: [monthBlock],
      });

      return quarters;
    },
    [],
  );

  return {
    dayWidth: config.dayWidth,
    width: days.length * config.dayWidth,
    days,
    monthBlocks,
    weekBlocks,
    monthWeekBlocks,
    quarterBlocks,
  };
}

export function formatHeaderWeekday(date: Date) {
  const label = weekdayFormatter.format(date);

  if (label === "Thu") return "Th";

  return label[0] ?? "";
}

export function formatWeekHeaderWeekday(date: Date) {
  const label = weekdayFormatter.format(date);

  if (label === "Sun") return "Su";
  if (label === "Thu") return "Th";
  if (label === "Sat") return "Sa";

  return label[0] ?? "";
}

export function getDurationLabel(startDate?: string, targetDate?: string) {
  if (!startDate || !targetDate) return "";

  const days =
    Math.abs(
      differenceInCalendarDays(
        parseLocalDate(targetDate),
        parseLocalDate(startDate),
      ),
    ) + 1;

  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function getIssueBarClassName(status: IssueStatus) {
  switch (status) {
    case "Done":
      return "border-indigo-200/80 bg-indigo-50/90 text-indigo-950 dark:border-indigo-400/45 dark:bg-indigo-900/65 dark:text-indigo-100";
    case "Review":
      return "border-fuchsia-200/80 bg-fuchsia-50/90 text-fuchsia-900 dark:border-fuchsia-400/45 dark:bg-fuchsia-900/65 dark:text-fuchsia-100";
    case "Planned":
      return "border-cyan-200/80 bg-cyan-50/90 text-cyan-900 dark:border-cyan-400/45 dark:bg-cyan-900/65 dark:text-cyan-100";
    case "In Progress":
      return "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-400/50 dark:bg-amber-900/70 dark:text-amber-100";
    case "Backlog":
    default:
      return "border-border/70 bg-muted/45 text-foreground/70 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-100";
  }
}

export function getStatusDotClassName(status: IssueStatus) {
  switch (status) {
    case "Done":
      return "bg-indigo-400/90";
    case "Review":
      return "bg-fuchsia-400/90";
    case "Planned":
      return "bg-cyan-400/90";
    case "In Progress":
      return "bg-amber-400/90";
    case "Backlog":
    default:
      return "bg-zinc-400/80";
  }
}

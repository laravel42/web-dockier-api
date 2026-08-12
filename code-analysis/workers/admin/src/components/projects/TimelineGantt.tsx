import {
  addDays,
  differenceInDays,
  format,
  isWithinInterval,
  startOfWeek,
} from "date-fns";
import { useState } from "react";

import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
} from "@/components/icons/lucide-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { TimelineTask } from "@/lib/data/project-details";

type TimelineGanttProps = {
  tasks: TimelineTask[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function TimelineGantt({ tasks }: TimelineGanttProps) {
  const [rangeStart, setRangeStart] = useState<Date | null>(null);

  if (tasks.length === 0) {
    return (
      <section>
        <h2 className="text-foreground text-base font-semibold">
          Expected Timeline
        </h2>
        <div className="border-border/70 text-muted-foreground mt-4 rounded-lg border border-dashed p-6 text-sm">
          No tasks scheduled
        </div>
      </section>
    );
  }

  const minDate = tasks.reduce(
    (acc, t) => (t.startDate < acc ? t.startDate : acc),
    tasks[0].startDate,
  );
  const maxDate = tasks.reduce(
    (acc, t) => (t.endDate > acc ? t.endDate : acc),
    tasks[0].endDate,
  );
  const minWeekStart = startOfWeek(minDate, { weekStartsOn: 1 });
  const maxWeekStart = startOfWeek(maxDate, { weekStartsOn: 1 });

  const effectiveRangeStart = rangeStart ?? minWeekStart;
  const currentWeekStart = startOfWeek(effectiveRangeStart, {
    weekStartsOn: 1,
  });

  const clampToRange = (date: Date) => {
    if (date.getTime() < minWeekStart.getTime()) return minWeekStart;
    if (date.getTime() > maxWeekStart.getTime()) return maxWeekStart;
    return date;
  };

  const days = (() => {
    const start = startOfWeek(effectiveRangeStart, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  })();

  const monthLabel = format(days[0], "MMMM yyyy");

  const today = new Date();
  const todayInRange = isWithinInterval(today, {
    start: days[0],
    end: addDays(days[days.length - 1], 1),
  });
  const todayIndex = todayInRange
    ? clamp(differenceInDays(today, days[0]), 0, days.length - 1)
    : Math.floor(days.length / 2);

  const handlePrevious = () => {
    setRangeStart((prev) => {
      const base = prev ?? minWeekStart;
      const nextWeek = addDays(base, -7);
      return clampToRange(nextWeek);
    });
  };

  const handleNext = () => {
    setRangeStart((prev) => {
      const base = prev ?? minWeekStart;
      const nextWeek = addDays(base, 7);
      return clampToRange(nextWeek);
    });
  };

  const handleToday = () => {
    const base = startOfWeek(today, { weekStartsOn: 1 });
    setRangeStart(base);
  };

  const rangeStartDate = days[0];
  const rangeEndDate = addDays(days[days.length - 1], 1);

  const hasTasksInRange = tasks.some(
    (t) => t.startDate < rangeEndDate && t.endDate >= rangeStartDate,
  );

  const canGoPrevious = currentWeekStart.getTime() > minWeekStart.getTime();
  const canGoNext = currentWeekStart.getTime() < maxWeekStart.getTime();

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-foreground text-base font-semibold">
          Expected Timeline
        </h2>
      </div>

      <div className="border-border mt-4 overflow-x-auto rounded-lg border">
        <div className="w-full">
          <div className="grid grid-cols-[240px_1fr]">
            <div className="text-muted-foreground border-border bg-muted/20 border-r px-4 py-3 text-sm font-medium">
              Name
            </div>
            <div className="border-border bg-background border-b px-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-muted-foreground text-xs">
                  {monthLabel}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Previous"
                    onClick={handlePrevious}
                    disabled={!canGoPrevious}
                  >
                    <CaretLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-lg bg-transparent px-3 text-xs"
                    onClick={handleToday}
                  >
                    Today
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Next"
                    onClick={handleNext}
                    disabled={!canGoNext}
                  >
                    <CaretRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Range: week"
                    className="h-7 rounded-lg px-3 text-xs"
                  >
                    Week
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Date range"
                  >
                    <CalendarBlank className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Search tasks"
                  >
                    <MagnifyingGlass className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[240px_1fr]">
            <div className="border-border bg-muted/10 border-r" />
            <div
              className={`bg-muted/10 grid gap-1 px-4 py-2`}
              style={{
                gridTemplateColumns: `repeat(${days.length}, minmax(3rem, 1fr))`,
              }}
            >
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className="text-muted-foreground flex flex-col text-[11px] leading-4"
                >
                  <span className="font-medium">{format(d, "EEE")}</span>
                  <span className="text-foreground text-xs">
                    {format(d, "d")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="relative">
            <div
              className="bg-primary absolute top-0 bottom-0 w-px"
              style={{
                left: `calc(240px + 16px + ${(todayIndex / days.length) * 100}%)`,
              }}
              aria-hidden="true"
            />

            {!hasTasksInRange && (
              <div className="bg-background/70 pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="border-border/70 bg-background text-muted-foreground rounded-md border border-dashed px-4 py-2 text-xs">
                  No tasks scheduled in this week
                </div>
              </div>
            )}

            {tasks.map((t, rowIdx) => {
              const startOffset = differenceInDays(t.startDate, days[0]);
              const endOffset = differenceInDays(t.endDate, days[0]);

              const totalDays = days.length;
              const leftPct = clamp((startOffset / totalDays) * 100, 0, 100);
              const rightPct = clamp((endOffset / totalDays) * 100, 0, 100);
              const minWidthPct = (1 / totalDays) * 100;
              const widthPct = clamp(
                rightPct - leftPct + minWidthPct,
                minWidthPct,
                100,
              );

              return (
                <div key={t.id} className="grid grid-cols-[240px_1fr]">
                  <div className="text-foreground border-border truncate border-r px-4 py-2 text-sm">
                    {t.name}
                  </div>
                  <div className="relative px-4 py-0">
                    <div
                      className="grid gap-0"
                      style={{
                        gridTemplateColumns: `repeat(${days.length}, minmax(3rem, 1fr))`,
                      }}
                    >
                      {Array.from({ length: days.length }).map((_, i) => (
                        <div key={i} className="h-10 first:border-l-0" />
                      ))}
                    </div>
                    <div
                      className="bg-muted border-border absolute top-1/2 flex h-7 -translate-y-1/2 items-center rounded-md border px-2"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={t.name}
                    >
                      <span className="text-foreground truncate text-xs">
                        {t.name}
                      </span>
                    </div>
                  </div>
                  {rowIdx < tasks.length - 1 ? (
                    <Separator className="col-span-2" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

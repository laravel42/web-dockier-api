"use client";

import { Clock3, Info } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type WorkHourRange = "5D" | "2W" | "1M" | "6M" | "1Y";

type WorkHourPoint = {
  day: string;
  label: string;
  minutes: number;
};

type WorkHourChartPoint = WorkHourPoint & {
  chartKey: string;
};

const workHourRanges: WorkHourRange[] = ["5D", "2W", "1M", "6M", "1Y"];

const workHourData: Record<
  WorkHourRange,
  {
    activeIndex: number;
    points: WorkHourPoint[];
    totalMinutes: number;
  }
> = {
  "5D": {
    activeIndex: 7,
    totalMinutes: 2292,
    points: [
      { day: "Thu", label: "Thursday", minutes: 210 },
      { day: "Fri", label: "Friday", minutes: 210 },
      { day: "Sat", label: "Saturday", minutes: 420 },
      { day: "Sun", label: "Sunday", minutes: 420 },
      { day: "Mon", label: "Monday", minutes: 420 },
      { day: "Tue", label: "Tuesday", minutes: 300 },
      { day: "Wed", label: "Wednesday", minutes: 300 },
      { day: "Mon", label: "Monday", minutes: 360 },
      { day: "Tue", label: "Tuesday", minutes: 360 },
      { day: "Wed", label: "Wednesday", minutes: 360 },
      { day: "Thu", label: "Thursday", minutes: 420 },
      { day: "Fri", label: "Friday", minutes: 420 },
      { day: "Sat", label: "Saturday", minutes: 300 },
      { day: "Sun", label: "Sunday", minutes: 300 },
      { day: "Mon", label: "Monday", minutes: 360 },
      { day: "Tue", label: "Tuesday", minutes: 420 },
      { day: "Wed", label: "Wednesday", minutes: 420 },
    ],
  },
  "2W": {
    activeIndex: 8,
    totalMinutes: 4528,
    points: [
      { day: "W1", label: "Week 1", minutes: 330 },
      { day: "W1", label: "Week 1", minutes: 390 },
      { day: "W1", label: "Week 1", minutes: 420 },
      { day: "W1", label: "Week 1", minutes: 360 },
      { day: "W1", label: "Week 1", minutes: 300 },
      { day: "W2", label: "Week 2", minutes: 360 },
      { day: "W2", label: "Week 2", minutes: 420 },
      { day: "W2", label: "Week 2", minutes: 420 },
      { day: "W2", label: "Week 2", minutes: 390 },
      { day: "W2", label: "Week 2", minutes: 330 },
      { day: "W2", label: "Week 2", minutes: 360 },
      { day: "W2", label: "Week 2", minutes: 420 },
    ],
  },
  "1M": {
    activeIndex: 6,
    totalMinutes: 9840,
    points: [
      { day: "1", label: "Week 1", minutes: 300 },
      { day: "4", label: "Week 1", minutes: 360 },
      { day: "7", label: "Week 1", minutes: 420 },
      { day: "10", label: "Week 2", minutes: 330 },
      { day: "13", label: "Week 2", minutes: 300 },
      { day: "16", label: "Week 3", minutes: 360 },
      { day: "19", label: "Week 3", minutes: 390 },
      { day: "22", label: "Week 4", minutes: 420 },
      { day: "25", label: "Week 4", minutes: 360 },
      { day: "28", label: "Week 4", minutes: 420 },
    ],
  },
  "6M": {
    activeIndex: 5,
    totalMinutes: 56424,
    points: [
      { day: "Nov", label: "November", minutes: 360 },
      { day: "Dec", label: "December", minutes: 420 },
      { day: "Jan", label: "January", minutes: 390 },
      { day: "Feb", label: "February", minutes: 360 },
      { day: "Mar", label: "March", minutes: 420 },
      { day: "Apr", label: "April", minutes: 390 },
      { day: "May", label: "May", minutes: 420 },
      { day: "Jun", label: "June", minutes: 360 },
    ],
  },
  "1Y": {
    activeIndex: 8,
    totalMinutes: 114840,
    points: [
      { day: "J", label: "January", minutes: 330 },
      { day: "F", label: "February", minutes: 360 },
      { day: "M", label: "March", minutes: 420 },
      { day: "A", label: "April", minutes: 390 },
      { day: "M", label: "May", minutes: 300 },
      { day: "J", label: "June", minutes: 360 },
      { day: "J", label: "July", minutes: 420 },
      { day: "A", label: "August", minutes: 420 },
      { day: "S", label: "September", minutes: 390 },
      { day: "O", label: "October", minutes: 360 },
      { day: "N", label: "November", minutes: 420 },
      { day: "D", label: "December", minutes: 420 },
    ],
  },
};

const workHourChartConfig = {
  minutes: {
    label: "Work hours",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

const workHourCursorColor =
  "color-mix(in oklch, var(--foreground) 60%, transparent)";

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours} hours · ${minutes} mins`;
}

function formatTooltipMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}

function WorkHourTooltip({
  active,
  payload,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as WorkHourChartPoint | undefined;

  if (!point) return null;

  return (
    <div className="border-border bg-popover text-popover-foreground rounded-[5px] border px-2 py-0.5 text-[12px] leading-5 shadow-[0_8px_20px_rgb(24_24_27/10%)]">
      {point.label}, {formatTooltipMinutes(point.minutes)}
    </div>
  );
}

export function WorkHourAnalysisCard() {
  const [range, setRange] = useState<WorkHourRange>("5D");
  const selectedRange = workHourData[range];
  const chartPoints: WorkHourChartPoint[] = selectedRange.points.map(
    (point, index) => ({
      ...point,
      chartKey: `${range}-${index}`,
    }),
  );

  return (
    <section className="flex h-full min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-foreground text-[16px] leading-6 font-medium">
          Work Hour Analysis
        </h2>
      </div>

      <Card
        data-work-hour-analysis
        className="border-border bg-card text-card-foreground flex min-w-0 flex-1 rounded-[6px] shadow-none"
      >
        <CardContent className="flex min-w-0 flex-1 flex-col p-3 py-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="bg-primary/10 grid size-8 shrink-0 place-items-center rounded-full">
              <div className="bg-primary grid size-4 place-items-center rounded-full">
                <Clock3
                  className="text-primary-foreground size-2.5"
                  strokeWidth={2.4}
                />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] leading-3 font-semibold tracking-[0.14em] uppercase">
                Total Work
              </p>
              <p className="truncate text-[15px] leading-6 font-semibold tracking-tight sm:text-[17px]">
                {formatMinutes(selectedRange.totalMinutes)}
              </p>
            </div>
          </div>

          <div className="border-border bg-background text-muted-foreground mt-4 grid h-7 grid-cols-5 overflow-hidden rounded-[6px] border text-[12px] leading-4 font-medium">
            {workHourRanges.map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  "border-border hover:bg-muted focus-visible:bg-muted border-r transition-colors outline-none last:border-r-0",
                  item === range && "bg-muted text-foreground",
                )}
                onClick={() => {
                  setRange(item);
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="relative mt-3 h-[120px] shrink-0">
            <ChartContainer
              config={workHourChartConfig}
              className="h-full w-full"
            >
              <LineChart
                accessibilityLayer
                data={chartPoints}
                margin={{ top: 8, right: 0, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="6 10"
                />
                <XAxis dataKey="chartKey" hide />
                <YAxis hide domain={[120, 480]} />
                <Tooltip
                  content={<WorkHourTooltip />}
                  cursor={{
                    stroke: workHourCursorColor,
                    strokeDasharray: "3 4",
                    strokeWidth: 1.5,
                  }}
                />
                <Line
                  type="linear"
                  dataKey="minutes"
                  stroke="var(--color-minutes)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "var(--background)",
                    stroke: "var(--foreground)",
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </div>

          <div className="text-muted-foreground mt-2.5 flex items-center gap-1.5 text-[12px] leading-4">
            <Info className="fill-muted-foreground/30 text-background size-3.5 shrink-0" />
            <span>Total work hours include extra hours.</span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

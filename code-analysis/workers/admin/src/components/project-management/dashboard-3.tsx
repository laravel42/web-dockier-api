"use client";

import { motion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  Monitor,
  MoreHorizontal,
  RefreshCw,
  Search,
  Users,
  Zap,
} from "lucide-react";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Person = {
  initials: string;
  name: string;
  role: string;
  avatar: string;
};

const people: Person[] = [
  {
    initials: "KL",
    name: "Kiara Laras",
    role: "Product Designer",
    avatar: "/avatars/avatar-1.png",
  },
  {
    initials: "JT",
    name: "Joe Tesla",
    role: "Design Engineer",
    avatar: "/avatars/avatar-3.png",
  },
  {
    initials: "TB",
    name: "Tania Brooks",
    role: "Project Lead",
    avatar: "/avatars/avatar-5.png",
  },
  {
    initials: "CW",
    name: "Cameron Williamson",
    role: "Project Manager",
    avatar: "/avatars/avatar-black-2.png",
  },
  {
    initials: "RF",
    name: "Robert Fox",
    role: "Graphic Design",
    avatar: "/avatars/avatar-4.png",
  },
  {
    initials: "RS",
    name: "Riya Sharma",
    role: "Research Lead",
    avatar: "/avatars/avatar-2.png",
  },
  {
    initials: "AR",
    name: "Ava Reed",
    role: "Frontend Engineer",
    avatar: "/avatars/avatar-black-1.png",
  },
  {
    initials: "MR",
    name: "Maya Rao",
    role: "QA Analyst",
    avatar: "/avatars/avatar-6.png",
  },
  {
    initials: "BL",
    name: "Ben Lewis",
    role: "Platform Engineer",
    avatar: "/avatars/avatar-black-3.png",
  },
];

const portfolioStats = [
  {
    label: "Projects",
    value: "24",
    helper: "Active",
  },
  {
    label: "On Track",
    value: "17",
    helper: "71%",
  },
  {
    label: "At Risk",
    value: "5",
    helper: "21%",
  },
  {
    label: "Off Track",
    value: "2",
    helper: "8%",
  },
  {
    label: "Budget Burn",
    value: "62%",
    helper: "$8.7M / $14.1M",
  },
];

const sprintHealth = [
  { day: "Mon", planned: 24, closed: 16, risk: 3 },
  { day: "Tue", planned: 32, closed: 25, risk: 5 },
  { day: "Wed", planned: 36, closed: 30, risk: 4 },
  { day: "Thu", planned: 44, closed: 34, risk: 7 },
  { day: "Fri", planned: 48, closed: 41, risk: 6 },
  { day: "Sat", planned: 50, closed: 44, risk: 4 },
  { day: "Sun", planned: 54, closed: 49, risk: 3 },
];

const chartMixBase = "var(--background)";
const projectChartPalette = {
  primary: "var(--primary)",
  secondary: {
    light: `color-mix(in oklch, var(--primary) 72%, ${chartMixBase})`,
    dark: `color-mix(in oklch, var(--primary) 84%, ${chartMixBase})`,
  },
  tertiary: {
    light: `color-mix(in oklch, var(--primary) 46%, ${chartMixBase})`,
    dark: `color-mix(in oklch, var(--primary) 58%, ${chartMixBase})`,
  },
} as const;

const sprintConfig = {
  planned: {
    label: "Scope",
    theme: projectChartPalette.tertiary,
  },
  closed: {
    label: "Completed",
    color: projectChartPalette.primary,
  },
} satisfies ChartConfig;

const throughputConfig = {
  planned: {
    label: "Planned",
    theme: projectChartPalette.tertiary,
  },
  closed: {
    label: "Closed",
    color: projectChartPalette.primary,
  },
} satisfies ChartConfig;

const budgetBurnConfig = {
  actual: {
    label: "Actual",
    color: projectChartPalette.primary,
  },
  forecast: {
    label: "Forecast",
    theme: projectChartPalette.secondary,
  },
} satisfies ChartConfig;

const budgetBurnData = [
  { month: "Jan", actual: 0, forecast: null },
  { month: "Feb", actual: 2.7, forecast: null },
  { month: "Mar", actual: 4.8, forecast: null },
  { month: "Apr", actual: 6.9, forecast: null },
  { month: "May", actual: 8.7, forecast: 8.7 },
  { month: "Jun", actual: null, forecast: 10.6 },
  { month: "Jul", actual: null, forecast: 12.6 },
  { month: "Aug", actual: null, forecast: 13.7 },
  { month: "Sep", actual: null, forecast: 14.1 },
];

const statusGroups = [
  {
    label: "Absent",
    members: [
      {
        person: people[3],
        note: "Replaced by Kiara L.",
        status: "Absent",
        tone: "bg-muted text-muted-foreground",
        dot: "bg-muted-foreground",
      },
      {
        person: people[7],
        note: "Coverage by Ava R.",
        status: "Absent",
        tone: "bg-muted text-muted-foreground",
        dot: "bg-muted-foreground",
      },
    ],
  },
  {
    label: "Away",
    members: [
      {
        person: people[2],
        note: "Synergy",
        status: "25m",
        tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        dot: "bg-amber-500",
      },
      {
        person: people[5],
        note: "Discovery",
        status: "18m",
        tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        dot: "bg-amber-500",
      },
      {
        person: people[1],
        note: "Apex",
        status: "12m",
        tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        dot: "bg-amber-500",
      },
      {
        person: people[6],
        note: "Console",
        status: "10m",
        tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        dot: "bg-amber-500",
      },
      {
        person: people[0],
        note: "Pulse",
        status: "8m",
        tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        dot: "bg-amber-500",
      },
      {
        person: people[8],
        note: "Infra",
        status: "6m",
        tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        dot: "bg-amber-500",
      },
    ],
  },
];

const milestones = [
  {
    title: "Revenue dashboard v2",
    code: "REV-241",
    date: "May 14, 2026",
    status: "On Track",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    title: "Onboarding flow launch",
    code: "ONB-118",
    date: "May 21, 2026",
    status: "At Risk",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    title: "Mobile app beta",
    code: "MBL-304",
    date: "May 28, 2026",
    status: "On Track",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    title: "Public API v1",
    code: "API-092",
    date: "Jun 4, 2026",
    status: "At Risk",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
];

const recentActivity = [
  {
    actor: "Nina Oliver",
    action: "commented on RFC-112",
    detail: "Filters API performance improvements",
    time: "10m ago",
    tone: "text-cyan-500",
    icon: Bell,
  },
  {
    actor: "Kai Young",
    action: "moved RFC-126 to Review",
    detail: "Export module CSV support",
    time: "1h ago",
    tone: "text-fuchsia-500",
    icon: CircleDot,
  },
  {
    actor: "Ava Reed",
    action: "closed RFC-101",
    detail: "Timeline engine refactor",
    time: "2h ago",
    tone: "text-emerald-500",
    icon: CheckCircle2,
  },
  {
    actor: "Lena Moss",
    action: "updated ONB-118",
    detail: "Onboarding stepper UI tweaks",
    time: "3h ago",
    tone: "text-cyan-500",
    icon: FileText,
  },
];

const spring = {
  type: "spring",
  stiffness: 120,
  damping: 20,
} as const;

function MiniAvatarStack({
  users,
  more = 0,
  className,
}: {
  users: Person[];
  more?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex -space-x-2", className)}>
      {users.map((person) => (
        <Avatar
          key={person.name}
          className="border-background size-6 rounded-full border-2 sm:size-7"
        >
          <AvatarImage src={person.avatar} alt={person.name} />
          <AvatarFallback>{person.initials}</AvatarFallback>
        </Avatar>
      ))}
      {more > 0 ? (
        <span className="border-background bg-muted grid size-6 place-items-center rounded-full border-2 text-[10px] font-medium sm:size-7 sm:text-[11px]">
          +{more}
        </span>
      ) : null}
    </div>
  );
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: spring },
      }}
      className={cn(
        "bg-card rounded-[8px] border shadow-sm shadow-zinc-200/40 dark:border-white/10 dark:bg-[#161616] dark:shadow-none",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

function HeaderBar() {
  return (
    <header className="bg-background min-w-0 border-b px-3 py-3 sm:px-4 lg:px-6">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="text-muted-foreground truncate">Shadcnblocks</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">Dashboard</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-[6px]"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
            </Button>
            <Button className="h-9 rounded-[6px] px-3">
              <Users className="size-4" />
              <span className="hidden min-[380px]:inline">Invite</span>
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 lg:flex lg:items-center">
          <div className="relative min-w-0 lg:w-[240px]">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="h-9 rounded-[6px] pl-9"
              placeholder="Search projects..."
            />
          </div>
          <MiniAvatarStack users={people.slice(0, 3)} more={2} />
          <Button className="hidden h-9 rounded-[6px] lg:inline-flex">
            <Users className="size-4" />
            Invite
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-9 rounded-[6px] lg:inline-flex"
            aria-label="Notifications"
          >
            <Bell className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatGrid() {
  return (
    <Panel className="overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-[1.2fr_repeat(5,1fr)]">
        <div className="col-span-2 min-w-0 border-b p-3.5 sm:p-4 lg:col-span-1 lg:border-r lg:border-b-0">
          <p className="text-muted-foreground text-xs font-medium">
            Portfolio Health
          </p>
          <div className="mt-2 flex min-w-0 items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xl leading-6 font-semibold text-emerald-600 dark:text-emerald-400">
                Good
              </p>
              <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                On track
              </p>
            </div>
            <svg
              className="h-8 w-24 shrink-0 text-emerald-500"
              viewBox="0 0 96 32"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 21L14 18L25 22L36 13L47 17L58 9L69 20L80 11L93 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 21L14 18L25 22L36 13L47 17L58 9L69 20L80 11L93 15"
                stroke="currentColor"
                strokeOpacity="0.18"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        {portfolioStats.map((stat, index) => {
          const isLastOddStat =
            portfolioStats.length % 2 === 1 &&
            index === portfolioStats.length - 1;
          const isBeforeLastOddStat =
            portfolioStats.length % 2 === 1 &&
            index >= portfolioStats.length - 3 &&
            index <= portfolioStats.length - 2;

          return (
            <div
              key={stat.label}
              className={cn(
                "min-w-0 border-b p-3.5 sm:p-4 lg:border-r lg:border-b-0 last:lg:border-r-0",
                index % 2 === 0 && "border-r lg:border-r",
                isLastOddStat &&
                  "col-span-2 border-t border-r-0 lg:col-span-1 lg:border-t-0 lg:border-r",
                index >= portfolioStats.length - 2 &&
                  !isLastOddStat &&
                  "border-b-0",
                isBeforeLastOddStat && "border-b-0",
                isLastOddStat && "border-b-0",
              )}
            >
              <p className="text-muted-foreground truncate text-xs font-medium">
                {stat.label}
              </p>
              <p className="mt-1.5 text-xl leading-6 font-semibold tracking-tight sm:mt-2">
                {stat.value}
              </p>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {stat.helper}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SprintHealthCard() {
  return (
    <Panel className="flex min-h-[260px] flex-col p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Sprint health</h2>
          <div className="text-muted-foreground mt-3 flex items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor: projectChartPalette.primary,
                }}
              />
              Completed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor: projectChartPalette.tertiary.light,
                }}
              />
              Scope
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {["This sprint"].map((item) => (
            <Button
              key={item}
              variant="outline"
              size="sm"
              className="h-8 rounded-[6px] px-3 text-xs shadow-none"
            >
              {item}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_92px]">
        <ChartContainer
          config={sprintConfig}
          className="[aspect-ratio:auto] h-[176px] w-full"
        >
          <ComposedChart accessibilityLayer data={sprintHealth}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar
              dataKey="closed"
              fill="var(--color-closed)"
              radius={[3, 3, 0, 0]}
              barSize={14}
              isAnimationActive={false}
            />
            <Line
              dataKey="planned"
              type="monotone"
              stroke="var(--color-planned)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--background)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
        <div className="grid grid-cols-3 content-center gap-2 text-center lg:grid-cols-1 lg:text-right">
          <div>
            <p className="text-xl leading-6 font-semibold">68%</p>
            <p className="text-muted-foreground text-[11px]">Sprint progress</p>
          </div>
          <div>
            <p className="text-lg leading-6 font-semibold">32</p>
            <p className="text-muted-foreground text-[11px]">Completed</p>
          </div>
          <div>
            <p className="text-lg leading-6 font-semibold">47</p>
            <p className="text-muted-foreground text-[11px]">Total points</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ThroughputCard() {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Delivery throughput</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Weekly planned vs completed issues
          </p>
        </div>
        <MoreHorizontal className="text-muted-foreground size-4" />
      </div>
      <ChartContainer config={throughputConfig} className="h-[220px] w-full">
        <BarChart accessibilityLayer data={sprintHealth}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar
            dataKey="planned"
            fill="var(--color-planned)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="closed"
            fill="var(--color-closed)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </Panel>
  );
}

function CurrentProjectCard() {
  return (
    <Panel className="flex min-h-[260px] flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Zap className="text-muted-foreground size-4" />
          <h2 className="truncate text-base font-semibold">Current Project</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-[6px] px-3 text-xs shadow-none"
        >
          See All
        </Button>
      </div>

      <div className="min-h-0 flex-1 border-t pt-4">
        <p className="text-muted-foreground text-xs">Project Name</p>
        <div className="mt-2.5 flex min-w-0 items-center gap-2">
          <div className="bg-background grid size-6 shrink-0 place-items-center rounded-[6px] border">
            <Logo className="size-4" width={16} height={16} />
          </div>
          <p className="truncate text-sm font-medium">Shadcnblocks</p>
          <Badge className="rounded-[4px] bg-amber-100 px-1.5 py-0 text-[10px] font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300">
            In Progress
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          {[
            ["Project Manager", people[0]],
            ["Design Lead", people[1]],
          ].map(([label, person]) => (
            <div key={String(label)} className="min-w-0">
              <p className="text-muted-foreground text-xs">{String(label)}</p>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <Avatar className="size-7">
                  <AvatarImage
                    src={(person as Person).avatar}
                    alt={(person as Person).name}
                  />
                  <AvatarFallback>{(person as Person).initials}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium">
                  {(person as Person).name.split(" ")[0]}{" "}
                  {(person as Person).name.split(" ")[1]?.charAt(0)}.
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Team</p>
            <div className="mt-2 flex items-center gap-3">
              <MiniAvatarStack users={people.slice(0, 4)} more={8} />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function BudgetBurnCard() {
  return (
    <Panel className="flex min-h-[260px] flex-col p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Budget Burn</h2>
          <div className="text-muted-foreground mt-3 flex items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-5 rounded-full"
                style={{
                  backgroundColor: projectChartPalette.primary,
                }}
              />
              Actual
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-5 rounded-full border-t-2 border-dotted"
                style={{
                  borderColor: projectChartPalette.secondary.light,
                }}
              />
              Forecast
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-[6px] px-3 text-xs shadow-none"
        >
          FY2026
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      <div className="relative min-h-0">
        <ChartContainer
          config={budgetBurnConfig}
          className="[aspect-ratio:auto] h-[176px] w-full"
        >
          <AreaChart
            accessibilityLayer
            data={budgetBurnData}
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="budgetActualGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--color-actual)"
                  stopOpacity={0.36}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-actual)"
                  stopOpacity={0.08}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => `$${value}M`}
              width={44}
              domain={[0, 16]}
              ticks={[0, 4, 8, 12, 16]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex min-w-[120px] items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {budgetBurnConfig[name as keyof typeof budgetBurnConfig]
                          ?.label ?? name}
                      </span>
                      <span className="text-foreground font-medium">
                        ${Number(value).toFixed(1)}M
                      </span>
                    </div>
                  )}
                />
              }
              cursor={{ stroke: "var(--color-actual)", strokeOpacity: 0.2 }}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke="var(--color-actual)"
              strokeWidth={2}
              fill="url(#budgetActualGradient)"
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="var(--color-forecast)"
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
        <div className="bg-background/90 absolute top-[72px] right-7 rounded-[6px] border px-3 py-2 shadow-sm dark:bg-[#161616]/95">
          <p className="text-base leading-5 font-semibold">$8.7M</p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            62% of budget
          </p>
        </div>
      </div>
    </Panel>
  );
}

function StatusTrackerCard() {
  return (
    <Panel className="flex h-[335px] flex-col p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="text-muted-foreground size-4" />
          <h2 className="truncate text-base font-semibold">Status Tracker</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-[6px] px-3 text-xs shadow-none"
        >
          See All
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t pt-3 pr-1 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]">
        {statusGroups.map((group, groupIndex) => (
          <div
            key={group.label}
            className={cn("space-y-2.5", groupIndex > 0 && "border-t pt-3")}
          >
            <p className="text-muted-foreground text-xs">{group.label}</p>
            {group.members.map((item) => (
              <div
                key={item.person.name}
                className="flex min-w-0 items-center justify-between gap-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="size-8 rounded-full">
                      <AvatarImage
                        src={item.person.avatar}
                        alt={item.person.name}
                      />
                      <AvatarFallback>{item.person.initials}</AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        "border-card absolute right-0 bottom-0 size-2.5 rounded-full border-2",
                        item.dot,
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.person.name}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {item.note}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0 text-[11px] font-medium shadow-none",
                    item.tone,
                  )}
                >
                  {item.status !== "Absent" ? (
                    <Clock3 className="mr-1 size-3" />
                  ) : (
                    <span className="bg-muted-foreground mr-1 size-1.5 rounded-full" />
                  )}
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MilestonesCard() {
  return (
    <Panel className="flex h-[335px] flex-col p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Upcoming milestones</h2>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]">
        {milestones.map((item) => (
          <div
            key={item.title}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_92px_70px] items-center gap-3 rounded-[6px] border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-muted-foreground mt-1 text-xs">{item.code}</p>
            </div>
            <span className="text-muted-foreground text-xs">{item.date}</span>
            <Badge className={cn("rounded-[4px] text-[11px]", item.tone)}>
              {item.status}
            </Badge>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 h-8 shrink-0 rounded-[6px] px-2 text-xs"
      >
        View all milestones
        <ChevronRight className="size-3.5" />
      </Button>
    </Panel>
  );
}

function RecentActivityCard() {
  return (
    <Panel className="flex h-[335px] flex-col p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Recent activity</h2>
        </div>
        <MoreHorizontal className="text-muted-foreground size-4" />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]">
        {recentActivity.map((item) => (
          <div
            key={`${item.actor}-${item.time}`}
            className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-3 rounded-[6px] border p-2.5"
          >
            <span className="bg-muted grid size-7 place-items-center rounded-[5px]">
              <item.icon className={cn("size-3.5", item.tone)} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{item.action}</p>
              <p className="text-muted-foreground truncate text-[11px]">
                {item.detail}
              </p>
            </div>
            <span className="text-muted-foreground text-right text-[11px]">
              {item.time}
            </span>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 h-8 shrink-0 rounded-[6px] px-2 text-xs"
      >
        View all activity
        <ChevronRight className="size-3.5" />
      </Button>
    </Panel>
  );
}

export function ProjectManagementDashboard3({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-background flex min-h-[calc(100dvh-1px)] w-full overflow-hidden",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar />
        <motion.main
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.045 } },
          }}
          initial="hidden"
          animate="show"
          className="dark:bg-background min-w-0 flex-1 overflow-auto bg-zinc-100/50 px-3 pt-3 pb-20 sm:px-4 sm:pt-4 md:px-6 md:pt-5 md:pb-24"
        >
          <div className="mx-auto max-w-[1700px] space-y-3 sm:space-y-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Command Center
                </h1>
                <p className="text-muted-foreground mt-1 text-xs">
                  Track delivery, focus on what matters, and ship with
                  confidence.
                </p>
              </div>
              <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                <Clock3 className="size-3.5" />
                <span>3 min ago</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-[6px]"
                  aria-label="Refresh dashboard"
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="min-w-0 space-y-4">
              <StatGrid />
              <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(300px,0.9fr)]">
                <SprintHealthCard />
                <BudgetBurnCard />
                <CurrentProjectCard />
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <MilestonesCard />
                <StatusTrackerCard />
                <RecentActivityCard />
              </div>
              <div className="grid gap-4 xl:hidden">
                <ThroughputCard />
              </div>
            </div>
          </div>
        </motion.main>
      </div>
    </div>
  );
}

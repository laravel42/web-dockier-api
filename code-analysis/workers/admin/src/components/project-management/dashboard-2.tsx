"use client";

import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Flag,
  Link2,
  ListTodo,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Star,
  StickyNote,
  Users,
  Zap,
} from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { INITIAL_GANTT_ISSUES, TODAY } from "./issue-gantt-1/data";
import {
  addDays,
  buildTimeline,
  clamp,
  differenceInCalendarDays,
  getIssueBarClassName,
  parseLocalDate,
} from "./issue-gantt-1/utils";
import { projects as projectListProjects } from "./project-list-shared";

type Person = {
  name: string;
  role: string;
  avatar: string;
  initials: string;
};

type Project = {
  id: string;
  title: string;
  code: string;
  state: "Active" | "Archived";
  summary: string;
  progress: number;
  due: string;
  startDate: string;
  manager: Person;
  lead: Person;
  teamMore: number;
  assignees: Person[];
};

const people: Person[] = [
  {
    name: "Kiara Laras",
    role: "Product Designer",
    avatar: "/avatars/avatar-1.png",
    initials: "KL",
  },
  {
    name: "Joe Tesla",
    role: "Design Engineer",
    avatar: "/avatars/avatar-3.png",
    initials: "JT",
  },
  {
    name: "Tania Brooks",
    role: "Project Lead",
    avatar: "/avatars/avatar-5.png",
    initials: "TB",
  },
  {
    name: "Cameron Williamson",
    role: "Project Manager",
    avatar: "/avatars/avatar-black-2.png",
    initials: "CW",
  },
  {
    name: "Robert Fox",
    role: "Graphic Design",
    avatar: "/avatars/avatar-4.png",
    initials: "RF",
  },
];

const projectCardMetrics = [
  {
    progress: 48,
    startDate: "Apr 8, 2026",
    due: "Apr 16, 2026",
    manager: people[2],
    lead: people[0],
    teamMore: 8,
    assignees: [people[0], people[1], people[2], people[3]],
  },
  {
    progress: 63,
    startDate: "Apr 10, 2026",
    due: "Apr 18, 2026",
    manager: people[3],
    lead: people[1],
    teamMore: 6,
    assignees: [people[2], people[3], people[4], people[0]],
  },
];

const projects: Project[] = projectListProjects
  .slice(0, 2)
  .map((project, index) => ({
    id: project.id,
    title: project.name,
    code: project.code,
    state: project.state,
    summary: project.description,
    progress: projectCardMetrics[index]?.progress ?? 50,
    startDate: projectCardMetrics[index]?.startDate ?? project.updatedAt,
    due: projectCardMetrics[index]?.due ?? project.updatedAt,
    manager: projectCardMetrics[index]?.manager ?? people[0],
    lead: projectCardMetrics[index]?.lead ?? people[1],
    teamMore: projectCardMetrics[index]?.teamMore ?? project.members.length,
    assignees: projectCardMetrics[index]?.assignees ?? people.slice(0, 2),
  }));

const shortcutTasks = [
  { label: "Create issue", icon: ListTodo },
  { label: "Schedule milestone", icon: Flag },
  { label: "Plan sprint", icon: CalendarPlus },
  { label: "Add project", icon: Plus },
];

const stats = [
  { label: "Total Projects", value: "12", helper: "Active Projects" },
  { label: "Total Task", value: "108", helper: "Tasks Created" },
  { label: "In Progress", value: "12", helper: "Task" },
  { label: "Completed", value: "76", helper: "Task" },
];

const milestoneData = [
  { month: "Jan", target: 42, actual: 48 },
  { month: "Feb", target: 31, actual: 24 },
  { month: "Mar", target: 36, actual: 49 },
  { month: "Apr", target: 85, actual: 82 },
  { month: "May", target: 77, actual: 94 },
  { month: "Jun", target: 74, actual: 51 },
];

type ActivityMapView = "week" | "month" | "quarter";

const activityMapViews: {
  label: string;
  value: ActivityMapView;
  helper: string;
  daysBefore: number;
  daysAfter: number;
}[] = [
  {
    label: "Week",
    value: "week",
    helper: "Weekly Gantt summary from active issues",
    daysBefore: 15,
    daysAfter: 7,
  },
  {
    label: "Month",
    value: "month",
    helper: "Monthly roadmap summary from active issues",
    daysBefore: 24,
    daysAfter: 18,
  },
  {
    label: "Quarter",
    value: "quarter",
    helper: "Quarterly delivery summary from active issues",
    daysBefore: 45,
    daysAfter: 45,
  },
];

type MilestoneView = "one-month" | "three-months" | "six-months" | "one-year";

const milestoneViews: { label: string; value: MilestoneView }[] = [
  { label: "1 Month", value: "one-month" },
  { label: "3 Months", value: "three-months" },
  { label: "6 Month", value: "six-months" },
  { label: "1 Year", value: "one-year" },
];

const milestoneDataByView: Record<
  MilestoneView,
  { month: string; target: number; actual: number }[]
> = {
  "one-month": [
    { month: "W1", target: 18, actual: 20 },
    { month: "W2", target: 24, actual: 21 },
    { month: "W3", target: 20, actual: 25 },
    { month: "W4", target: 28, actual: 27 },
  ],
  "three-months": [
    { month: "Apr", target: 85, actual: 82 },
    { month: "May", target: 77, actual: 94 },
    { month: "Jun", target: 74, actual: 51 },
  ],
  "six-months": milestoneData,
  "one-year": [
    { month: "Q1", target: 109, actual: 121 },
    { month: "Q2", target: 236, actual: 227 },
    { month: "Q3", target: 194, actual: 208 },
    { month: "Q4", target: 221, actual: 218 },
  ],
};

const notes = [
  {
    title: "Confirm revenue review owners",
    detail: "Assign final reviewers for REV-241 dashboard exceptions.",
    date: "Apr 12",
    tags: ["Today", "Owner"],
    done: false,
  },
  {
    title: "Prep onboarding handoff notes",
    detail: "Summarize open blockers before the ONB-118 team sync.",
    date: "Apr 11",
    tags: ["Handoff", "Active"],
    done: true,
  },
  {
    title: "Review overdue issue lanes",
    detail: "Check backlog spillover before updating the weekly plan.",
    date: "Apr 10",
    tags: ["Kanban", "Review"],
    done: true,
  },
];

const rightRailActivity = [
  {
    actor: "Kiara",
    action: "updated wireframes",
    detail: "Checkout flow screens moved to review",
    time: "2 hours ago",
    avatar: people[0].avatar,
  },
  {
    actor: "Joe",
    action: "cleared blocker",
    detail: "Deployment checklist is ready",
    time: "2 hours ago",
    avatar: people[1].avatar,
  },
  {
    actor: "Tania",
    action: "commented on brand guide",
    detail: "Logo spacing needs one final pass",
    time: "5 hours ago",
    avatar: people[2].avatar,
  },
];

const issueStatusSegments = [
  { label: "Backlog", count: 4, color: "bg-zinc-400 dark:bg-zinc-500" },
  { label: "Todo", count: 4, color: "bg-cyan-400 dark:bg-cyan-500" },
  { label: "In Progress", count: 3, color: "bg-amber-400 dark:bg-amber-500" },
  { label: "Review", count: 4, color: "bg-fuchsia-400 dark:bg-fuchsia-500" },
  { label: "Done", count: 3, color: "bg-emerald-400 dark:bg-emerald-500" },
];

const issueStatusTotal = issueStatusSegments.reduce(
  (total, segment) => total + segment.count,
  0,
);

const compactGanttIssues = INITIAL_GANTT_ISSUES.filter(
  (issue) => issue.startDate && issue.targetDate,
).slice(0, 4);

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const chartMixBase = "var(--background)";

const chartConfig = {
  target: {
    label: "Planned",
    color: `color-mix(in oklch, var(--primary) 42%, ${chartMixBase})`,
  },
  actual: { label: "Completed", color: "var(--primary)" },
} satisfies ChartConfig;

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
          className="border-background size-6 border-2 sm:size-7"
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

function TaskShortcuts() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      {shortcutTasks.map((task) => (
        <Panel key={task.label} className="p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-[6px] sm:size-9">
              <task.icon className="size-4" />
            </span>
            <span className="min-w-0 text-[13px] leading-tight font-medium sm:text-sm">
              {task.label}
            </span>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function StatGrid() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      {stats.map((stat) => (
        <Panel key={stat.label} className="p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="text-muted-foreground truncate text-[11px] sm:text-xs">
                {stat.label}
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight sm:mt-2 sm:text-2xl">
                {stat.value}
              </p>
              <p className="text-muted-foreground truncate text-[11px] sm:text-xs">
                {stat.helper}
              </p>
            </div>
            <MoreHorizontal className="text-muted-foreground size-4 shrink-0" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function ActivityMap() {
  const [activeView, setActiveView] = React.useState<ActivityMapView>("week");
  const activeConfig =
    activityMapViews.find((view) => view.value === activeView) ??
    activityMapViews[0]!;
  const compactGanttRange = React.useMemo(
    () => ({
      start: addDays(TODAY, -activeConfig.daysBefore),
      end: addDays(TODAY, activeConfig.daysAfter),
    }),
    [activeConfig.daysAfter, activeConfig.daysBefore],
  );
  const compactGanttTimeline = React.useMemo(
    () => buildTimeline(compactGanttRange, activeView),
    [activeView, compactGanttRange],
  );
  const compactGanttWindowDays = compactGanttTimeline.days.length;
  const compactGanttTodayOffset =
    (differenceInCalendarDays(TODAY, compactGanttRange.start) /
      compactGanttWindowDays) *
    100;

  return (
    <Panel className="p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Time-Based Issue Map</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {activeConfig.helper}
          </p>
        </div>
        <div
          className="bg-muted flex rounded-[6px] p-1 text-xs"
          role="tablist"
          aria-label="Issue map range"
        >
          {activityMapViews.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={activeView === item.value}
              onClick={() => setActiveView(item.value)}
              className={cn(
                "rounded-[5px] px-2 py-1 transition-colors",
                activeView === item.value &&
                  "bg-background shadow-sm dark:bg-zinc-950",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-4">
        <div />
        <div className="relative mb-3 h-7">
          <div className="text-muted-foreground flex h-full items-end justify-between text-xs">
            <span>{compactDateFormatter.format(compactGanttRange.start)}</span>
            <span className="text-foreground font-semibold">Today</span>
            <span>{compactDateFormatter.format(compactGanttRange.end)}</span>
          </div>
        </div>

        <div className="col-span-2 grid grid-cols-[112px_minmax(0,1fr)] gap-x-4">
          {compactGanttIssues.map((issue, index) => {
            const startDate = parseLocalDate(issue.startDate!);
            const targetDate = parseLocalDate(issue.targetDate!);
            const rawStart = differenceInCalendarDays(
              startDate,
              compactGanttRange.start,
            );
            const rawEnd =
              differenceInCalendarDays(targetDate, compactGanttRange.start) + 1;
            const startDay = clamp(rawStart, 0, compactGanttWindowDays);
            const endDay = clamp(rawEnd, 0, compactGanttWindowDays);
            const left = (startDay / compactGanttWindowDays) * 100;
            const width = Math.max(
              18,
              ((endDay - startDay) / compactGanttWindowDays) * 100,
            );
            const isVisible = rawEnd > 0 && rawStart < compactGanttWindowDays;
            const displayStatus =
              issue.status === "Planned" ? "Todo" : issue.status;
            const isCompactBar = width < 24;
            const dateRangeLabel = `${compactDateFormatter.format(startDate)} - ${compactDateFormatter.format(targetDate)}`;

            return (
              <div key={issue.id} className="contents">
                <div className="flex h-[62px] min-w-0 flex-col justify-center">
                  <span className="text-muted-foreground truncate text-xs font-semibold tracking-[0.1em]">
                    {issue.code}
                  </span>
                  <span className="truncate text-sm leading-tight font-medium">
                    {issue.status === "Planned" ? "Todo" : issue.status}
                  </span>
                </div>
                <div className="relative h-[62px]">
                  <div className="bg-border absolute top-1/2 right-0 left-0 h-px dark:bg-white/10" />
                  <div
                    className="bg-foreground/80 pointer-events-none absolute top-0 bottom-0 z-[1] w-px"
                    style={{ left: `${compactGanttTodayOffset}%` }}
                  >
                    {index === 0 ? (
                      <span className="border-t-foreground absolute -top-1 left-1/2 size-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent" />
                    ) : null}
                  </div>
                  {isVisible ? (
                    <div
                      title={`${issue.code}: ${issue.title} · ${displayStatus} · ${dateRangeLabel}`}
                      className={cn(
                        "absolute top-1/2 z-[2] flex h-10 -translate-y-1/2 items-center gap-2 overflow-hidden rounded-full border px-3 text-xs font-medium shadow-sm dark:shadow-none",
                        getIssueBarClassName(issue.status),
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {!isCompactBar ? (
                        <MiniAvatarStack users={people.slice(0, 2)} />
                      ) : null}
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate leading-none font-semibold">
                          {issue.code} · {issue.title}
                        </span>
                        {!isCompactBar ? (
                          <span className="truncate text-[10px] leading-none opacity-70">
                            {displayStatus} · {dateRangeLabel}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (project: Project) => void;
}) {
  return (
    <article className="bg-card rounded-[10px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] dark:border-white/10 dark:bg-[#161616] dark:shadow-none dark:hover:bg-[#1c1c1c]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="text-muted-foreground size-4" />
          <span className="text-sm font-semibold">{project.code}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-[6px] px-3 shadow-none"
          onClick={() => onOpen(project)}
        >
          See details
        </Button>
      </div>

      <div className="mt-4 border-t pt-4">
        <p className="text-muted-foreground text-xs">Project Name</p>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{project.title}</h3>
          <Badge
            variant="secondary"
            className="rounded-[4px] px-1.5 py-0 text-[10px] font-medium"
          >
            {project.state}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {[
          ["Project Manager", project.manager],
          ["Team Lead", project.lead],
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
                {(person as Person).name}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-muted-foreground text-xs">Team</p>
        <div className="mt-2 flex items-center gap-3">
          <MiniAvatarStack users={project.assignees.slice(0, 4)} />
          <span className="text-muted-foreground text-xs">
            +{project.teamMore} people
          </span>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-muted-foreground text-xs">Timeline</p>
        <div className="mt-2 flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="text-muted-foreground size-4" />
          <span>
            {project.startDate} - {project.due}
          </span>
        </div>
      </div>
    </article>
  );
}

function TodayProjects({ onOpen }: { onOpen: (project: Project) => void }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Current Projects</h2>
        <Button variant="outline" size="sm" className="h-8 rounded-[6px]">
          <Plus className="size-4" />
          New Project
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function MilestoneTracker() {
  const [activeView, setActiveView] =
    React.useState<MilestoneView>("six-months");
  const chartData = milestoneDataByView[activeView];

  return (
    <Panel className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Milestone Tracker</h2>
        <div
          className="bg-muted flex rounded-[6px] p-1 text-xs"
          role="tablist"
          aria-label="Milestone range"
        >
          {milestoneViews.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={activeView === item.value}
              onClick={() => setActiveView(item.value)}
              className={cn(
                "rounded-[5px] px-2 py-1 transition-colors",
                activeView === item.value && "bg-background shadow-sm",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-[220px] w-full"
      >
        <BarChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tickMargin={10}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dashed"
                labelFormatter={(value) => `${value}, 2026`}
              />
            }
          />
          <Bar
            dataKey="target"
            fill="var(--color-target)"
            radius={4}
            barSize={16}
          />
          <Bar
            dataKey="actual"
            fill="var(--color-actual)"
            radius={4}
            barSize={16}
          />
        </BarChart>
      </ChartContainer>
    </Panel>
  );
}

function NotesCard() {
  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="text-muted-foreground size-4" />
          <h2 className="text-sm font-semibold">Notes</h2>
        </div>
        <Button variant="outline" size="sm" className="h-8 rounded-[6px]">
          <Plus className="size-4" />
          Add Note
        </Button>
      </div>
      <div className="divide-y">
        {notes.map((note) => (
          <div
            key={note.title}
            className="grid grid-cols-[24px_1fr_auto] gap-3 py-3 first:pt-0 last:pb-0"
          >
            {note.done ? (
              <CheckCircle2 className="text-primary mt-0.5 size-4" />
            ) : (
              <Circle className="text-muted-foreground mt-0.5 size-4" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  note.done && "text-muted-foreground",
                )}
              >
                {note.title}
              </p>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {note.detail}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-muted-foreground h-5 rounded-full px-2 text-[10px] font-medium"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-muted-foreground mt-8 flex items-center gap-1 text-xs">
              <CalendarDays className="size-3.5" />
              {note.date}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RightRail() {
  return (
    <aside className="grid content-start gap-4 xl:w-[330px] xl:shrink-0">
      <Panel className="border-border bg-card p-5 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Activity className="text-primary size-5" />
          <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
        </div>
        <div className="space-y-6">
          {rightRailActivity.map((item) => (
            <div
              key={`${item.actor}-${item.action}`}
              className="grid grid-cols-[34px_1fr] gap-3"
            >
              <Avatar className="size-8">
                <AvatarImage src={item.avatar} alt={item.actor} />
                <AvatarFallback>
                  {item.actor.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold">
                  {item.actor}{" "}
                  <span className="text-foreground/80 font-medium">
                    {item.action}
                  </span>
                </p>
                <p className="text-muted-foreground truncate text-sm font-medium">
                  {item.detail}
                </p>
                <p className="text-muted-foreground/70 text-xs font-medium">
                  {item.time}
                </p>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-6 h-9 w-full justify-between rounded-[6px] px-3 text-sm font-semibold shadow-none"
        >
          Open activity log
          <ArrowRight className="size-4" />
        </Button>
      </Panel>
      <Panel className="border-border bg-card p-5 shadow-sm">
        <div className="mb-6 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Members</h2>
          <span className="text-muted-foreground text-lg">98</span>
        </div>
        <div className="grid grid-cols-6 gap-3">
          {Array.from(
            { length: 10 },
            (_, index) => people[index % people.length],
          ).map((person, index) => (
            <Avatar key={`${person.name}-${index}`} className="size-10 border">
              <AvatarImage src={person.avatar} alt={person.name} />
              <AvatarFallback>{person.initials}</AvatarFallback>
            </Avatar>
          ))}
          <span className="text-muted-foreground grid size-10 place-items-center rounded-full text-sm font-medium">
            +91
          </span>
        </div>
        <Button
          variant="outline"
          className="mt-6 h-9 w-full justify-between rounded-[6px] px-3 text-sm font-semibold shadow-none"
        >
          Manage members
          <ArrowRight className="size-4" />
        </Button>
      </Panel>
      <Panel className="border-border bg-card p-5 shadow-sm">
        <h2 className="mb-6 text-lg font-semibold tracking-tight">
          Issue Status
        </h2>
        <p className="text-muted-foreground -mt-4 mb-5 text-sm">
          {issueStatusTotal} issues distributed across active statuses
        </p>
        <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
          {issueStatusSegments.map((segment) => (
            <span
              key={segment.label}
              className={segment.color}
              style={{ width: `${(segment.count / issueStatusTotal) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-6 space-y-4">
          {issueStatusSegments.map((segment) => (
            <div
              key={segment.label}
              className="flex items-center gap-3 text-sm font-semibold"
            >
              <span className={cn("size-3 rounded-full", segment.color)} />
              <span>{segment.label}</span>
              <span className="text-muted-foreground">{segment.count}</span>
            </div>
          ))}
        </div>
      </Panel>
    </aside>
  );
}

function ProjectDialog({
  project,
  onOpenChange,
}: {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [comment, setComment] = React.useState("");

  React.useEffect(() => {
    if (project) setComment("");
  }, [project]);

  return (
    <Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background max-h-[90dvh] gap-0 overflow-hidden rounded-[10px] border p-0 sm:max-w-[860px]">
        {project ? (
          <>
            <DialogHeader className="border-b p-5 text-left">
              <div className="flex items-start justify-between gap-6 pr-8">
                <div>
                  <DialogTitle className="text-xl">{project.title}</DialogTitle>
                  <DialogDescription className="mt-1">
                    {project.summary}
                  </DialogDescription>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-[6px]"
                  >
                    <Star className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-[6px]"
                  >
                    <Link2 className="size-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="grid max-h-[calc(90dvh-92px)] overflow-y-auto lg:grid-cols-[1fr_270px]">
              <Tabs defaultValue="comment" className="min-w-0 p-5">
                <TabsList className="h-10 rounded-[6px]">
                  <TabsTrigger value="description" className="rounded-[5px]">
                    Description
                  </TabsTrigger>
                  <TabsTrigger value="comment" className="rounded-[5px]">
                    Comment
                  </TabsTrigger>
                  <TabsTrigger value="setting" className="rounded-[5px]">
                    Setting
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="description" className="mt-5 space-y-4">
                  <p className="text-muted-foreground text-sm leading-6">
                    This task coordinates the design system update, review
                    checkpoints, and publish-ready documentation for the project
                    workspace.
                  </p>
                  <div className="rounded-[8px] border p-4">
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-medium">Progress</span>
                      <span className="text-muted-foreground">
                        {project.progress}%
                      </span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="comment" className="mt-5 space-y-5">
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <Avatar className="size-9">
                        <AvatarImage
                          src={people[0].avatar}
                          alt={people[0].name}
                        />
                        <AvatarFallback>KL</AvatarFallback>
                      </Avatar>
                      <div className="bg-muted/60 min-w-0 flex-1 rounded-[8px] p-3">
                        <p className="text-sm">
                          <span className="font-medium">Kiara Laras</span>{" "}
                          <span className="text-muted-foreground">
                            2 hr ago
                          </span>
                        </p>
                        <p className="mt-2 text-sm">
                          What do you think about this style?
                        </p>
                        <div className="bg-background mt-3 inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm">
                          <FileText className="text-primary size-4" />
                          ABC Dashboard Style.fig
                          <span className="text-muted-foreground text-xs">
                            2.5 MB
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Avatar className="size-9">
                        <AvatarImage
                          src={people[1].avatar}
                          alt={people[1].name}
                        />
                        <AvatarFallback>JT</AvatarFallback>
                      </Avatar>
                      <div className="bg-muted/60 min-w-0 flex-1 rounded-[8px] p-3">
                        <p className="text-sm">
                          <span className="font-medium">Joe Tesla</span>{" "}
                          <span className="text-muted-foreground">
                            2 hr ago
                          </span>
                        </p>
                        <p className="mt-2 text-sm">
                          That is good, but you must follow the direction and
                          check the brief
                        </p>
                        <div className="bg-background mt-3 inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm">
                          <FileText className="text-primary size-4" />
                          Design System Guideline.doc
                          <span className="text-muted-foreground text-xs">
                            1.5 MB
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Avatar className="size-9">
                      <AvatarImage
                        src="/avatars/avatar-2.png"
                        alt="Sarah Smither"
                      />
                      <AvatarFallback>SS</AvatarFallback>
                    </Avatar>
                    <Textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Hey there! @kiaralaras @joetesla"
                      className="min-h-20 resize-none rounded-[8px]"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="setting" className="mt-5 space-y-4">
                  {[
                    ["Assignee", "Kiara Laras, Joe Tesla, Tania"],
                    ["Tags", "Mobile App"],
                    ["Status", "On Progress"],
                    ["Due date", project.due],
                    ["State", project.state],
                  ].map(([label, value]) => (
                    <div key={label} className="grid gap-1.5">
                      <span className="text-muted-foreground text-xs">
                        {label}
                      </span>
                      <div className="rounded-[6px] border px-3 py-2 text-sm">
                        {value}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
              <div className="border-t p-5 lg:border-t-0 lg:border-l">
                <div className="space-y-4">
                  <div>
                    <p className="text-muted-foreground text-xs">State</p>
                    <Badge
                      variant="outline"
                      className="text-muted-foreground mt-2 rounded-[4px]"
                    >
                      {project.state}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Due date</p>
                    <p className="mt-2 text-sm font-medium">{project.due}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Collaborators
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <MiniAvatarStack users={project.assignees} />
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7 rounded-[6px]"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="border-t p-4">
              <Button
                variant="outline"
                className="rounded-[6px]"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-[6px]"
                onClick={() => onOpenChange(false)}
              >
                <Send className="size-4" />
                Save
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ProjectManagementDashboard2({
  className,
}: {
  className?: string;
}) {
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(
    null,
  );

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
          className="dark:bg-background min-w-0 flex-1 overflow-auto bg-zinc-100/50 px-3 pt-3 pb-16 sm:px-4 sm:pt-4 md:px-6 md:pt-6 md:pb-24"
        >
          <div className="mx-auto max-w-[1540px] space-y-3 sm:space-y-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-semibold tracking-tight">
                Dashboard
              </h1>
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
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
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
              <div className="min-w-0 space-y-4">
                <TaskShortcuts />
                <StatGrid />
                <ActivityMap />
                <TodayProjects onOpen={setSelectedProject} />
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <MilestoneTracker />
                  <NotesCard />
                </div>
              </div>
              <RightRail />
            </div>
          </div>
        </motion.main>
      </div>
      <ProjectDialog
        project={selectedProject}
        onOpenChange={(open) => !open && setSelectedProject(null)}
      />
    </div>
  );
}

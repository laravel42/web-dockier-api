"use client";

import {
  CalendarDays,
  CircleUserRound,
  Link2,
  PanelsTopLeft,
  Star,
} from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  getProjectManagementInitials,
  projectManagementMembers,
} from "./people-data";

export type ProjectMember = {
  name: string;
};

export type ProjectState = "Active" | "Archived";

export type CoverConfig = {
  accentClassName: string;
  hueA: number;
  hueB: number;
  hueC: number;
  positionA: string;
  positionB: string;
  sizeA: string;
  sizeB: string;
  alphaA: number;
  alphaB: number;
};

export type ProjectMeta = {
  cycle: string;
  cycleDuration: string;
  timelineHealth: number;
  daysLeft: number;
  dueDate: string;
  dueDuration: string;
  tasksClosed: number;
  tasksTotal: number;
};

export type ProjectRecord = {
  id: string;
  name: string;
  code: string;
  description: string;
  state: ProjectState;
  updatedAt: string;
  members: ProjectMember[];
  cover: CoverConfig;
  backgroundImage: string;
  meta: ProjectMeta;
};

export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";
export type TeamSizeFilter = "all" | "3" | "4+";
export type UpdatedWindowFilter = "all" | "7" | "14";

function createMembers(names: string[]): ProjectMember[] {
  return names.map((name) => ({ name }));
}

export function getCoverStyle(cover: CoverConfig): CSSProperties {
  const baseFrom = `hsl(${cover.hueA} 34% 31%)`;
  const baseVia = `hsl(${cover.hueB} 36% 24%)`;
  const baseTo = `hsl(${cover.hueC} 34% 19%)`;
  const planeA = `hsla(${cover.hueA} 78% 70% / ${Math.min(0.52, cover.alphaA)})`;
  const planeB = `hsla(${cover.hueB} 72% 68% / ${Math.min(0.38, cover.alphaB + 0.08)})`;

  return {
    backgroundImage: [
      `linear-gradient(112deg, ${planeA} 0%, transparent 38%)`,
      `linear-gradient(154deg, transparent 22%, ${planeB} 58%, transparent 100%)`,
      "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, transparent 46%)",
      `linear-gradient(135deg, ${baseFrom} 0%, ${baseVia} 48%, ${baseTo} 100%)`,
    ].join(", "),
  };
}

export const mutedControlClassName =
  "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground";

export const statusOptions: ProjectState[] = ["Active", "Archived"];

export const projects: ProjectRecord[] = [
  {
    id: "proj-001",
    name: "Revenue Insights Revamp",
    code: "REV-241",
    description:
      "Consolidate reporting, exception tracking, and approval notes into one operating surface for the weekly revenue review.",
    state: "Active",
    updatedAt: "Apr 12, 2026",
    members: createMembers(["Riya Sharma", "Ben Lewis", "Ava Reed"]),
    backgroundImage: "/images/project-backgrounds/1.png",
    meta: {
      cycle: "Improvement",
      cycleDuration: "4 weeks",
      timelineHealth: 58,
      daysLeft: 34,
      dueDate: "14 Feb 2026",
      dueDuration: "6 weeks",
      tasksClosed: 1,
      tasksTotal: 11,
    },
    cover: {
      accentClassName: "bg-amber-400/90",
      hueA: 3,
      hueB: 213,
      hueC: 292,
      positionA: "18% 22%",
      positionB: "78% 18%",
      sizeA: "29%",
      sizeB: "26%",
      alphaA: 0.62,
      alphaB: 0.32,
    },
  },
  {
    id: "proj-002",
    name: "Enterprise Onboarding Flow",
    code: "ONB-118",
    description:
      "Reduce activation time for new enterprise accounts with clearer handoffs, owner visibility, and unblock queues.",
    state: "Active",
    updatedAt: "Apr 11, 2026",
    members: createMembers([
      "Maya Rao",
      "Owen Lee",
      "Chloe Park",
      "Victor Hale",
    ]),
    backgroundImage: "/images/project-backgrounds/2.png",
    meta: {
      cycle: "Launch",
      cycleDuration: "6 weeks",
      timelineHealth: 72,
      daysLeft: 41,
      dueDate: "22 Feb 2026",
      dueDuration: "7 weeks",
      tasksClosed: 5,
      tasksTotal: 14,
    },
    cover: {
      accentClassName: "bg-sky-400/90",
      hueA: 234,
      hueB: 194,
      hueC: 165,
      positionA: "20% 16%",
      positionB: "84% 20%",
      sizeA: "30%",
      sizeB: "28%",
      alphaA: 0.42,
      alphaB: 0.24,
    },
  },
  {
    id: "proj-003",
    name: "Claims Resolution Workspace",
    code: "CLM-084",
    description:
      "Bring case intake, review steps, and escalation notes together so the support and finance teams stop working from separate trackers.",
    state: "Active",
    updatedAt: "Apr 10, 2026",
    members: createMembers(["Kabir Sethi", "Dina Moss", "Leo Park"]),
    backgroundImage: "/images/project-backgrounds/3.png",
    meta: {
      cycle: "Fix",
      cycleDuration: "2 weeks",
      timelineHealth: 24,
      daysLeft: 8,
      dueDate: "20 Jan 2026",
      dueDuration: "2 weeks",
      tasksClosed: 3,
      tasksTotal: 9,
    },
    cover: {
      accentClassName: "bg-zinc-300/90",
      hueA: 214,
      hueB: 38,
      hueC: 260,
      positionA: "22% 28%",
      positionB: "74% 16%",
      sizeA: "27%",
      sizeB: "24%",
      alphaA: 0.22,
      alphaB: 0.18,
    },
  },
  {
    id: "proj-004",
    name: "Retail Launch Readiness",
    code: "RTL-062",
    description:
      "Coordinate launch blockers, merchandising deadlines, and store feedback ahead of the summer retail rollout.",
    state: "Active",
    updatedAt: "Apr 9, 2026",
    members: createMembers(["Sofia Ahmed", "Ava Reed", "Tia West"]),
    backgroundImage: "/images/project-backgrounds/4.png",
    meta: {
      cycle: "Improvement",
      cycleDuration: "3 weeks",
      timelineHealth: 85,
      daysLeft: 52,
      dueDate: "3 Mar 2026",
      dueDuration: "8 weeks",
      tasksClosed: 8,
      tasksTotal: 12,
    },
    cover: {
      accentClassName: "bg-lime-300/90",
      hueA: 82,
      hueB: 42,
      hueC: 142,
      positionA: "16% 18%",
      positionB: "81% 24%",
      sizeA: "26%",
      sizeB: "24%",
      alphaA: 0.28,
      alphaB: 0.2,
    },
  },
  {
    id: "proj-005",
    name: "Mobile Release Train",
    code: "MOB-092",
    description:
      "Track release scope, QA sign-off, and ship-room notes across the next three mobile drops without losing ownership.",
    state: "Active",
    updatedAt: "Apr 8, 2026",
    members: createMembers([
      "Ethan Cole",
      "Nina Brooks",
      "Jules Hart",
      "Leo Park",
    ]),
    backgroundImage: "/images/project-backgrounds/5.png",
    meta: {
      cycle: "Launch",
      cycleDuration: "5 weeks",
      timelineHealth: 45,
      daysLeft: 19,
      dueDate: "1 Feb 2026",
      dueDuration: "4 weeks",
      tasksClosed: 6,
      tasksTotal: 18,
    },
    cover: {
      accentClassName: "bg-cyan-300/90",
      hueA: 205,
      hueB: 276,
      hueC: 227,
      positionA: "30% 14%",
      positionB: "86% 30%",
      sizeA: "25%",
      sizeB: "30%",
      alphaA: 0.3,
      alphaB: 0.22,
    },
  },
  {
    id: "proj-006",
    name: "Inventory Accuracy Audit",
    code: "INV-176",
    description:
      "Close the gap between warehouse counts and storefront availability with a focused audit stream for the highest-variance SKUs.",
    state: "Active",
    updatedAt: "Apr 7, 2026",
    members: createMembers(["Harper Singh", "Victor Hale", "Ben Lewis"]),
    backgroundImage: "/images/project-backgrounds/6.png",
    meta: {
      cycle: "Maintenance",
      cycleDuration: "8 weeks",
      timelineHealth: 91,
      daysLeft: 64,
      dueDate: "18 Mar 2026",
      dueDuration: "10 weeks",
      tasksClosed: 11,
      tasksTotal: 13,
    },
    cover: {
      accentClassName: "bg-emerald-400/90",
      hueA: 152,
      hueB: 183,
      hueC: 124,
      positionA: "18% 34%",
      positionB: "78% 16%",
      sizeA: "31%",
      sizeB: "23%",
      alphaA: 0.26,
      alphaB: 0.16,
    },
  },
  {
    id: "proj-007",
    name: "Knowledge Base Migration",
    code: "KB-057",
    description:
      "Move support guides into the new publishing workflow with clean ownership, review checkpoints, and release-linked updates.",
    state: "Active",
    updatedAt: "Apr 6, 2026",
    members: createMembers(["Chloe Park", "Maya Rao", "Ava Reed"]),
    backgroundImage: "/images/project-backgrounds/7.png",
    meta: {
      cycle: "Improvement",
      cycleDuration: "4 weeks",
      timelineHealth: 66,
      daysLeft: 28,
      dueDate: "8 Feb 2026",
      dueDuration: "5 weeks",
      tasksClosed: 4,
      tasksTotal: 10,
    },
    cover: {
      accentClassName: "bg-fuchsia-300/90",
      hueA: 295,
      hueB: 22,
      hueC: 258,
      positionA: "17% 18%",
      positionB: "72% 22%",
      sizeA: "28%",
      sizeB: "25%",
      alphaA: 0.3,
      alphaB: 0.18,
    },
  },
  {
    id: "proj-008",
    name: "Partner SLA Tracker",
    code: "SLA-203",
    description:
      "Create a shared tracker for partner response commitments, renewal risk, and the exceptions that need follow-up each week.",
    state: "Active",
    updatedAt: "Apr 5, 2026",
    members: createMembers(["Owen Lee", "Dina Moss", "Kabir Sethi"]),
    backgroundImage: "/images/project-backgrounds/8.png",
    meta: {
      cycle: "Fix",
      cycleDuration: "3 weeks",
      timelineHealth: 38,
      daysLeft: 12,
      dueDate: "24 Jan 2026",
      dueDuration: "3 weeks",
      tasksClosed: 2,
      tasksTotal: 7,
    },
    cover: {
      accentClassName: "bg-violet-300/90",
      hueA: 249,
      hueB: 177,
      hueC: 223,
      positionA: "24% 22%",
      positionB: "88% 18%",
      sizeA: "24%",
      sizeB: "31%",
      alphaA: 0.24,
      alphaB: 0.16,
    },
  },
  {
    id: "proj-009",
    name: "Hiring Pipeline Cleanup",
    code: "HIR-074",
    description:
      "Standardize interview stages, recruiter notes, and decision handoffs so open roles stop stalling between reviews.",
    state: "Active",
    updatedAt: "Apr 4, 2026",
    members: createMembers(["Sofia Ahmed", "Riya Sharma", "Harper Singh"]),
    backgroundImage: "/images/project-backgrounds/9.png",
    meta: {
      cycle: "Maintenance",
      cycleDuration: "6 weeks",
      timelineHealth: 78,
      daysLeft: 45,
      dueDate: "28 Feb 2026",
      dueDuration: "7 weeks",
      tasksClosed: 9,
      tasksTotal: 15,
    },
    cover: {
      accentClassName: "bg-rose-300/90",
      hueA: 352,
      hueB: 24,
      hueC: 326,
      positionA: "21% 17%",
      positionB: "75% 26%",
      sizeA: "27%",
      sizeB: "26%",
      alphaA: 0.36,
      alphaB: 0.18,
    },
  },
  {
    id: "proj-010",
    name: "Renewal Forecast Console",
    code: "REN-133",
    description:
      "Give account teams one place to review upcoming renewals, pricing changes, and intervention plans before quarter close.",
    state: "Active",
    updatedAt: "Apr 3, 2026",
    members: createMembers(["Ben Lewis", "Victor Hale", "Maya Rao"]),
    backgroundImage: "/images/project-backgrounds/10.png",
    meta: {
      cycle: "Launch",
      cycleDuration: "2 weeks",
      timelineHealth: 15,
      daysLeft: 5,
      dueDate: "17 Jan 2026",
      dueDuration: "2 weeks",
      tasksClosed: 7,
      tasksTotal: 20,
    },
    cover: {
      accentClassName: "bg-teal-300/90",
      hueA: 167,
      hueB: 208,
      hueC: 136,
      positionA: "15% 22%",
      positionB: "82% 20%",
      sizeA: "25%",
      sizeB: "27%",
      alphaA: 0.22,
      alphaB: 0.2,
    },
  },
  {
    id: "proj-011",
    name: "Field Ops Dispatch Board",
    code: "FLD-119",
    description:
      "Improve scheduling and exception handling for field teams managing same-day service requests across priority regions.",
    state: "Archived",
    updatedAt: "Apr 2, 2026",
    members: createMembers(["Tia West", "Leo Park", "Nina Brooks"]),
    backgroundImage: "/images/project-backgrounds/11.png",
    meta: {
      cycle: "Improvement",
      cycleDuration: "5 weeks",
      timelineHealth: 100,
      daysLeft: 0,
      dueDate: "6 Jan 2026",
      dueDuration: "5 weeks",
      tasksClosed: 16,
      tasksTotal: 16,
    },
    cover: {
      accentClassName: "bg-yellow-300/90",
      hueA: 46,
      hueB: 214,
      hueC: 28,
      positionA: "20% 19%",
      positionB: "84% 15%",
      sizeA: "26%",
      sizeB: "23%",
      alphaA: 0.26,
      alphaB: 0.14,
    },
  },
  {
    id: "proj-012",
    name: "Subscription Save Plays",
    code: "SUB-088",
    description:
      "Organize churn signals, outreach experiments, and hand-raise workflows for the accounts most likely to cancel next month.",
    state: "Archived",
    updatedAt: "Apr 1, 2026",
    members: createMembers(["Jules Hart", "Kabir Sethi", "Owen Lee"]),
    backgroundImage: "/images/project-backgrounds/12.png",
    meta: {
      cycle: "Fix",
      cycleDuration: "3 weeks",
      timelineHealth: 100,
      daysLeft: 0,
      dueDate: "20 Dec 2025",
      dueDuration: "3 weeks",
      tasksClosed: 12,
      tasksTotal: 12,
    },
    cover: {
      accentClassName: "bg-purple-300/90",
      hueA: 278,
      hueB: 342,
      hueC: 246,
      positionA: "18% 28%",
      positionB: "78% 18%",
      sizeA: "30%",
      sizeB: "24%",
      alphaA: 0.28,
      alphaB: 0.16,
    },
  },
];

export function filterAndSortProjects({
  searchQuery,
  sortOption,
  teamSizeFilter,
  updatedWindow,
  statusFilter,
}: {
  searchQuery: string;
  sortOption: SortOption;
  teamSizeFilter: TeamSizeFilter;
  updatedWindow: UpdatedWindowFilter;
  statusFilter: ProjectState[];
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filtered = projects.filter((project) => {
    const daysSinceUpdate = Math.floor(
      (new Date("2026-04-12").getTime() -
        new Date(project.updatedAt).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const matchesStatus = statusFilter.includes(project.state);
    const matchesTeamSize =
      teamSizeFilter === "all"
        ? true
        : teamSizeFilter === "3"
          ? project.members.length === 3
          : project.members.length >= 4;
    const matchesUpdatedWindow =
      updatedWindow === "all" ? true : daysSinceUpdate <= Number(updatedWindow);
    const matchesSearch =
      normalizedQuery.length === 0
        ? true
        : [
            project.name,
            project.code,
            project.description,
            ...project.members.map((member) => member.name),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

    return (
      matchesStatus && matchesTeamSize && matchesUpdatedWindow && matchesSearch
    );
  });

  return [...filtered].sort((a, b) => {
    if (sortOption === "newest") {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }

    if (sortOption === "oldest") {
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }

    if (sortOption === "name-asc") {
      return a.name.localeCompare(b.name);
    }

    return b.name.localeCompare(a.name);
  });
}

export function ProjectCard({
  project,
  className,
}: {
  project: ProjectRecord;
  className?: string;
}) {
  const progress = project.meta.timelineHealth;
  const closedTasks = project.meta.tasksClosed;
  const totalTasks = project.meta.tasksTotal;
  const progressColor =
    progress >= 70
      ? "var(--primary)"
      : progress >= 40
        ? "var(--foreground)"
        : progress > 0
          ? "var(--destructive)"
          : "var(--muted-foreground)";
  const openTasks = Math.max(totalTasks - closedTasks, 0);
  const memberPreview = project.members.slice(0, 3).map((member) => {
    const details = projectManagementMembers.find(
      (projectManagementMember) => projectManagementMember.name === member.name,
    );

    return {
      name: member.name,
      avatar: details?.avatar,
      initials: getProjectManagementInitials(member.name),
    };
  });
  const hiddenMemberCount = Math.max(
    project.members.length - memberPreview.length,
    0,
  );

  return (
    <Card
      className={cn(
        "border-border bg-background dark:bg-card w-full max-w-none cursor-pointer overflow-hidden rounded-2xl border shadow-none transition-shadow focus-within:outline-none hover:shadow-lg/5",
        className,
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
              <PanelsTopLeft className="size-4" />
            </div>
            <span className="text-muted-foreground truncate text-xs font-medium tracking-[0.14em] uppercase">
              {project.code}
            </span>
          </div>

          <div
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              project.state === "Active"
                ? "border-primary/20 bg-primary/5 text-foreground"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                project.state === "Active"
                  ? "bg-primary"
                  : "bg-muted-foreground",
              )}
            />
            {project.state}
          </div>
        </div>

        <div className="mt-3 min-w-0">
          <p className="text-foreground text-[15px] leading-6 font-semibold">
            {project.name}
          </p>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {[project.meta.cycle, project.meta.cycleDuration]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>

        <p className="text-muted-foreground mt-3 line-clamp-2 min-h-10 text-sm leading-5">
          {project.description}
        </p>

        <div className="text-muted-foreground mt-2 flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-4 shrink-0" />
            <span className="truncate">{project.meta.dueDate}</span>
          </div>
          <div className="flex shrink-0 -space-x-2">
            {memberPreview.map((member) => (
              <Avatar
                key={member.name}
                className="border-background dark:border-card size-7 border-2"
                title={member.name}
              >
                <AvatarImage src={member.avatar} alt={member.name} />
                <AvatarFallback className="text-[10px] font-medium">
                  {member.initials}
                </AvatarFallback>
              </Avatar>
            ))}
            {hiddenMemberCount > 0 ? (
              <span className="border-background bg-muted text-muted-foreground dark:border-card grid size-7 place-items-center rounded-full border-2 text-[10px] font-medium">
                +{hiddenMemberCount}
              </span>
            ) : null}
            {project.members.length === 0 ? (
              <Avatar className="border-background dark:border-card size-7 border-2">
                <AvatarFallback>
                  <CircleUserRound className="text-muted-foreground size-4" />
                </AvatarFallback>
              </Avatar>
            ) : null}
          </div>
        </div>

        <div className="border-border/60 mt-4 border-t" />

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-foreground font-medium">{progress}%</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {closedTasks}/{totalTasks} done · {openTasks} open
            </span>
          </div>
          <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, progress))}%`,
                backgroundColor: progressColor,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-[11px] font-medium dark:text-zinc-500">
      {children}
    </span>
  );
}

function MetaValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-foreground text-sm font-medium dark:text-zinc-200">
      {children}
    </span>
  );
}

function MetaSub({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-[11px] dark:text-zinc-500">
      {children}
    </span>
  );
}

function HealthBar({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-emerald-500"
      : value >= 40
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="text-foreground text-sm font-semibold tabular-nums dark:text-zinc-200">
        {value}%
      </span>
    </div>
  );
}

export function ProjectCardLarge({
  project,
  className,
}: {
  project: ProjectRecord;
  className?: string;
}) {
  const { meta } = project;
  const openTasks = meta.tasksTotal - meta.tasksClosed;

  return (
    <Card
      className={cn(
        "border-border/70 bg-card group w-full overflow-hidden rounded-xl border shadow-none transition-colors dark:border-white/10 dark:bg-[#1d1d1d] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      <div className="relative h-[160px] w-full overflow-hidden">
        <Image
          src={project.backgroundImage}
          alt=""
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/5" />

        <div className="absolute inset-0 flex flex-col justify-between px-5 pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                  project.state === "Active"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-white/10 text-white/60",
                )}
              >
                {project.state}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 rounded-md border-0 bg-white/12 text-white shadow-none hover:bg-white/18 dark:bg-white/10 dark:hover:bg-white/16"
              >
                <Link2 className="size-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 rounded-md border-0 bg-white/12 text-white shadow-none hover:bg-white/18 dark:bg-white/10 dark:hover:bg-white/16"
              >
                <Star className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <div
                className={cn(
                  "h-4 w-1 rounded-full",
                  project.cover.accentClassName,
                )}
              />
              <span className="text-[11px] font-medium tracking-[0.18em] text-white/75 uppercase">
                {project.code}
              </span>
            </div>
            <h3 className="truncate text-lg font-semibold text-white dark:text-zinc-50">
              {project.name}
            </h3>
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 p-5 dark:bg-gradient-to-b dark:from-[#202020] dark:to-[#1b1b1b]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="space-y-0.5">
            <MetaLabel>Cycle</MetaLabel>
            <div className="flex items-baseline gap-1.5">
              <MetaValue>{meta.cycle}</MetaValue>
              <MetaSub>{meta.cycleDuration}</MetaSub>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <MetaLabel>Timeline health</MetaLabel>
            {meta.daysLeft > 0 && <MetaSub>{meta.daysLeft} days left</MetaSub>}
          </div>
          <HealthBar value={meta.timelineHealth} />
        </div>

        <div className="border-border/60 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3.5 dark:border-white/8">
          <div className="space-y-0.5">
            <MetaLabel>Due date</MetaLabel>
            <div className="flex items-baseline gap-1.5">
              <MetaValue>{meta.dueDate}</MetaValue>
            </div>
            <MetaSub>{meta.dueDuration}</MetaSub>
          </div>
          <div className="space-y-0.5">
            <MetaLabel>Tasks closed</MetaLabel>
            <div className="flex items-baseline gap-1.5">
              <MetaValue>
                {meta.tasksClosed}/{meta.tasksTotal}
              </MetaValue>
            </div>
            <MetaSub>
              {openTasks > 0
                ? `${openTasks} open task${openTasks !== 1 ? "s" : ""}`
                : "All tasks complete"}
            </MetaSub>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import {
  ChevronRight,
  ChevronsUpDown,
  Globe2,
  MoreHorizontal,
  Search,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type IssuePriority, type IssueStatus } from "./issue-core";
import { projects } from "./project-list-shared";

type ProjectHealth = "offline" | "online" | "risk";
type IssueKind = "bug" | "story" | "task" | "spike";

type DashboardIssue = {
  id: string;
  code: string;
  title: string;
  description: string;
  projectId: string;
  owner: {
    name: string;
    avatar: string;
    initials: string;
  };
  status: IssueStatus;
  priority: IssuePriority;
  kind: IssueKind;
  updatedAt: string;
  dueLabel: string;
  comments: number;
};

const projectHealthById: Record<string, ProjectHealth> = {
  "proj-001": "risk",
  "proj-002": "online",
  "proj-003": "offline",
  "proj-004": "online",
  "proj-005": "risk",
  "proj-006": "online",
  "proj-007": "online",
  "proj-008": "offline",
  "proj-009": "online",
  "proj-010": "risk",
  "proj-011": "online",
  "proj-012": "offline",
};

const dashboardIssues: DashboardIssue[] = [
  {
    id: "issue-201",
    code: "REV-201",
    title: "Reconcile forecast deltas in weekly revenue view",
    description: "Variance cells need reviewer notes before Friday export.",
    projectId: "proj-001",
    owner: {
      name: "Riya Sharma",
      avatar: "/avatars/avatar-2.png",
      initials: "RS",
    },
    status: "In Progress",
    priority: "high",
    kind: "task",
    updatedAt: "18m ago",
    dueLabel: "Due today",
    comments: 8,
  },
  {
    id: "issue-202",
    code: "REV-202",
    title: "Add exception owner handoff state",
    description: "Finance wants stale exceptions called out during review.",
    projectId: "proj-001",
    owner: {
      name: "Ben Lewis",
      avatar: "/avatars/avatar-black-3.png",
      initials: "BL",
    },
    status: "Review",
    priority: "medium",
    kind: "story",
    updatedAt: "46m ago",
    dueLabel: "Tomorrow",
    comments: 5,
  },
  {
    id: "issue-203",
    code: "REV-203",
    title: "Lock approval notes after close",
    description: "Readonly behavior should match the audit export.",
    projectId: "proj-001",
    owner: {
      name: "Ava Reed",
      avatar: "/avatars/avatar-black-1.png",
      initials: "AR",
    },
    status: "Planned",
    priority: "low",
    kind: "task",
    updatedAt: "2h ago",
    dueLabel: "May 15",
    comments: 2,
  },
  {
    id: "issue-204",
    code: "ONB-204",
    title: "Split legal and security handoffs",
    description: "Enterprise setup stalls when both queues share one owner.",
    projectId: "proj-002",
    owner: {
      name: "Maya Rao",
      avatar: "/avatars/avatar-6.png",
      initials: "MR",
    },
    status: "In Progress",
    priority: "high",
    kind: "story",
    updatedAt: "12m ago",
    dueLabel: "Due today",
    comments: 11,
  },
  {
    id: "issue-205",
    code: "ONB-205",
    title: "Instrument activation checkpoint events",
    description: "Send funnel events when workspace setup enters review.",
    projectId: "proj-002",
    owner: {
      name: "Owen Lee",
      avatar: "/avatars/avatar-4.png",
      initials: "OL",
    },
    status: "Review",
    priority: "medium",
    kind: "spike",
    updatedAt: "1h ago",
    dueLabel: "May 16",
    comments: 3,
  },
  {
    id: "issue-206",
    code: "ONB-206",
    title: "Create empty state for blocked implementation",
    description: "Customer success needs a softer waiting room state.",
    projectId: "proj-002",
    owner: {
      name: "Chloe Park",
      avatar: "/avatars/avatar-1.png",
      initials: "CP",
    },
    status: "Backlog",
    priority: null,
    kind: "task",
    updatedAt: "3h ago",
    dueLabel: "Unscheduled",
    comments: 1,
  },
  {
    id: "issue-207",
    code: "CLM-207",
    title: "Restore escalation timer on reopened claims",
    description: "Timer resets after a claim returns from finance review.",
    projectId: "proj-003",
    owner: {
      name: "Kabir Sethi",
      avatar: "/avatars/avatar-5.png",
      initials: "KS",
    },
    status: "In Progress",
    priority: "high",
    kind: "bug",
    updatedAt: "24m ago",
    dueLabel: "Due today",
    comments: 14,
  },
  {
    id: "issue-208",
    code: "CLM-208",
    title: "Persist claim intake filters per reviewer",
    description: "Reviewers lose their queue settings after reload.",
    projectId: "proj-003",
    owner: {
      name: "Dina Moss",
      avatar: "/avatars/avatar-3.png",
      initials: "DM",
    },
    status: "Planned",
    priority: "medium",
    kind: "story",
    updatedAt: "2h ago",
    dueLabel: "May 14",
    comments: 6,
  },
  {
    id: "issue-209",
    code: "RTL-209",
    title: "Add launch blocker digest for store leads",
    description: "Daily email should include merchandising and ops blockers.",
    projectId: "proj-004",
    owner: {
      name: "Sofia Ahmed",
      avatar: "/avatars/avatar-black-2.png",
      initials: "SA",
    },
    status: "Review",
    priority: "medium",
    kind: "task",
    updatedAt: "31m ago",
    dueLabel: "Tomorrow",
    comments: 7,
  },
  {
    id: "issue-210",
    code: "RTL-210",
    title: "QA retail readiness checklist on mobile",
    description: "The field team needs parity with desktop checklist actions.",
    projectId: "proj-004",
    owner: {
      name: "Tia West",
      avatar: "/avatars/avatar-1.png",
      initials: "TW",
    },
    status: "Done",
    priority: "low",
    kind: "task",
    updatedAt: "4h ago",
    dueLabel: "Shipped",
    comments: 4,
  },
  {
    id: "issue-211",
    code: "MOB-211",
    title: "Gate app-store notes behind release train",
    description: "Notes should appear only after QA signs the candidate.",
    projectId: "proj-005",
    owner: {
      name: "Ethan Cole",
      avatar: "/avatars/avatar-4.png",
      initials: "EC",
    },
    status: "In Progress",
    priority: "high",
    kind: "story",
    updatedAt: "16m ago",
    dueLabel: "Due today",
    comments: 9,
  },
  {
    id: "issue-212",
    code: "MOB-212",
    title: "Resolve Android smoke-test flake",
    description: "Smoke suite fails intermittently on push notification setup.",
    projectId: "proj-005",
    owner: {
      name: "Nina Brooks",
      avatar: "/avatars/avatar-5.png",
      initials: "NB",
    },
    status: "Planned",
    priority: "high",
    kind: "bug",
    updatedAt: "1h ago",
    dueLabel: "May 14",
    comments: 10,
  },
  {
    id: "issue-213",
    code: "INV-213",
    title: "Flag SKU count drift over seven percent",
    description: "Audit board should separate systemic and one-off deltas.",
    projectId: "proj-006",
    owner: {
      name: "Harper Singh",
      avatar: "/avatars/avatar-2.png",
      initials: "HS",
    },
    status: "Done",
    priority: "medium",
    kind: "task",
    updatedAt: "2h ago",
    dueLabel: "Shipped",
    comments: 3,
  },
  {
    id: "issue-214",
    code: "KB-214",
    title: "Backfill article owners from legacy tags",
    description: "Migration preview needs owner initials before signoff.",
    projectId: "proj-007",
    owner: {
      name: "Chloe Park",
      avatar: "/avatars/avatar-1.png",
      initials: "CP",
    },
    status: "In Progress",
    priority: "medium",
    kind: "task",
    updatedAt: "28m ago",
    dueLabel: "May 15",
    comments: 4,
  },
  {
    id: "issue-215",
    code: "SLA-215",
    title: "Show partner breaches by renewal tier",
    description: "Account teams need breach severity beside renewal risk.",
    projectId: "proj-008",
    owner: {
      name: "Owen Lee",
      avatar: "/avatars/avatar-4.png",
      initials: "OL",
    },
    status: "Backlog",
    priority: "high",
    kind: "spike",
    updatedAt: "5h ago",
    dueLabel: "Unscheduled",
    comments: 6,
  },
  {
    id: "issue-216",
    code: "HIR-216",
    title: "Normalize recruiter notes across stages",
    description: "Hiring managers need one review format before panel.",
    projectId: "proj-009",
    owner: {
      name: "Riya Sharma",
      avatar: "/avatars/avatar-2.png",
      initials: "RS",
    },
    status: "Review",
    priority: "low",
    kind: "story",
    updatedAt: "3h ago",
    dueLabel: "May 17",
    comments: 2,
  },
  {
    id: "issue-217",
    code: "REN-217",
    title: "Block forecast export when pricing is stale",
    description: "Renewal console should show the pricing owner first.",
    projectId: "proj-010",
    owner: {
      name: "Ben Lewis",
      avatar: "/avatars/avatar-black-3.png",
      initials: "BL",
    },
    status: "In Progress",
    priority: "high",
    kind: "bug",
    updatedAt: "38m ago",
    dueLabel: "Due today",
    comments: 13,
  },
  {
    id: "issue-218",
    code: "FLD-218",
    title: "Archive completed dispatch exceptions",
    description: "Completed field jobs should not pollute live boards.",
    projectId: "proj-011",
    owner: {
      name: "Leo Park",
      avatar: "/avatars/avatar-3.png",
      initials: "LP",
    },
    status: "Done",
    priority: "low",
    kind: "task",
    updatedAt: "1d ago",
    dueLabel: "Shipped",
    comments: 1,
  },
  {
    id: "issue-219",
    code: "SUB-219",
    title: "Group save plays by cancellation signal",
    description: "CS leaders want a single view for outreach experiments.",
    projectId: "proj-012",
    owner: {
      name: "Jules Hart",
      avatar: "/avatars/avatar-6.png",
      initials: "JH",
    },
    status: "Backlog",
    priority: "medium",
    kind: "story",
    updatedAt: "2d ago",
    dueLabel: "Unscheduled",
    comments: 5,
  },
];

const supplementalOwners = [
  { name: "Ava Reed", avatar: "/avatars/avatar-black-1.png", initials: "AR" },
  { name: "Maya Rao", avatar: "/avatars/avatar-6.png", initials: "MR" },
  { name: "Ben Lewis", avatar: "/avatars/avatar-black-3.png", initials: "BL" },
  { name: "Chloe Park", avatar: "/avatars/avatar-1.png", initials: "CP" },
] as const;

const supplementalIssueTemplates = [
  {
    title: "Review acceptance criteria with project owner",
    description:
      "Confirm open scope and mark any dependency risk before planning.",
    kind: "task",
    status: "Planned",
    priority: "medium",
    updatedAt: "3h ago",
  },
  {
    title: "QA edge cases for handoff states",
    description:
      "Check empty, blocked, overdue, and reassigned states in the flow.",
    kind: "bug",
    status: "In Progress",
    priority: "high",
    updatedAt: "5h ago",
  },
  {
    title: "Polish reviewer notes and activity copy",
    description:
      "Tighten labels so the list remains scannable in compact mode.",
    kind: "story",
    status: "Review",
    priority: "low",
    updatedAt: "Yesterday",
  },
  {
    title: "Add instrumentation for project timeline events",
    description:
      "Track status changes, owner updates, and late-stage review events.",
    kind: "spike",
    status: "Backlog",
    priority: null,
    updatedAt: "2d ago",
  },
] as const;

const generatedDashboardIssues: DashboardIssue[] = projects.flatMap(
  (project, projectIndex) => {
    const prefix = project.code.split("-")[0] ?? "PRJ";

    return supplementalIssueTemplates.map((template, templateIndex) => ({
      id: `${project.id}-extra-${templateIndex + 1}`,
      code: `${prefix}-${projectIndex + 30}${templateIndex + 1}`,
      title: template.title,
      description: template.description,
      projectId: project.id,
      owner:
        supplementalOwners[
          (projectIndex + templateIndex) % supplementalOwners.length
        ],
      status: template.status,
      priority: template.priority,
      kind: template.kind,
      updatedAt: template.updatedAt,
      dueLabel: template.status === "Backlog" ? "Unscheduled" : "This week",
      comments: 2 + templateIndex,
    }));
  },
);

const allDashboardIssues = [...dashboardIssues, ...generatedDashboardIssues];

const healthStyles: Record<ProjectHealth, string> = {
  offline: "bg-muted text-muted-foreground",
  online: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  risk: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const priorityClassName: Record<NonNullable<IssuePriority>, string> = {
  high: "bg-red-500/10 text-red-600 dark:text-red-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const issueStatusClassName: Record<IssueStatus, string> = {
  Backlog: "border-muted bg-muted text-muted-foreground",
  Planned:
    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300",
  "In Progress":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  Review:
    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  Done: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function getProjectIssues(projectId: string) {
  return allDashboardIssues.filter((issue) => issue.projectId === projectId);
}

function getProjectHealth(projectId: string) {
  return projectHealthById[projectId] ?? "online";
}

function ProjectRow({
  isSelected,
  onSelect,
  project,
}: {
  isSelected: boolean;
  onSelect: () => void;
  project: (typeof projects)[number];
}) {
  const health = getProjectHealth(project.id);
  const issueCount = getProjectIssues(project.id).length;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "hover:bg-muted/60 flex w-full min-w-0 items-center gap-4 px-4 py-4 text-left transition-colors sm:px-6 lg:px-8",
          isSelected && "bg-muted",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn("shrink-0 rounded-full p-1", healthStyles[health])}
            >
              <span className="block size-2 rounded-full bg-current" />
            </span>
            <h2 className="text-foreground flex min-w-0 items-center gap-2 text-sm font-semibold">
              <span className="shrink-0">{project.code}</span>
              <span className="text-muted-foreground shrink-0">/</span>
              <span className="min-w-0 truncate">{project.name}</span>
            </h2>
          </div>
          <div className="text-muted-foreground mt-3 flex min-w-0 items-center gap-2.5 text-xs">
            <p className="truncate">{project.description}</p>
            <span className="bg-muted-foreground/50 size-0.5 shrink-0 rounded-full" />
            <p className="shrink-0 whitespace-nowrap">{project.updatedAt}</p>
          </div>
        </div>
        <span className="text-primary ring-primary/20 shrink-0 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset">
          {issueCount} issues
        </span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      </button>
    </li>
  );
}

function IssueRow({ issue }: { issue: DashboardIssue }) {
  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-1 shrink-0 rounded-full p-1",
            issue.priority
              ? priorityClassName[issue.priority]
              : "bg-muted text-muted-foreground",
          )}
        >
          <span className="block size-2 rounded-full bg-current" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h3 className="text-foreground grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 text-sm font-semibold">
              <span className="shrink-0">{issue.code}</span>
              <span className="text-muted-foreground">/</span>
              <span className="min-w-0 truncate">{issue.title}</span>
            </h3>
            <span
              className={cn(
                "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                issueStatusClassName[issue.status],
              )}
            >
              {issue.status}
            </span>
          </div>
          <div className="text-muted-foreground mt-2 flex min-w-0 items-center gap-2 text-xs">
            <p className="min-w-0 truncate">{issue.description}</p>
            <span className="bg-muted-foreground/50 size-0.5 shrink-0 rounded-full" />
            <p className="shrink-0 whitespace-nowrap">{issue.updatedAt}</p>
          </div>
        </div>
      </div>
    </li>
  );
}

export function ProjectManagementProjectList4({
  className,
}: {
  className?: string;
}) {
  const [selectedProjectId, setSelectedProjectId] = React.useState(
    projects[0]?.id ?? "",
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedIssues = getProjectIssues(selectedProject.id);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleProjects = projects.filter((project) => {
    if (!normalizedQuery) {
      return true;
    }

    return [project.code, project.name, project.description, project.state]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  return (
    <div
      className={cn(
        "bg-background flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6 lg:px-8">
        <div className="grid flex-1 grid-cols-1">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search projects"
            className="col-start-1 row-start-1 block size-full border-0 bg-transparent pl-8 text-base shadow-none outline-none focus-visible:ring-0 sm:text-sm"
          />
          <Search className="text-muted-foreground pointer-events-none col-start-1 row-start-1 size-5 self-center" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-9 rounded-[6px]"
        >
          <MoreHorizontal className="size-5" />
          <span className="sr-only">More actions</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 overflow-y-auto">
          <header className="bg-background sticky top-0 z-20 flex items-center justify-between border-b px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <h1 className="text-foreground text-base font-semibold">
              Projects
            </h1>
            <Button
              variant="ghost"
              className="text-muted-foreground shrink-0 text-sm font-medium"
            >
              Sort by
              <ChevronsUpDown className="size-4" />
            </Button>
          </header>

          <ul role="list" className="divide-y">
            {visibleProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                isSelected={project.id === selectedProject.id}
                onSelect={() => setSelectedProjectId(project.id)}
              />
            ))}
          </ul>
        </main>

        <aside className="bg-muted/20 min-w-0 overflow-y-auto border-t xl:border-t-0 xl:border-l">
          <div className="bg-background sticky top-0 z-20 border-b">
            <header className="flex items-center justify-between px-4 py-4 sm:px-6 sm:py-6">
              <h2 className="text-foreground text-base font-semibold">
                Issues
              </h2>
              <Button
                variant="link"
                className="text-primary h-auto px-0 text-sm font-semibold"
              >
                View all
              </Button>
            </header>
            <div className="border-t px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="bg-background text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border">
                  <Globe2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {selectedProject.name}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {selectedProject.members.length} members ·{" "}
                    {selectedProject.meta.tasksClosed}/
                    {selectedProject.meta.tasksTotal} tasks closed
                  </p>
                </div>
              </div>
            </div>
          </div>
          <ul role="list" className="divide-y">
            {selectedIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

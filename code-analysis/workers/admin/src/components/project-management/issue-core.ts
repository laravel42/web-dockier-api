"use client";

import { FolderKanban } from "lucide-react";

export type IssueStatus =
  | "Backlog"
  | "Planned"
  | "In Progress"
  | "Review"
  | "Done";

export type IssuePriority = "low" | "medium" | "high" | null;

export type ProjectIssue = {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: IssueStatus;
  startDate?: string;
  targetDate?: string;
};

export type CreateIssueDefaults = {
  status?: IssueStatus;
  priority?: IssuePriority;
  description?: string;
  startDate?: string;
  targetDate?: string;
};

export type CreateIssueValues = {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  startDate: string;
  targetDate: string;
};

export type CreatedProjectIssue = ProjectIssue & {
  assignee: null;
  blocked: boolean;
  priority: IssuePriority;
  updateLabel: string;
  subIssueCount: number;
};

export const PROJECT_TABS = ["Issues", "Cycles", "Modules", "Views", "Pages"];

export const ISSUE_STATUS_OPTIONS: IssueStatus[] = [
  "Backlog",
  "Planned",
  "In Progress",
  "Review",
  "Done",
];

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + amount);

  return nextDate;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Keep the demo surfaces pinned to a stable reference date so SSR and hydration
// do not disagree about which day is "today" across time zones.
export const TODAY = parseLocalDate("2026-04-16");

export const INITIAL_PROJECT_ISSUES: ProjectIssue[] = [
  {
    id: "issue-001",
    code: "RFC-101",
    title: "Finalize issue timeline architecture",
    status: "In Progress",
    startDate: "2026-04-02",
    targetDate: "2026-04-10",
  },
  {
    id: "issue-002",
    code: "RFC-102",
    title: "Review gantt interaction states",
    status: "Planned",
    startDate: "2026-04-04",
    targetDate: "2026-04-06",
  },
  {
    id: "issue-003",
    code: "RFC-103",
    title: "Sync issue filters with project views",
    status: "Review",
    startDate: "2026-04-08",
    targetDate: "2026-04-16",
  },
  {
    id: "issue-004",
    code: "RFC-104",
    title: "Document drag and resize behavior",
    status: "Backlog",
  },
  {
    id: "issue-005",
    code: "RFC-105",
    title: "Create empty and loading timeline states",
    status: "Planned",
    startDate: "2026-04-14",
    targetDate: "2026-04-21",
  },
  {
    id: "issue-006",
    code: "RFC-106",
    title: "Add mock dependencies and handoff notes",
    status: "Done",
    startDate: "2026-04-03",
    targetDate: "2026-04-07",
  },
  {
    id: "issue-007",
    code: "RFC-107",
    title: "Polish the quarter view density",
    status: "Review",
    startDate: "2026-04-06",
    targetDate: "2026-04-08",
  },
  {
    id: "issue-008",
    code: "RFC-108",
    title: "Prepare issue calendar follow-up screen",
    status: "Backlog",
  },
];

export const PROJECT_ICON = FolderKanban;

export function getDisplayStatusLabel(status: IssueStatus) {
  return status === "Planned" ? "Todo" : status;
}

export function buildCreateIssueValues(
  defaults: CreateIssueDefaults = {},
): CreateIssueValues {
  const defaultStartDate =
    defaults.startDate ??
    (defaults.status === "Backlog" ? "" : toIsoDate(TODAY));
  const defaultTargetDate =
    defaults.targetDate ??
    (defaults.status === "Backlog" ? "" : toIsoDate(addDays(TODAY, 2)));

  return {
    title: "",
    description: defaults.description ?? "",
    status: defaults.status ?? "Planned",
    priority: defaults.priority ?? null,
    startDate: defaultStartDate,
    targetDate: defaultTargetDate,
  };
}

export function createProjectIssue(
  values: CreateIssueValues,
  issueCount: number,
): CreatedProjectIssue {
  const issueNumber = issueCount + 101;
  const hasSchedule = values.status !== "Backlog";
  const startDate = hasSchedule ? values.startDate || undefined : undefined;
  const targetDate = hasSchedule ? values.targetDate || undefined : undefined;
  const [normalizedStartDate, normalizedTargetDate] =
    startDate && targetDate && startDate > targetDate
      ? [targetDate, startDate]
      : [startDate, targetDate];

  return {
    id: `issue-${issueNumber}`,
    code: `RFC-${issueNumber}`,
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    status: values.status,
    startDate: normalizedStartDate,
    targetDate: normalizedTargetDate,
    assignee: null,
    blocked: false,
    priority: values.priority,
    updateLabel: "Created now",
    subIssueCount: 0,
  };
}

import type {
  IssueStatus as SharedIssueStatus,
  ProjectIssue,
} from "../issue-core";

export type TimelineView = "week" | "month" | "quarter";

export type IssueStatus = SharedIssueStatus;

export type GanttIssue = ProjectIssue;

export type TimelineRange = {
  start: Date;
  end: Date;
};

export type TimelineDay = {
  date: Date;
  key: string;
  isToday: boolean;
  isWeekend: boolean;
};

export type TimelineSegment = {
  key: string;
  label: string;
  startIndex: number;
  length: number;
};

export type TimelineWeekBlock = {
  key: string;
  title: string;
  label: string;
  startIndex: number;
  length: number;
  days: TimelineDay[];
  isCurrentWeek: boolean;
};

export type TimelineMonthBlock = {
  key: string;
  title: string;
  shortLabel: string;
  startIndex: number;
  length: number;
  isCurrentMonth: boolean;
};

export type TimelineMonthWeekBlock = {
  key: string;
  rangeLabel: string;
  shortLabel: string;
  startIndex: number;
  length: number;
  isCurrentWeek: boolean;
};

export type TimelineQuarterBlock = {
  key: string;
  title: string;
  shortLabel: string;
  startIndex: number;
  length: number;
  isCurrentQuarter: boolean;
  months: TimelineMonthBlock[];
};

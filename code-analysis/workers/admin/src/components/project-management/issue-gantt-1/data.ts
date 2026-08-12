import {
  CalendarDays,
  ChartNoAxesGantt,
  LayoutGrid,
  Rows3,
  Table2,
} from "lucide-react";
import type { ComponentType } from "react";

import {
  INITIAL_PROJECT_ISSUES,
  ISSUE_STATUS_OPTIONS,
  PROJECT_ICON,
  PROJECT_TABS,
  TODAY,
} from "../issue-core";
import type { TimelineView } from "./types";

export { ISSUE_STATUS_OPTIONS, PROJECT_ICON, PROJECT_TABS, TODAY };

export const ISSUE_LAYOUTS: Array<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}> = [
  { icon: Rows3, label: "List" },
  { icon: LayoutGrid, label: "Board" },
  { icon: CalendarDays, label: "Calendar" },
  { icon: Table2, label: "Sheet" },
  { icon: ChartNoAxesGantt, label: "Gantt", active: true },
];

export const VIEW_CONFIG: Record<
  TimelineView,
  {
    dayWidth: number;
    initialPastDays: number;
    initialFutureDays: number;
    extensionDays: number;
  }
> = {
  week: {
    dayWidth: 56,
    initialPastDays: 14,
    initialFutureDays: 21,
    extensionDays: 21,
  },
  month: {
    dayWidth: 20,
    initialPastDays: 30,
    initialFutureDays: 45,
    extensionDays: 45,
  },
  quarter: {
    dayWidth: 6,
    initialPastDays: 90,
    initialFutureDays: 120,
    extensionDays: 90,
  },
};

export const SIDEBAR_WIDTH = 360;
export const BLOCK_HEIGHT = 44;
export const TIMELINE_HEADER_HEIGHT = 48;
export const INITIAL_GANTT_ISSUES = INITIAL_PROJECT_ISSUES;

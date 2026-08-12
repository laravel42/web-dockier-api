import { cn } from "@/lib/utils";

import { BLOCK_HEIGHT, SIDEBAR_WIDTH, TIMELINE_HEADER_HEIGHT } from "./data";
import type { GanttIssue } from "./types";
import { getDurationLabel, getStatusDotClassName } from "./utils";

type IssueGanttSidebarProps = {
  issues: GanttIssue[];
  sidebarWidth?: number;
  hoveredIssueId: string | null;
  onSelectIssue: (issue: GanttIssue) => void;
  onHoveredIssueChange: (issueId: string | null) => void;
};

export function IssueGanttSidebar(props: IssueGanttSidebarProps) {
  const {
    issues,
    sidebarWidth = SIDEBAR_WIDTH,
    hoveredIssueId,
    onSelectIssue,
    onHoveredIssueChange,
  } = props;

  return (
    <aside
      className="bg-background z-20 shrink-0 border-r sm:sticky sm:left-0"
      style={{ width: `${sidebarWidth}px` }}
    >
      <div
        className="bg-background sticky top-0 z-30 border-b px-4 pb-2"
        style={{ height: `${TIMELINE_HEADER_HEIGHT}px` }}
      >
        <div className="text-muted-foreground flex h-full items-end justify-between text-[13px] font-medium">
          <span>Issues</span>
          <span>Duration</span>
        </div>
      </div>

      <div className="bg-background">
        {issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => onSelectIssue(issue)}
            onMouseEnter={() => onHoveredIssueChange(issue.id)}
            onMouseLeave={() => onHoveredIssueChange(null)}
            className={cn(
              "flex w-full items-center justify-between gap-3 px-4 text-left transition-colors",
              hoveredIssueId === issue.id && "bg-muted/70",
            )}
            style={{ height: `${BLOCK_HEIGHT}px` }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    getStatusDotClassName(issue.status),
                  )}
                />
                <span className="text-muted-foreground shrink-0 text-[12px]">
                  {issue.code}
                </span>
                <span className="truncate text-[13px] font-medium">
                  {issue.title}
                </span>
              </div>
            </div>
            <span className="text-muted-foreground shrink-0 text-xs">
              {getDurationLabel(issue.startDate, issue.targetDate)}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

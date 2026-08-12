import { cn } from "@/lib/utils";

import type { TimelineView } from "./types";

type IssueGanttToolbarProps = {
  issueCount: number;
  view: TimelineView;
  onViewChange: (view: TimelineView) => void;
  onToday: () => void;
};

export function IssueGanttToolbar(props: IssueGanttToolbarProps) {
  const { issueCount, view, onViewChange, onToday } = props;

  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-1.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-2">
          {(["week", "month", "quarter"] as TimelineView[]).map((option) => (
            <button
              key={option}
              type="button"
              className={cn(
                "hover:bg-muted rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
                option === view && "bg-muted text-foreground",
              )}
              onClick={() => onViewChange(option)}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}

          <button
            type="button"
            className="hover:bg-muted rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors"
            onClick={onToday}
          >
            Today
          </button>
        </div>
      </div>

      <div className="text-muted-foreground text-[13px] font-medium">
        {issueCount} Issues
      </div>
    </div>
  );
}

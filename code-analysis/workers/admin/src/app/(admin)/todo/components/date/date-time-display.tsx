import { Calendar, Clock } from "lucide-react";

import { cn } from "@/lib/utils";

import { formatDate, formatTime, hasTime } from "../../lib/date-utils";

interface DateTimeDisplayProps {
  date: Date | undefined;
  showTime?: boolean;
  className?: string;
  iconSize?: string;
}

/**
 * Reusable component for displaying date and time with icons
 * Used across TodoItem, right-column, and other components
 */
export function DateTimeDisplay({
  date,
  showTime = true,
  className,
  iconSize = "size-3",
}: DateTimeDisplayProps) {
  if (!date) return null;

  return (
    <div
      className={cn("text-chart-1 flex items-center gap-1 text-xs", className)}
    >
      <Calendar className={iconSize} />
      <span>{formatDate(date)}</span>
      {showTime && hasTime(date) && (
        <>
          <Clock className={iconSize} />
          <span>{formatTime(date)}</span>
        </>
      )}
    </div>
  );
}

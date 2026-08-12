import { Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { getPresetDate } from "../../lib/date-utils";

type DatePreset = "today" | "tomorrow" | "next-week" | "next-month" | "no-date";

interface DateSelectorProps {
  onSelectDate: (date: Date | undefined) => void;
  className?: string;
}

const dateOptions: Array<{
  type: DatePreset;
  label: string;
  color: string;
}> = [
  { type: "today", label: "Today", color: "text-chart-1" },
  { type: "tomorrow", label: "Tomorrow", color: "text-chart-2" },
  { type: "next-week", label: "Next week", color: "text-chart-3" },
  { type: "next-month", label: "Next month", color: "text-chart-4" },
  { type: "no-date", label: "No date", color: "text-chart-5" },
];

/**
 * Reusable date selector with preset options
 * Provides quick date selection (Today, Tomorrow, Next week, etc.)
 */
export function DateSelector({ onSelectDate, className }: DateSelectorProps) {
  const handleSetDate = (dateType: DatePreset) => {
    const newDate = getPresetDate(dateType);
    onSelectDate(newDate);
  };

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">Date</span>
        <span className="text-muted-foreground text-xs">T</span>
      </div>
      <TooltipProvider delayDuration={300}>
        <div className="mt-1 flex items-center gap-3">
          {dateOptions.map((option) => (
            <Tooltip key={option.type}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetDate(option.type);
                  }}
                  className="hover:bg-accent cursor-pointer rounded p-1 transition-colors"
                >
                  <Calendar className={`${option.color} size-4`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{option.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

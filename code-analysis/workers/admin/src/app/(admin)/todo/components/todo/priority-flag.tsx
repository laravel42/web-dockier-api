import { Flag } from "lucide-react";

import { cn } from "@/lib/utils";

import { getPriorityColor, type Priority } from "../../lib/config/priorities";

interface PriorityFlagProps {
  priority?: Priority;
  className?: string;
}

export function PriorityFlag({ priority, className }: PriorityFlagProps) {
  if (!priority) return null;

  return (
    <Flag
      className={cn(
        "size-3.5 transition-all duration-200 ease-out",
        getPriorityColor(priority),
        className,
      )}
    />
  );
}

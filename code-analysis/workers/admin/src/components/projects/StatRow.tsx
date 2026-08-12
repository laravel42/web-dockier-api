import * as React from "react";

import { cn } from "@/lib/utils";

type StatRowProps = {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function StatRow({ label, value, icon, className }: StatRowProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="text-muted-foreground flex w-30 shrink-0 items-center gap-2 text-sm">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="text-foreground flex-1 text-left text-sm font-medium">
        {value}
      </div>
    </div>
  );
}

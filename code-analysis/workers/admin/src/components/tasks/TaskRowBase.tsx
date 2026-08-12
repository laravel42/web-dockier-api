"use client";

import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type TaskRowBaseProps = {
  checked: boolean;
  title: string;
  onCheckedChange?: () => void;
  titleAriaLabel?: string;
  titleSuffix?: ReactNode;
  meta?: ReactNode;
  className?: string;
  subtitle?: ReactNode;
};

export function TaskRowBase({
  checked,
  title,
  onCheckedChange,
  titleAriaLabel,
  titleSuffix,
  meta,
  className,
  subtitle,
}: TaskRowBaseProps) {
  return (
    <div
      className={cn(
        "hover:bg-muted/60 flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
        className,
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={titleAriaLabel ?? title}
        className="border-border bg-background rounded-full hover:cursor-pointer data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-600"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "max-w-[60vw] flex-1 truncate text-left sm:max-w-none",
              checked && "text-muted-foreground line-through",
            )}
          >
            {title}
          </span>
          {titleSuffix}
        </div>
        {subtitle && (
          <div
            className={cn(
              "text-muted-foreground mt-0.5 truncate text-xs",
              checked && "line-through opacity-70",
            )}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-3 text-xs">
        {meta}
      </div>
    </div>
  );
}

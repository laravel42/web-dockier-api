import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type MetaChip = {
  label: string;
  value: string | ReactNode;
  icon?: ReactNode;
};

type MetaChipsRowProps = {
  items: MetaChip[];
};

export function MetaChipsRow({ items }: MetaChipsRowProps) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2 text-xs">
      {items.map((item, idx) => (
        <div
          key={`${item.label}-${idx}`}
          className={cn(
            "flex min-w-0 items-center gap-3",
            "border-border/70 bg-muted/25 rounded-full border px-2.5 py-1.5",
            "sm:border-0 sm:bg-transparent sm:px-0 sm:py-0",
          )}
        >
          <div className="text-muted-foreground flex min-w-0 items-center gap-2">
            {item.icon ? (
              <span className="text-muted-foreground">{item.icon}</span>
            ) : null}
            {item.label && (
              <span className="text-muted-foreground">{item.label}:</span>
            )}
            <span className="text-foreground min-w-0 truncate font-medium">
              {item.value}
            </span>
          </div>
          {idx < items.length - 1 ? (
            <Separator orientation="vertical" className="hidden h-4 sm:block" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

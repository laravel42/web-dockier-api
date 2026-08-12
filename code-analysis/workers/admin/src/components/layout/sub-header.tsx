"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useSearch } from "@/components/search-provider";
import { Button } from "@/components/ui/button";
import { site } from "@/data/site";
import {
  breadcrumbTailFromPath,
  type BreadcrumbTailOverride,
  humanizePathSegment,
} from "@/lib/breadcrumb-tail-from-path";
import { cn } from "@/lib/utils";

export type SubHeaderBreadcrumbPreset =
  | "original-users"
  | "original-tasks"
  | "original-settings"
  | "developers";

const BREADCRUMB_PRESET_OVERRIDES: Record<
  SubHeaderBreadcrumbPreset,
  Readonly<Record<string, BreadcrumbTailOverride>>
> = {
  "original-users": {
    users: (segs) => (segs.length > 1 ? "Profile" : undefined),
  },
  "original-tasks": {
    tasks: (segs) => (segs.length > 1 ? "Details" : undefined),
  },
  "original-settings": {
    settings: (segs) =>
      segs.length === 1
        ? "General"
        : humanizePathSegment(segs[segs.length - 1]!),
  },
  developers: {
    webhooks: (segs) => (segs.length > 1 ? "Details" : "Webhooks"),
  },
};

function mergeBreadcrumbOverrides(
  preset: SubHeaderBreadcrumbPreset | undefined,
  stringOverrides: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, BreadcrumbTailOverride>> | undefined {
  const fromPreset = preset ? BREADCRUMB_PRESET_OVERRIDES[preset] : undefined;
  if (!fromPreset && !stringOverrides) return undefined;
  return { ...fromPreset, ...stringOverrides };
}

/** Shared root breadcrumb (`site.title`) + section + optional tail + search bar. */
export function SubHeader({
  section,
  searchName,
  searchAriaLabel,
  sectionSegment,
  breadcrumbPreset,
  breadcrumbOverrides,
  className,
  endContent,
}: {
  section: string;
  searchName: string;
  searchAriaLabel: string;
  /** First URL segment under which routes hang (e.g. `ecommerce`, `original`, `developers`). */
  sectionSegment: string;
  /** Built-in dynamic tail rules (function overrides live here so parents can stay Server Components). */
  breadcrumbPreset?: SubHeaderBreadcrumbPreset;
  /** String-only overrides (serializable from Server Components). Merged after preset rules. */
  breadcrumbOverrides?: Readonly<Record<string, string>>;
  className?: string;
  endContent?: ReactNode;
}) {
  const pathname = usePathname();
  const mergedOverrides = mergeBreadcrumbOverrides(
    breadcrumbPreset,
    breadcrumbOverrides,
  );
  const breadcrumbTail = breadcrumbTailFromPath(
    pathname,
    sectionSegment,
    mergedOverrides,
  );
  const { setOpen } = useSearch();
  const commandAriaLabel = searchAriaLabel.replace(
    /^Search\b/i,
    "Open command palette for",
  );

  return (
    <header
      className={cn(
        "bg-background hidden shrink-0 border-b px-4 py-4 sm:px-6 md:block",
        className,
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
          <span className="text-foreground font-medium">{site.title}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">{section}</span>
          {breadcrumbTail ? (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{breadcrumbTail}</span>
            </>
          ) : null}
        </div>

        <div className="relative xl:mx-auto xl:w-full xl:max-w-md">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label={commandAriaLabel}
            aria-keyshortcuts="Meta+K Control+K"
            data-search-name={searchName}
            className="bg-muted/70 text-muted-foreground hover:bg-muted/90 hover:text-foreground h-10 w-full justify-start rounded-full border-none px-3 font-normal shadow-none"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">
              Search pages or run commands
            </span>
            <kbd className="bg-background pointer-events-none hidden h-6 shrink-0 items-center gap-1 rounded-full border px-2 font-mono text-[10px] font-medium opacity-100 select-none sm:inline-flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        {endContent ? (
          <div className="flex items-center gap-2 xl:ml-auto">{endContent}</div>
        ) : null}
      </div>
    </header>
  );
}

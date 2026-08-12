"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { HeaderUtilityActions } from "@/components/layout/header-utility-actions";
import { useSearch } from "@/components/search-provider";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { site } from "@/data/site";

function titleFromPathname(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (segment && segment in site.dashboardAppTitle) {
    return site.dashboardAppTitle[
      segment as keyof typeof site.dashboardAppTitle
    ];
  }
  return site.title;
}

interface HeaderProps {
  /** When omitted, derived from the first URL segment (`site.dashboardAppTitle` or `site.title`). */
  title?: string;
}

export function Header({ title: titleProp }: HeaderProps) {
  const pathname = usePathname();
  const title = titleProp ?? titleFromPathname(pathname);
  const searchAriaLabel = `Open command palette (${title})`;
  const { setOpen: setCommandOpen } = useSearch();

  return (
    <header className="bg-background grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-4 py-4 sm:gap-3 sm:px-6">
      <SidebarTrigger className="size-8 shrink-0" />
      <div className="min-w-0">
        <h1 className="truncate text-base font-medium">{title}</h1>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="text-muted-foreground hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center gap-0 p-0 sm:w-auto sm:gap-2 sm:px-2.5"
          onClick={() => setCommandOpen(true)}
          aria-label={searchAriaLabel}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <kbd className="bg-muted text-muted-foreground pointer-events-none hidden rounded-md border px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex">
            {"\u2318"}
            {"\u00a0"}K
          </kbd>
        </Button>
        <HeaderUtilityActions />
      </div>
    </header>
  );
}

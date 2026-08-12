"use client";

import { FolderKanban, Plus, RotateCcw, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  filterAndSortProjects,
  mutedControlClassName,
  ProjectCard,
  type ProjectState,
  type SortOption,
  statusOptions,
  type TeamSizeFilter,
  type UpdatedWindowFilter,
} from "./project-list-shared";

type SidebarVariant = "quick-views" | "stacked-filters" | "compact-nav";

type SavedView = "all" | "active" | "archived" | "recent" | "3" | "4+";

type SidebarProjectsProps = {
  variant: SidebarVariant;
  title: string;
  description: string;
};

function SidebarButton({
  active,
  onClick,
  className,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition-colors lg:h-auto lg:py-2",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function EmptyProjects({ onReset }: { onReset: () => void }) {
  return (
    <div className="border-border/60 bg-card flex min-h-48 w-full items-center justify-center rounded-xl border border-dashed dark:border-white/10 dark:bg-[#161616]">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium dark:text-zinc-100">
          No projects match the current filters
        </p>
        <p className="text-muted-foreground text-sm dark:text-zinc-500">
          Adjust the sidebar filters or reset them to see the full project list.
        </p>
        <Button
          variant="outline"
          size="sm"
          className={cn("mt-2 h-8 gap-1.5", mutedControlClassName)}
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" />
          Reset filters
        </Button>
      </div>
    </div>
  );
}

export function ProjectListSidebarVariant({
  variant,
  title,
  description,
}: SidebarProjectsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [teamSizeFilter, setTeamSizeFilter] = useState<TeamSizeFilter>("all");
  const [updatedWindow, setUpdatedWindow] =
    useState<UpdatedWindowFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ProjectState[]>(["Active"]);
  const [savedView, setSavedView] = useState<SavedView>("active");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const hasFiltersApplied =
    deferredSearchQuery.trim().length > 0 ||
    sortOption !== "newest" ||
    teamSizeFilter !== "all" ||
    updatedWindow !== "all" ||
    statusFilter.length !== 1 ||
    statusFilter[0] !== "Active";

  const resetFilters = () => {
    setSearchQuery("");
    setSortOption("newest");
    setTeamSizeFilter("all");
    setUpdatedWindow("all");
    setStatusFilter(["Active"]);
    setSavedView("active");
  };

  const setSingleStatus = (state: ProjectState | "all") => {
    setStatusFilter(state === "all" ? ["Active", "Archived"] : [state]);
  };

  const applySavedView = (view: SavedView) => {
    setSavedView(view);

    if (view === "all") {
      setStatusFilter(["Active", "Archived"]);
      setTeamSizeFilter("all");
      setUpdatedWindow("all");
      return;
    }

    if (view === "active") {
      setStatusFilter(["Active"]);
      setTeamSizeFilter("all");
      setUpdatedWindow("all");
      return;
    }

    if (view === "archived") {
      setStatusFilter(["Archived"]);
      setTeamSizeFilter("all");
      setUpdatedWindow("all");
      return;
    }

    if (view === "recent") {
      setStatusFilter(["Active", "Archived"]);
      setTeamSizeFilter("all");
      setUpdatedWindow("7");
      return;
    }

    if (view === "3") {
      setStatusFilter(["Active", "Archived"]);
      setTeamSizeFilter("3");
      setUpdatedWindow("all");
      return;
    }

    setStatusFilter(["Active", "Archived"]);
    setTeamSizeFilter("4+");
    setUpdatedWindow("all");
  };

  const visibleProjects = useMemo(
    () =>
      filterAndSortProjects({
        searchQuery: deferredSearchQuery,
        sortOption,
        teamSizeFilter,
        updatedWindow,
        statusFilter,
      }),
    [
      deferredSearchQuery,
      sortOption,
      statusFilter,
      teamSizeFilter,
      updatedWindow,
    ],
  );

  const titleSuffix =
    variant === "quick-views"
      ? "Browse curated views for your projects."
      : variant === "stacked-filters"
        ? "Refine the grid with simple sidebar filters."
        : "A compact sidebar for faster browsing.";

  return (
    <main
      id="main-content"
      className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.035),transparent_28%)]"
    >
      <div className="border-b dark:border-white/8 dark:bg-[#111111]/95">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium dark:text-zinc-100">
            <FolderKanban className="text-muted-foreground size-4 shrink-0 dark:text-zinc-500" />
            <span className="truncate">{title}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {hasFiltersApplied ? (
              <Button
                variant="ghost"
                size="sm"
                className="hidden h-8 gap-1.5 px-2.5 sm:inline-flex dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            ) : null}

            <Button
              size="sm"
              className="size-8 gap-1.5 p-0 sm:h-8 sm:w-auto sm:px-3"
              aria-label="Add project"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add Project</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 border-b px-4 py-4 sm:px-6 lg:w-[280px] lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-5 lg:py-5 dark:border-white/8">
          <div className="flex flex-col gap-3 lg:gap-5">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 dark:text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search projects..."
                className="h-10 rounded-xl pl-9 text-sm shadow-none dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            {variant === "quick-views" ? (
              <div className="horizontal-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
                <SidebarButton
                  active={savedView === "all"}
                  onClick={() => applySavedView("all")}
                  className="w-auto shrink-0 px-4 lg:w-full lg:px-3"
                >
                  <span>Browse all</span>
                </SidebarButton>
                <SidebarButton
                  active={savedView === "active"}
                  onClick={() => applySavedView("active")}
                  className="w-auto shrink-0 px-4 lg:w-full lg:px-3"
                >
                  <span>Active</span>
                </SidebarButton>
                <SidebarButton
                  active={savedView === "archived"}
                  onClick={() => applySavedView("archived")}
                  className="w-auto shrink-0 px-4 lg:w-full lg:px-3"
                >
                  <span>Archived</span>
                </SidebarButton>
                <SidebarButton
                  active={savedView === "recent"}
                  onClick={() => applySavedView("recent")}
                  className="w-auto shrink-0 px-4 lg:w-full lg:px-3"
                >
                  <span>Recently updated</span>
                </SidebarButton>
                <SidebarButton
                  active={savedView === "3"}
                  onClick={() => applySavedView("3")}
                  className="w-auto shrink-0 px-4 lg:w-full lg:px-3"
                >
                  <span>3-member teams</span>
                </SidebarButton>
                <SidebarButton
                  active={savedView === "4+"}
                  onClick={() => applySavedView("4+")}
                  className="w-auto shrink-0 px-4 lg:w-full lg:px-3"
                >
                  <span>4+ member teams</span>
                </SidebarButton>
              </div>
            ) : null}

            {variant !== "quick-views" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:flex-col lg:gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground px-3 text-xs font-medium tracking-[0.14em] uppercase">
                    Status
                  </p>
                  <SidebarButton
                    active={statusFilter.length === 2}
                    onClick={() => setSingleStatus("all")}
                  >
                    <span>All projects</span>
                  </SidebarButton>
                  {statusOptions.map((state) => (
                    <SidebarButton
                      key={state}
                      active={
                        statusFilter.length === 1 && statusFilter[0] === state
                      }
                      onClick={() => setSingleStatus(state)}
                    >
                      <span>{state}</span>
                    </SidebarButton>
                  ))}
                </div>

                <Separator className="hidden lg:block" />

                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground px-3 text-xs font-medium tracking-[0.14em] uppercase">
                    Team Size
                  </p>
                  <SidebarButton
                    active={teamSizeFilter === "all"}
                    onClick={() => setTeamSizeFilter("all")}
                  >
                    <span>Any team size</span>
                  </SidebarButton>
                  <SidebarButton
                    active={teamSizeFilter === "3"}
                    onClick={() => setTeamSizeFilter("3")}
                  >
                    <span>3 members</span>
                  </SidebarButton>
                  <SidebarButton
                    active={teamSizeFilter === "4+"}
                    onClick={() => setTeamSizeFilter("4+")}
                  >
                    <span>4+ members</span>
                  </SidebarButton>
                </div>

                <Separator className="hidden lg:block" />

                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground px-3 text-xs font-medium tracking-[0.14em] uppercase">
                    Updated
                  </p>
                  <SidebarButton
                    active={updatedWindow === "all"}
                    onClick={() => setUpdatedWindow("all")}
                  >
                    <span>Any time</span>
                  </SidebarButton>
                  <SidebarButton
                    active={updatedWindow === "7"}
                    onClick={() => setUpdatedWindow("7")}
                  >
                    <span>Last 7 days</span>
                  </SidebarButton>
                  <SidebarButton
                    active={updatedWindow === "14"}
                    onClick={() => setUpdatedWindow("14")}
                  >
                    <span>Last 14 days</span>
                  </SidebarButton>
                </div>
              </div>
            ) : null}

            {variant === "compact-nav" ? (
              <>
                <Separator />
                <div className="border-border/70 bg-muted/30 rounded-2xl border p-4 dark:border-white/8 dark:bg-white/[0.03]">
                  <p className="text-sm font-medium">Current view</p>
                  <p className="text-muted-foreground pt-1 text-sm">
                    {statusFilter.length === 2
                      ? "All project states"
                      : `${statusFilter[0]} projects`}{" "}
                    with{" "}
                    {teamSizeFilter === "all"
                      ? "any team size"
                      : teamSizeFilter === "3"
                        ? "3 members"
                        : "4+ members"}
                    .
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b px-4 py-4 sm:px-6 dark:border-white/8">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {title}
                  </h1>
                  <p className="text-muted-foreground pt-1 text-sm">
                    {visibleProjects.length}{" "}
                    {visibleProjects.length === 1 ? "project" : "projects"} in
                    this view
                  </p>
                  <p className="sr-only">
                    {description} {titleSuffix}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                <Select
                  value={sortOption}
                  onValueChange={(value) => setSortOption(value as SortOption)}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 w-full gap-1.5 rounded-md shadow-none sm:w-[156px]",
                      mutedControlClassName,
                    )}
                    aria-label="Sort projects"
                  >
                    <SelectValue placeholder="Sort projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="name-asc">Name A-Z</SelectItem>
                    <SelectItem value="name-desc">Name Z-A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent_12%)]">
            {visibleProjects.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    className="max-w-none"
                  />
                ))}
                <button
                  type="button"
                  className="border-border/60 bg-background text-muted-foreground hover:border-border/80 hover:text-foreground flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center text-sm transition-colors hover:border-solid"
                >
                  <Plus className="mb-2 size-5" />
                  Create new project
                </button>
              </div>
            ) : (
              <EmptyProjects onReset={resetFilters} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

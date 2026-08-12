"use client";

import {
  Check,
  FolderKanban,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  filterAndSortProjects,
  mutedControlClassName,
  ProjectCardLarge,
  type ProjectState,
  type SortOption,
  statusOptions,
  type TeamSizeFilter,
  type UpdatedWindowFilter,
} from "./project-list-shared";

export function ProjectManagementProjectList1() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [teamSizeFilter, setTeamSizeFilter] = useState<TeamSizeFilter>("all");
  const [updatedWindow, setUpdatedWindow] =
    useState<UpdatedWindowFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ProjectState[]>(["Active"]);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const hasFiltersApplied =
    deferredSearchQuery.trim().length > 0 ||
    sortOption !== "newest" ||
    teamSizeFilter !== "all" ||
    updatedWindow !== "all" ||
    statusFilter.length !== 1 ||
    statusFilter[0] !== "Active";

  const activeFilterCount =
    (teamSizeFilter !== "all" ? 1 : 0) +
    (updatedWindow !== "all" ? 1 : 0) +
    (statusFilter.length !== 1 || statusFilter[0] !== "Active" ? 1 : 0);

  const toggleStatus = (state: ProjectState) => {
    setStatusFilter((current) => {
      const next = current.includes(state)
        ? current.filter((value) => value !== state)
        : [...current, state];

      return next.length > 0 ? next : current;
    });
  };

  const resetFilters = () => {
    setSearchQuery("");
    setSortOption("newest");
    setTeamSizeFilter("all");
    setUpdatedWindow("all");
    setStatusFilter(["Active"]);
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

  return (
    <main
      id="main-content"
      className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.035),transparent_28%)]"
    >
      <div className="border-b dark:border-white/8 dark:bg-[#111111]/95">
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:min-h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium dark:text-zinc-100">
              <FolderKanban className="text-muted-foreground size-4 shrink-0 dark:text-zinc-500" />
              <span className="truncate">Projects</span>
            </div>
            <Button
              size="sm"
              className="size-8 shrink-0 gap-1.5 p-0 sm:w-auto sm:px-3 lg:hidden"
              aria-label="Add project"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add Project</span>
            </Button>
          </div>

          <div className="grid min-w-0 grid-cols-2 items-center gap-2 lg:flex lg:flex-wrap lg:justify-end">
            <div className="relative col-span-2 w-full lg:col-span-1 lg:w-[220px]">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 dark:text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search projects..."
                className="h-9 rounded-md pl-8 text-sm shadow-none lg:h-8 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <Select
              value={sortOption}
              onValueChange={(value) => setSortOption(value as SortOption)}
            >
              <SelectTrigger
                className={cn(
                  "h-9 w-full gap-1.5 shadow-none lg:h-8 lg:w-[156px]",
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

            <Select
              value={teamSizeFilter}
              onValueChange={(value) =>
                setTeamSizeFilter(value as TeamSizeFilter)
              }
            >
              <SelectTrigger
                className={cn(
                  "h-9 w-full gap-1.5 shadow-none lg:h-8 lg:w-[132px]",
                  mutedControlClassName,
                )}
                aria-label="Filter by team size"
              >
                <SelectValue placeholder="Team size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Team size</SelectItem>
                <SelectItem value="3">3 members</SelectItem>
                <SelectItem value="4+">4+ members</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "col-span-2 h-9 w-full gap-1.5 sm:col-span-1 lg:h-8 lg:w-auto",
                    mutedControlClassName,
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <span className="rounded-sm bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-950 dark:bg-zinc-800 dark:text-zinc-100">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-xs font-medium text-zinc-500">
                  Status
                </div>
                {statusOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option}
                    checked={statusFilter.includes(option)}
                    onCheckedChange={() => toggleStatus(option)}
                  >
                    {option}
                  </DropdownMenuCheckboxItem>
                ))}
                <div className="bg-border my-1 h-px" />
                <div className="px-2 py-1.5 text-xs font-medium text-zinc-500">
                  Updated
                </div>
                <DropdownMenuCheckboxItem
                  checked={updatedWindow === "7"}
                  onCheckedChange={() =>
                    setUpdatedWindow((current) =>
                      current === "7" ? "all" : "7",
                    )
                  }
                >
                  Last 7 days
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={updatedWindow === "14"}
                  onCheckedChange={() =>
                    setUpdatedWindow((current) =>
                      current === "14" ? "all" : "14",
                    )
                  }
                >
                  Last 14 days
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasFiltersApplied ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-full gap-1.5 px-2.5 lg:h-8 lg:w-auto dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            ) : null}

            <Button size="sm" className="hidden h-8 gap-1.5 lg:inline-flex">
              <Plus className="size-3.5" />
              Add Project
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent_12%)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm dark:text-zinc-500">
            {visibleProjects.length}{" "}
            {visibleProjects.length === 1 ? "project" : "projects"}
            {hasFiltersApplied ? " matching the current filters" : ""}
          </p>

          {statusFilter.length > 0 ? (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {statusFilter.map((state) => (
                <span
                  key={state}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs dark:border-white/10 dark:bg-zinc-950/60 dark:text-zinc-300"
                >
                  <Check className="size-3" />
                  {state}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.length > 0 ? (
            visibleProjects.map((project) => (
              <ProjectCardLarge key={project.id} project={project} />
            ))
          ) : (
            <div className="border-border/60 bg-card flex min-h-48 w-full items-center justify-center rounded-xl border border-dashed dark:border-white/10 dark:bg-[#161616]">
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm font-medium dark:text-zinc-100">
                  No projects match the current filters
                </p>
                <p className="text-muted-foreground text-sm dark:text-zinc-500">
                  Adjust the filters or reset them to see the full project list.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("mt-2 h-8 gap-1.5", mutedControlClassName)}
                  onClick={resetFilters}
                >
                  <RotateCcw className="size-3.5" />
                  Reset filters
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

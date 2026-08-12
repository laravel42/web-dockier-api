"use client";

import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FolderKanban,
  ListFilter,
  type LucideIcon,
  Plus,
  Shield,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  getProjectManagementInitials,
  type ProjectManagementMember,
  projectManagementMembers,
  type ProjectManagementTeam,
  projectManagementTeams,
} from "./people-data";
import {
  filterAndSortProjects,
  mutedControlClassName,
  type ProjectRecord,
  projects,
  type SortOption,
} from "./project-list-shared";

type HealthId = "steady" | "watching" | "blocked" | "needs-update";
type ProjectFilterType = "health" | "teams" | "sort";

type ProjectHealth = {
  id: HealthId;
  label: string;
  icon: LucideIcon;
  className: string;
};

type ProjectMilestone = {
  label: string;
  dueDate: string;
  tone: "default" | "quiet" | "attention";
};

type ProjectTableMeta = {
  health: ProjectHealth;
  milestone: ProjectMilestone;
  owner: ProjectManagementMember;
  team: ProjectManagementTeam;
  updatedAt: string;
};

const healthOptions: ProjectHealth[] = [
  {
    id: "steady",
    label: "Steady",
    icon: CheckCircle2,
    className: "text-green-500",
  },
  {
    id: "watching",
    label: "Watching",
    icon: Activity,
    className: "text-blue-500",
  },
  {
    id: "blocked",
    label: "Blocked",
    icon: AlertCircle,
    className: "text-amber-500",
  },
  {
    id: "needs-update",
    label: "Needs update",
    icon: CircleHelp,
    className: "text-muted-foreground",
  },
];

const milestones: ProjectMilestone[] = [
  { label: "Scope review", dueDate: "2026-04-24", tone: "default" },
  { label: "Beta handoff", dueDate: "2026-04-30", tone: "attention" },
  { label: "QA window", dueDate: "2026-05-07", tone: "quiet" },
  { label: "Launch prep", dueDate: "2026-05-15", tone: "default" },
  { label: "Risk readout", dueDate: "2026-05-22", tone: "attention" },
  { label: "Ops review", dueDate: "2026-06-03", tone: "quiet" },
];

const updatedDates = [
  "2026-04-16",
  "2026-04-15",
  "2026-04-14",
  "2026-04-12",
  "2026-04-10",
  "2026-04-08",
];

const sortLabels: Record<SortOption, string> = {
  newest: "Recently updated",
  oldest: "Oldest updates",
  "name-asc": "Project A-Z",
  "name-desc": "Project Z-A",
};

const projectMeta = projects.reduce<Record<string, ProjectTableMeta>>(
  (details, project, index) => {
    details[project.id] = {
      health: healthOptions[(index * 2 + 1) % healthOptions.length],
      milestone: milestones[(index * 3 + 2) % milestones.length],
      owner:
        projectManagementMembers[
          (index * 5 + 2) % projectManagementMembers.length
        ],
      team: projectManagementTeams[
        (index * 3 + 1) % projectManagementTeams.length
      ],
      updatedAt: updatedDates[index % updatedDates.length],
    };

    return details;
  },
  {},
);

function ProjectFilterControl({
  healthFilters,
  teamFilters,
  sort,
  onToggleHealth,
  onToggleTeam,
  onSetSort,
  onClearFilters,
}: {
  healthFilters: HealthId[];
  teamFilters: string[];
  sort: SortOption;
  onToggleHealth: (health: HealthId) => void;
  onToggleTeam: (teamId: string) => void;
  onSetSort: (sort: SortOption) => void;
  onClearFilters: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ProjectFilterType | null>(null);
  const activeFilterCount =
    healthFilters.length + teamFilters.length + (sort !== "newest" ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "relative h-9 w-full justify-center gap-1.5 px-2.5 lg:h-8 lg:w-auto lg:border-transparent lg:bg-transparent lg:shadow-none",
            mutedControlClassName,
          )}
        >
          <ListFilter className="size-3.5" />
          Filter
          {activeFilterCount > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        {active === null ? (
          <Command>
            <CommandList>
              <CommandGroup>
                <CommandItem
                  onSelect={() => setActive("health")}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Shield className="size-4 text-zinc-500" />
                    Delivery health
                  </span>
                  <div className="flex items-center">
                    {healthFilters.length > 0 ? (
                      <span className="mr-1 text-xs text-zinc-500">
                        {healthFilters.length}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4" />
                  </div>
                </CommandItem>
                <CommandItem
                  onSelect={() => setActive("teams")}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <UsersRound className="size-4 text-zinc-500" />
                    Owning team
                  </span>
                  <div className="flex items-center">
                    {teamFilters.length > 0 ? (
                      <span className="mr-1 text-xs text-zinc-500">
                        {teamFilters.length}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4" />
                  </div>
                </CommandItem>
                <CommandItem
                  onSelect={() => setActive("sort")}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <ArrowUpDown className="size-4 text-zinc-500" />
                    Sort by
                  </span>
                  <ChevronRight className="size-4" />
                </CommandItem>
              </CommandGroup>
              {activeFilterCount > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem onSelect={onClearFilters}>
                      Clear all filters
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        ) : active === "health" ? (
          <Command>
            <div className="flex items-center border-b p-2">
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => setActive(null)}
              >
                <ChevronRight className="size-4 rotate-180" />
              </Button>
              <span className="ml-2 text-sm font-medium">Delivery health</span>
            </div>
            <CommandList>
              <CommandGroup>
                {healthOptions.map((health) => {
                  const Icon = health.icon;

                  return (
                    <CommandItem
                      key={health.id}
                      onSelect={() => onToggleHealth(health.id)}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className={cn("size-4", health.className)} />
                        {health.label}
                      </span>
                      {healthFilters.includes(health.id) ? (
                        <CheckCircle2 className="size-4" />
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : active === "teams" ? (
          <Command>
            <div className="flex items-center border-b p-2">
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => setActive(null)}
              >
                <ChevronRight className="size-4 rotate-180" />
              </Button>
              <span className="ml-2 text-sm font-medium">Owning team</span>
            </div>
            <CommandList>
              <CommandGroup>
                {projectManagementTeams.map((team) => (
                  <CommandItem
                    key={team.id}
                    onSelect={() => onToggleTeam(team.id)}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="bg-muted/60 flex size-6 items-center justify-center rounded-md text-xs">
                        {team.icon}
                      </span>
                      {team.name}
                    </span>
                    {teamFilters.includes(team.id) ? (
                      <CheckCircle2 className="size-4" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <Command>
            <div className="flex items-center border-b p-2">
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => setActive(null)}
              >
                <ChevronRight className="size-4 rotate-180" />
              </Button>
              <span className="ml-2 text-sm font-medium">Sort by</span>
            </div>
            <CommandList>
              <CommandGroup>
                {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                  <CommandItem
                    key={option}
                    onSelect={() => onSetSort(option)}
                    className="flex items-center justify-between"
                  >
                    {sortLabels[option]}
                    {sort === option ? (
                      <CheckCircle2 className="size-4" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ProjectLine({ project }: { project: ProjectRecord }) {
  const meta = projectMeta[project.id];
  const HealthIcon = meta.health.icon;
  const milestoneTone =
    meta.milestone.tone === "attention"
      ? "text-amber-600 dark:text-amber-400"
      : meta.milestone.tone === "quiet"
        ? "text-muted-foreground"
        : "text-foreground";

  return (
    <div className="hover:bg-muted/40 flex min-w-[920px] items-center border-b px-4 py-3 text-sm transition-colors last:border-b-0 sm:px-6 lg:min-w-0 dark:border-white/8 dark:hover:bg-white/4">
      <div className="w-[300px] shrink-0 lg:w-[34%] lg:shrink">
        <div className="flex items-center gap-2">
          <div className="bg-muted/60 flex size-7 shrink-0 items-center justify-center rounded-md dark:bg-zinc-900/80">
            <FolderKanban className="size-3.5 text-zinc-500 dark:text-zinc-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium dark:text-zinc-100">
              {project.name}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {project.code}
            </p>
          </div>
        </div>
      </div>

      <div className="w-[150px] shrink-0 lg:w-[14%] lg:shrink">
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarImage src={meta.owner.avatar} alt={meta.owner.name} />
            <AvatarFallback className="text-[10px]">
              {getProjectManagementInitials(meta.owner.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-xs font-medium dark:text-zinc-100">
            {meta.owner.name}
          </span>
        </div>
      </div>

      <div className="w-[130px] shrink-0 pl-2 lg:w-[13%] lg:shrink">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 justify-start gap-1 px-2 text-xs font-medium"
        >
          <HealthIcon className={cn("size-3.5", meta.health.className)} />
          <span>{meta.health.label}</span>
        </Button>
      </div>

      <div className="w-[150px] shrink-0 pl-2 lg:w-[16%] lg:shrink">
        <div className="flex flex-col gap-0.5">
          <span className={cn("truncate text-xs font-medium", milestoneTone)}>
            {meta.milestone.label}
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <CalendarDays className="size-3.5" />
            {format(new Date(meta.milestone.dueDate), "MMM d")}
          </span>
        </div>
      </div>

      <div className="w-[120px] shrink-0 pl-2 lg:w-[13%] lg:shrink">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium dark:text-zinc-400">
          <span className="bg-muted/60 flex size-6 items-center justify-center rounded-md text-xs">
            {meta.team.icon}
          </span>
          <span className="truncate">{meta.team.id}</span>
        </div>
      </div>

      <div className="w-[90px] shrink-0 pl-2 lg:w-[10%] lg:shrink">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium dark:text-zinc-400">
          <Clock3 className="size-3.5 shrink-0" />
          <span>{format(new Date(meta.updatedAt), "MMM d")}</span>
        </div>
      </div>
    </div>
  );
}

export function ProjectManagementProjectList3() {
  const [healthFilters, setHealthFilters] = useState<HealthId[]>([]);
  const [teamFilters, setTeamFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("newest");

  const visibleProjects = useMemo(() => {
    const sortedProjects = filterAndSortProjects({
      searchQuery: "",
      sortOption: sort,
      teamSizeFilter: "all",
      updatedWindow: "all",
      statusFilter: ["Active", "Archived"],
    });

    return sortedProjects.filter((project) => {
      const meta = projectMeta[project.id];
      const matchesHealth =
        healthFilters.length === 0 || healthFilters.includes(meta.health.id);
      const matchesTeam =
        teamFilters.length === 0 || teamFilters.includes(meta.team.id);

      return matchesHealth && matchesTeam;
    });
  }, [healthFilters, sort, teamFilters]);

  const hasFiltersApplied =
    healthFilters.length > 0 || teamFilters.length > 0 || sort !== "newest";

  const toggleHealth = (value: HealthId) => {
    setHealthFilters((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  const toggleTeam = (value: string) => {
    setTeamFilters((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  const resetFilters = () => {
    setHealthFilters([]);
    setTeamFilters([]);
    setSort("newest");
  };

  return (
    <main
      id="main-content"
      className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.035),transparent_28%)]"
    >
      <div className="border-b dark:border-white/8 dark:bg-[#111111]/95">
        <div className="flex flex-col gap-2 px-4 py-3 sm:px-6 lg:min-h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium dark:text-zinc-100">
              <span className="truncate">Projects</span>
              <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs dark:bg-zinc-900 dark:text-zinc-300">
                {projects.length}
              </span>
            </div>
            <Button
              size="sm"
              className="size-9 shrink-0 gap-1.5 p-0 sm:w-auto sm:px-3 lg:hidden"
              aria-label="Add project"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add Project</span>
            </Button>
          </div>

          <div className="grid min-w-0 grid-cols-2 items-center gap-2 lg:flex lg:flex-wrap lg:justify-end">
            <ProjectFilterControl
              healthFilters={healthFilters}
              teamFilters={teamFilters}
              sort={sort}
              onToggleHealth={toggleHealth}
              onToggleTeam={toggleTeam}
              onSetSort={setSort}
              onClearFilters={resetFilters}
            />

            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 w-full justify-center gap-1.5 lg:h-8 lg:w-auto",
                mutedControlClassName,
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              Display
            </Button>

            {hasFiltersApplied ? (
              <Button
                variant="ghost"
                size="sm"
                className="col-span-2 h-9 w-full gap-1.5 px-2.5 lg:h-8 lg:w-auto dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                onClick={resetFilters}
              >
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

      <div className="flex-1 overflow-auto dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent_12%)]">
        <div className="bg-background sticky top-0 z-10 min-w-[920px] border-b px-4 py-2 text-sm text-zinc-500 sm:px-6 lg:min-w-0 dark:border-white/8 dark:bg-[#141414]/95 dark:text-zinc-400">
          <div className="flex items-center">
            <div className="w-[300px] shrink-0 lg:w-[34%] lg:shrink">
              Project
            </div>
            <div className="w-[150px] shrink-0 lg:w-[14%] lg:shrink">Owner</div>
            <div className="w-[130px] shrink-0 pl-2 lg:w-[13%] lg:shrink">
              Health
            </div>
            <div className="w-[150px] shrink-0 pl-2 lg:w-[16%] lg:shrink">
              Milestone
            </div>
            <div className="w-[120px] shrink-0 pl-2 lg:w-[13%] lg:shrink">
              Team
            </div>
            <div className="w-[90px] shrink-0 pl-2 lg:w-[10%] lg:shrink">
              Updated
            </div>
          </div>
        </div>

        {visibleProjects.length > 0 ? (
          <div>
            {visibleProjects.map((project) => (
              <ProjectLine key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-72 items-center justify-center px-4 py-8 sm:px-6">
            <div className="border-border/60 bg-card w-full rounded-xl border border-dashed p-8 text-center dark:border-white/10 dark:bg-[#161616]">
              <p className="text-sm font-medium dark:text-zinc-100">
                No projects match the current filters
              </p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Adjust the health or owner filters to bring projects back into
                view.
              </p>
              <Button
                variant="outline"
                size="sm"
                className={cn("mt-4 h-8 gap-1.5", mutedControlClassName)}
                onClick={resetFilters}
              >
                Reset filters
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

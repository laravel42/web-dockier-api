"use client";

import { format } from "date-fns";
import {
  ArrowUpDown,
  CheckIcon,
  ChevronRight,
  Clock3,
  FolderKanban,
  Gauge,
  ListFilter,
  Plus,
  Shield,
  SlidersHorizontal,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  getProjectManagementInitials,
  getProjectManagementTeamMembers,
  getProjectManagementTeamProjects,
  type ProjectManagementMember,
  type ProjectManagementProjectSummary,
  type ProjectManagementTeam,
  projectManagementTeams,
} from "./people-data";

type TeamFocus = "Revenue" | "Experience" | "Delivery" | "Platform";
type TeamFilterType = "focus" | "identifiers" | "sort";
type TeamSort =
  | "name-asc"
  | "name-desc"
  | "members-asc"
  | "members-desc"
  | "projects-asc"
  | "projects-desc";

type TeamRecord = ProjectManagementTeam & {
  focus: TeamFocus;
  sla: string;
  openWork: number;
  lastActivity: string;
  members: ProjectManagementMember[];
  projects: ProjectManagementProjectSummary[];
};

const mutedControlClassName =
  "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground";

const focusOptions: TeamFocus[] = [
  "Revenue",
  "Experience",
  "Delivery",
  "Platform",
];
const slaOptions = ["4h", "8h", "12h", "24h"];
const activityDates = [
  "2026-04-16",
  "2026-04-15",
  "2026-04-13",
  "2026-04-11",
  "2026-04-09",
];

function TeamMembersTooltip({
  members,
}: {
  members: ProjectManagementMember[];
}) {
  const displayedMembers = members.slice(0, 3);
  const remainingCount = members.length - displayedMembers.length;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`View ${members.length} maintainers`}
          className="flex -space-x-2 transition-transform hover:translate-x-0.5"
        >
          {displayedMembers.map((member) => (
            <Avatar
              key={member.id}
              className="border-background size-7 border-2 dark:border-[#141414]"
            >
              <AvatarImage src={member.avatar} alt={member.name} />
              <AvatarFallback className="text-[10px]">
                {getProjectManagementInitials(member.name)}
              </AvatarFallback>
            </Avatar>
          ))}
          {remainingCount > 0 ? (
            <span className="bg-muted text-muted-foreground border-background flex size-7 items-center justify-center rounded-full border-2 text-[10px] font-medium dark:border-[#141414] dark:bg-zinc-900 dark:text-zinc-300">
              +{remainingCount}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent className="w-72 p-3">
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-2">
              <Avatar className="size-7">
                <AvatarImage src={member.avatar} alt={member.name} />
                <AvatarFallback className="text-[10px]">
                  {getProjectManagementInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {member.email} - {member.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function TeamProjectsTooltip({
  projects,
}: {
  projects: ProjectManagementProjectSummary[];
}) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`View ${projects.length} linked projects`}
          className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium dark:text-zinc-400"
        >
          <FolderKanban className="size-3.5" />
          {projects.length}
        </button>
      </TooltipTrigger>
      <TooltipContent className="w-64 p-3">
        <div className="flex flex-col gap-2">
          {projects.map((project) => (
            <div key={project.id} className="flex items-center gap-2">
              <FolderKanban className="size-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {project.code}
                </p>
              </div>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function TeamFilterControl({
  focusFilters,
  identifierFilters,
  sort,
  onToggleFocus,
  onToggleIdentifier,
  onSetSort,
  onClearFilters,
}: {
  focusFilters: TeamFocus[];
  identifierFilters: string[];
  sort: TeamSort;
  onToggleFocus: (focus: TeamFocus) => void;
  onToggleIdentifier: (identifier: string) => void;
  onSetSort: (value: TeamSort) => void;
  onClearFilters: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TeamFilterType | null>(null);
  const activeFilterCount = focusFilters.length + identifierFilters.length;

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
                  onSelect={() => setActive("focus")}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Gauge className="size-4 text-zinc-500" />
                    Focus area
                  </span>
                  <div className="flex items-center">
                    {focusFilters.length > 0 ? (
                      <span className="mr-1 text-xs text-zinc-500">
                        {focusFilters.length}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4" />
                  </div>
                </CommandItem>
                <CommandItem
                  onSelect={() => setActive("identifiers")}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Shield className="size-4 text-zinc-500" />
                    Identifiers
                  </span>
                  <div className="flex items-center">
                    {identifierFilters.length > 0 ? (
                      <span className="mr-1 text-xs text-zinc-500">
                        {identifierFilters.length}
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
        ) : active === "focus" ? (
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
              <span className="ml-2 text-sm font-medium">Focus area</span>
            </div>
            <CommandList>
              <CommandGroup>
                {focusOptions.map((focus) => (
                  <CommandItem
                    key={focus}
                    onSelect={() => onToggleFocus(focus)}
                    className="flex items-center justify-between"
                  >
                    {focus}
                    {focusFilters.includes(focus) ? (
                      <CheckIcon className="size-4" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : active === "identifiers" ? (
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
              <span className="ml-2 text-sm font-medium">Identifiers</span>
            </div>
            <CommandList>
              <CommandGroup>
                {projectManagementTeams.map((team) => (
                  <CommandItem
                    key={team.id}
                    onSelect={() => onToggleIdentifier(team.id)}
                    className="flex items-center justify-between"
                  >
                    {team.id}
                    {identifierFilters.includes(team.id) ? (
                      <CheckIcon className="size-4" />
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
              <CommandGroup heading="Team">
                <CommandItem
                  onSelect={() => onSetSort("name-asc")}
                  className="flex items-center justify-between"
                >
                  A-Z
                  {sort === "name-asc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
                <CommandItem
                  onSelect={() => onSetSort("name-desc")}
                  className="flex items-center justify-between"
                >
                  Z-A
                  {sort === "name-desc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Open work">
                <CommandItem
                  onSelect={() => onSetSort("projects-asc")}
                  className="flex items-center justify-between"
                >
                  Lowest first
                  {sort === "projects-asc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
                <CommandItem
                  onSelect={() => onSetSort("projects-desc")}
                  className="flex items-center justify-between"
                >
                  Highest first
                  {sort === "projects-desc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Maintainers">
                <CommandItem
                  onSelect={() => onSetSort("members-asc")}
                  className="flex items-center justify-between"
                >
                  Fewest first
                  {sort === "members-asc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
                <CommandItem
                  onSelect={() => onSetSort("members-desc")}
                  className="flex items-center justify-between"
                >
                  Most first
                  {sort === "members-desc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TeamLine({ team }: { team: TeamRecord }) {
  return (
    <div className="hover:bg-muted/40 flex min-w-[860px] items-center border-b px-4 py-3 text-sm transition-colors last:border-b-0 sm:px-6 lg:min-w-0 dark:border-white/8 dark:hover:bg-white/4">
      <div className="w-[300px] shrink-0 lg:w-[30%] lg:shrink">
        <div className="flex items-center gap-2">
          <div className="bg-muted/60 flex size-7 shrink-0 items-center justify-center rounded-md text-sm dark:bg-zinc-900/80">
            {team.icon}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium dark:text-zinc-100">
              {team.name}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {team.id}
            </p>
          </div>
        </div>
      </div>
      <div className="w-[120px] shrink-0 text-xs text-zinc-500 lg:w-[14%] lg:shrink dark:text-zinc-400">
        {team.focus}
      </div>
      <div className="w-[100px] shrink-0 lg:w-[12%] lg:shrink">
        <span className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium">
          <Clock3 className="size-3.5" />
          {team.sla}
        </span>
      </div>
      <div className="w-[150px] shrink-0 lg:w-[16%] lg:shrink">
        {team.members.length > 0 ? (
          <TeamMembersTooltip members={team.members} />
        ) : null}
      </div>
      <div className="flex w-[120px] shrink-0 lg:w-[14%] lg:shrink">
        <div className="flex items-center gap-3">
          <TeamProjectsTooltip projects={team.projects} />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {team.openWork} open
          </span>
        </div>
      </div>
      <div className="w-[90px] shrink-0 pl-2 lg:w-[14%] lg:shrink">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium dark:text-zinc-400">
          <Clock3 className="size-3.5 shrink-0" />
          <span>{format(new Date(team.lastActivity), "MMM d")}</span>
        </div>
      </div>
    </div>
  );
}

export function ProjectManagementTeamList1() {
  const [focusFilters, setFocusFilters] = useState<TeamFocus[]>([]);
  const [identifierFilters, setIdentifierFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<TeamSort>("name-asc");

  const teams = useMemo<TeamRecord[]>(
    () =>
      projectManagementTeams.map((team, index) => {
        const projects = getProjectManagementTeamProjects(team.id);

        return {
          ...team,
          focus: focusOptions[index % focusOptions.length],
          sla: slaOptions[(index * 2 + 1) % slaOptions.length],
          openWork: projects.length * 3 + ((index * 2) % 5),
          lastActivity: activityDates[index % activityDates.length],
          members: getProjectManagementTeamMembers(team.id),
          projects,
        };
      }),
    [],
  );

  const visibleTeams = useMemo(() => {
    let filtered = teams.filter((team) => {
      const matchesFocus =
        focusFilters.length === 0 || focusFilters.includes(team.focus);
      const matchesIdentifier =
        identifierFilters.length === 0 || identifierFilters.includes(team.id);

      return matchesFocus && matchesIdentifier;
    });

    filtered = [...filtered].sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "members-asc":
          return a.members.length - b.members.length;
        case "members-desc":
          return b.members.length - a.members.length;
        case "projects-asc":
          return a.openWork - b.openWork;
        case "projects-desc":
          return b.openWork - a.openWork;
      }
    });

    return filtered;
  }, [focusFilters, identifierFilters, sort, teams]);

  const hasFiltersApplied =
    focusFilters.length > 0 ||
    identifierFilters.length > 0 ||
    sort !== "name-asc";

  const activeFilterCount = focusFilters.length + identifierFilters.length;

  const toggleFocus = (value: TeamFocus) => {
    setFocusFilters((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  const toggleIdentifier = (value: string) => {
    setIdentifierFilters((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  const resetFilters = () => {
    setFocusFilters([]);
    setIdentifierFilters([]);
    setSort("name-asc");
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
              <span className="truncate">Teams</span>
              <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs dark:bg-zinc-900 dark:text-zinc-300">
                {teams.length}
              </span>
            </div>
            <Button
              size="sm"
              className="size-9 shrink-0 gap-1.5 p-0 sm:w-auto sm:px-3 lg:hidden"
              aria-label="Add team"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add Team</span>
            </Button>
          </div>

          <div className="grid min-w-0 grid-cols-2 items-center gap-2 lg:flex lg:flex-wrap lg:justify-end">
            <TeamFilterControl
              focusFilters={focusFilters}
              identifierFilters={identifierFilters}
              sort={sort}
              onToggleFocus={toggleFocus}
              onToggleIdentifier={toggleIdentifier}
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
                {activeFilterCount > 0 ? (
                  <span className="rounded-sm bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-950 dark:bg-zinc-800 dark:text-zinc-100">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            ) : null}

            <Button size="sm" className="hidden h-8 gap-1.5 lg:inline-flex">
              <Plus className="size-3.5" />
              Add Team
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent_12%)]">
        <div className="min-w-[860px] border-b px-4 py-2 text-sm text-zinc-500 sm:px-6 lg:min-w-0 dark:border-white/8 dark:bg-[#141414]/95 dark:text-zinc-400">
          <div className="flex items-center">
            <div className="w-[300px] shrink-0 lg:w-[30%] lg:shrink">Team</div>
            <div className="w-[120px] shrink-0 lg:w-[14%] lg:shrink">Focus</div>
            <div className="w-[100px] shrink-0 lg:w-[12%] lg:shrink">SLA</div>
            <div className="w-[150px] shrink-0 lg:w-[16%] lg:shrink">
              Maintainers
            </div>
            <div className="w-[120px] shrink-0 lg:w-[14%] lg:shrink">
              Open work
            </div>
            <div className="w-[90px] shrink-0 pl-2 lg:w-[14%] lg:shrink">
              Activity
            </div>
          </div>
        </div>

        {visibleTeams.length > 0 ? (
          <div>
            {visibleTeams.map((team) => (
              <TeamLine key={team.id} team={team} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-72 items-center justify-center px-4 py-8 sm:px-6">
            <div className="border-border/60 bg-card w-full rounded-xl border border-dashed p-8 text-center dark:border-white/10 dark:bg-[#161616]">
              <p className="text-sm font-medium dark:text-zinc-100">
                No teams match the current filters
              </p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Adjust the focus or identifier filters to see more teams.
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

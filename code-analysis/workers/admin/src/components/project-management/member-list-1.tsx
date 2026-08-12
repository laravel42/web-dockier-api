"use client";

import { format } from "date-fns";
import {
  ArrowUpDown,
  CheckCircle2,
  CheckIcon,
  ChevronRight,
  CircleDotDashed,
  Clock3,
  ContactRound,
  ListFilter,
  type LucideIcon,
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
  getProjectManagementMemberTeams,
  type ProjectManagementMember,
  type ProjectManagementMemberRole,
  projectManagementMembers,
  type ProjectManagementMemberStatus,
  projectManagementStatusColors,
  type ProjectManagementTeam,
} from "./people-data";

type MemberFilterType = "availability" | "role" | "sort";
type MemberSort =
  | "name-asc"
  | "name-desc"
  | "joined-asc"
  | "joined-desc"
  | "teams-asc"
  | "teams-desc";

type MemberRecord = ProjectManagementMember & {
  teams: ProjectManagementTeam[];
};

const mutedControlClassName =
  "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground";

const roles: ProjectManagementMemberRole[] = ["Guest", "Member", "Admin"];
const statuses: ProjectManagementMemberStatus[] = ["online", "away", "offline"];

const statusDetails: Record<
  ProjectManagementMemberStatus,
  {
    label: string;
    icon: LucideIcon;
    className: string;
  }
> = {
  online: {
    label: "Available",
    icon: CheckCircle2,
    className: "text-green-500",
  },
  away: {
    label: "Away",
    icon: Clock3,
    className: "text-amber-500",
  },
  offline: {
    label: "Offline",
    icon: CircleDotDashed,
    className: "text-zinc-500",
  },
};

function MemberTeamsTooltip({ teams }: { teams: ProjectManagementTeam[] }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`View ${teams.length} teams`}
          className="text-muted-foreground flex items-center gap-1 truncate text-xs font-medium dark:text-zinc-400"
        >
          <ContactRound className="size-3.5 shrink-0" />
          <span className="truncate">
            {teams
              .slice(0, 2)
              .map((team) => team.id)
              .join(", ")}
            {teams.length > 2 ? ` +${teams.length - 2}` : ""}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="w-56 p-3">
        <div className="space-y-2">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center gap-2">
              <div className="bg-muted/60 flex size-7 shrink-0 items-center justify-center rounded-md text-sm dark:bg-zinc-900/80">
                {team.icon}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{team.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {team.id}
                </p>
              </div>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function MemberFilterControl({
  statusFilters,
  roleFilters,
  sort,
  onToggleStatus,
  onToggleRole,
  onSetSort,
  onClearFilters,
}: {
  statusFilters: ProjectManagementMemberStatus[];
  roleFilters: ProjectManagementMemberRole[];
  sort: MemberSort;
  onToggleStatus: (status: ProjectManagementMemberStatus) => void;
  onToggleRole: (role: ProjectManagementMemberRole) => void;
  onSetSort: (value: MemberSort) => void;
  onClearFilters: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<MemberFilterType | null>(null);
  const activeFilterCount =
    statusFilters.length + roleFilters.length + (sort !== "name-asc" ? 1 : 0);

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
                  onSelect={() => setActive("availability")}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-zinc-500" />
                    Availability
                  </span>
                  <div className="flex items-center">
                    {statusFilters.length > 0 ? (
                      <span className="mr-1 text-xs text-zinc-500">
                        {statusFilters.length}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4" />
                  </div>
                </CommandItem>
                <CommandItem
                  onSelect={() => setActive("role")}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Shield className="size-4 text-zinc-500" />
                    Role
                  </span>
                  <div className="flex items-center">
                    {roleFilters.length > 0 ? (
                      <span className="mr-1 text-xs text-zinc-500">
                        {roleFilters.length}
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
        ) : active === "availability" ? (
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
              <span className="ml-2 text-sm font-medium">Availability</span>
            </div>
            <CommandList>
              <CommandGroup>
                {statuses.map((status) => {
                  const statusDetail = statusDetails[status];
                  const Icon = statusDetail.icon;

                  return (
                    <CommandItem
                      key={status}
                      onSelect={() => onToggleStatus(status)}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Icon
                          className={cn("size-4", statusDetail.className)}
                        />
                        {statusDetail.label}
                      </span>
                      {statusFilters.includes(status) ? (
                        <CheckIcon className="size-4" />
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : active === "role" ? (
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
              <span className="ml-2 text-sm font-medium">Role</span>
            </div>
            <CommandList>
              <CommandGroup>
                {roles.map((role) => (
                  <CommandItem
                    key={role}
                    onSelect={() => onToggleRole(role)}
                    className="flex items-center justify-between"
                  >
                    {role}
                    {roleFilters.includes(role) ? (
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
              <CommandGroup heading="Name">
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
              <CommandGroup heading="Joined">
                <CommandItem
                  onSelect={() => onSetSort("joined-asc")}
                  className="flex items-center justify-between"
                >
                  Oldest first
                  {sort === "joined-asc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
                <CommandItem
                  onSelect={() => onSetSort("joined-desc")}
                  className="flex items-center justify-between"
                >
                  Newest first
                  {sort === "joined-desc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Teams">
                <CommandItem
                  onSelect={() => onSetSort("teams-asc")}
                  className="flex items-center justify-between"
                >
                  Fewest first
                  {sort === "teams-asc" ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </CommandItem>
                <CommandItem
                  onSelect={() => onSetSort("teams-desc")}
                  className="flex items-center justify-between"
                >
                  Most first
                  {sort === "teams-desc" ? (
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

function MemberLine({ member }: { member: MemberRecord }) {
  const statusDetail = statusDetails[member.status];
  const StatusIcon = statusDetail.icon;

  return (
    <div className="hover:bg-muted/40 flex min-w-[900px] items-center border-b px-4 py-3 text-sm transition-colors last:border-b-0 sm:px-6 lg:min-w-0 dark:border-white/8 dark:hover:bg-white/4">
      <div className="w-[320px] shrink-0 lg:w-[36%] lg:shrink">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src={member.avatar} alt={member.name} />
              <AvatarFallback>
                {getProjectManagementInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <span
              className="border-background absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 dark:border-[#141414]"
              style={{
                backgroundColor: projectManagementStatusColors[member.status],
              }}
            >
              <span className="sr-only">{member.status}</span>
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium dark:text-zinc-100">
              {member.name}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {member.email}
            </p>
          </div>
        </div>
      </div>

      <div className="w-[150px] shrink-0 lg:w-[16%] lg:shrink">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={cn("size-4 shrink-0", statusDetail.className)}
          />
          <span className="truncate text-xs font-medium dark:text-zinc-100">
            {statusDetail.label}
          </span>
        </div>
      </div>

      <div className="w-[100px] shrink-0 text-xs text-zinc-500 lg:w-[14%] lg:shrink dark:text-zinc-400">
        {member.role}
      </div>

      <div className="flex w-[220px] shrink-0 lg:w-[20%] lg:shrink">
        <MemberTeamsTooltip teams={member.teams} />
      </div>

      <div className="w-[110px] shrink-0 text-xs text-zinc-500 lg:w-[14%] lg:shrink dark:text-zinc-400">
        {format(new Date(member.joinedDate), "MMM yyyy")}
      </div>
    </div>
  );
}

export function ProjectManagementMemberList1() {
  const [statusFilters, setStatusFilters] = useState<
    ProjectManagementMemberStatus[]
  >([]);
  const [roleFilters, setRoleFilters] = useState<ProjectManagementMemberRole[]>(
    [],
  );
  const [sort, setSort] = useState<MemberSort>("name-asc");

  const members = useMemo<MemberRecord[]>(
    () =>
      projectManagementMembers.map((member) => ({
        ...member,
        teams: getProjectManagementMemberTeams(member.id),
      })),
    [],
  );

  const visibleMembers = useMemo(() => {
    let filtered = members.filter((member) => {
      const matchesStatus =
        statusFilters.length === 0 || statusFilters.includes(member.status);
      const matchesRole =
        roleFilters.length === 0 || roleFilters.includes(member.role);

      return matchesStatus && matchesRole;
    });

    filtered = [...filtered].sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "joined-asc":
          return (
            new Date(a.joinedDate).getTime() - new Date(b.joinedDate).getTime()
          );
        case "joined-desc":
          return (
            new Date(b.joinedDate).getTime() - new Date(a.joinedDate).getTime()
          );
        case "teams-asc":
          return a.teams.length - b.teams.length;
        case "teams-desc":
          return b.teams.length - a.teams.length;
      }
    });

    return filtered;
  }, [members, statusFilters, roleFilters, sort]);

  const hasFiltersApplied =
    statusFilters.length > 0 || roleFilters.length > 0 || sort !== "name-asc";

  const toggleStatus = (value: ProjectManagementMemberStatus) => {
    setStatusFilters((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  const toggleRole = (value: ProjectManagementMemberRole) => {
    setRoleFilters((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

  const resetFilters = () => {
    setStatusFilters([]);
    setRoleFilters([]);
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
              <span className="truncate">Members</span>
              <span className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-0.5 text-xs dark:bg-zinc-900 dark:text-zinc-300">
                {members.length}
              </span>
            </div>
            <Button
              size="sm"
              className="size-9 shrink-0 gap-1.5 p-0 sm:w-auto sm:px-3 lg:hidden"
              aria-label="Invite member"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Invite Member</span>
            </Button>
          </div>

          <div className="grid min-w-0 grid-cols-2 items-center gap-2 lg:flex lg:flex-wrap lg:justify-end">
            <MemberFilterControl
              statusFilters={statusFilters}
              roleFilters={roleFilters}
              sort={sort}
              onToggleStatus={toggleStatus}
              onToggleRole={toggleRole}
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
                {statusFilters.length + roleFilters.length > 0 ? (
                  <span className="rounded-sm bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-950 dark:bg-zinc-800 dark:text-zinc-100">
                    {statusFilters.length + roleFilters.length}
                  </span>
                ) : null}
              </Button>
            ) : null}

            <Button size="sm" className="hidden h-8 gap-1.5 lg:inline-flex">
              <Plus className="size-3.5" />
              Invite Member
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent_12%)]">
        <div className="min-w-[900px] border-b px-4 py-2 text-sm text-zinc-500 sm:px-6 lg:min-w-0 dark:border-white/8 dark:bg-[#141414]/95 dark:text-zinc-400">
          <div className="flex items-center">
            <div className="w-[320px] shrink-0 lg:w-[36%] lg:shrink">
              Member
            </div>
            <div className="w-[150px] shrink-0 lg:w-[16%] lg:shrink">
              Availability
            </div>
            <div className="w-[100px] shrink-0 lg:w-[14%] lg:shrink">Role</div>
            <div className="w-[220px] shrink-0 lg:w-[20%] lg:shrink">Teams</div>
            <div className="w-[110px] shrink-0 lg:w-[14%] lg:shrink">
              Joined
            </div>
          </div>
        </div>

        {visibleMembers.length > 0 ? (
          <div>
            {visibleMembers.map((member) => (
              <MemberLine key={member.id} member={member} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-72 items-center justify-center px-4 py-8 sm:px-6">
            <div className="border-border/60 bg-card w-full rounded-xl border border-dashed p-8 text-center dark:border-white/10 dark:bg-[#161616]">
              <p className="text-sm font-medium dark:text-zinc-100">
                No members match the current filters
              </p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Adjust the selected availability or roles to bring team members
                back into view.
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

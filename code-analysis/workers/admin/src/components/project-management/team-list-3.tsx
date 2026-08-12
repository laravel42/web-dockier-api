"use client";

import { format } from "date-fns";
import {
  ChevronUp,
  LayoutGrid,
  ListTodo,
  Plus,
  Search,
  SlidersHorizontal,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  getProjectManagementInitials,
  getProjectManagementMemberTeams,
  type ProjectManagementMember,
  projectManagementMembers,
  projectManagementStatusColors,
  type ProjectManagementTeam,
} from "./people-data";

type TeamTaskCard = ProjectManagementMember & {
  teams: ProjectManagementTeam[];
  tasks: string[];
};

const statusStyles = {
  online:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-300",
  away: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-300",
  offline:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/35 dark:text-orange-300",
};

const statusLabels = {
  online: "Active",
  away: "Part-time",
  offline: "Remote",
};

const taskTemplates = [
  [
    "Review handoff notes for active project owners",
    "Prepare dependency summary for weekly sync",
    "Follow up on blocked implementation details",
  ],
  [
    "Create spec for task dependency logic",
    "Define review queue for cross-team work",
  ],
  [
    "Audit calendar ownership with project leads",
    "Confirm launch checklist assignments",
    "Write QA notes for reopened work",
  ],
  [
    "Collaborate on schema-driven task flow",
    "Review rate limiting strategy with backend team",
    "Draft acceptance criteria for release module",
  ],
];

function TeamTaskCard({ member }: { member: TeamTaskCard }) {
  const phoneNumber = `(${200 + member.name.length * 7}) 555-${String(
    1000 + member.id.length * 13,
  ).slice(0, 4)}`;

  return (
    <article className="flex min-h-[276px] flex-col rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#151515] dark:hover:border-white/18">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="size-9 border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
            <AvatarImage src={member.avatar} alt={member.name} />
            <AvatarFallback className="text-xs">
              {getProjectManagementInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <span
            className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-white dark:border-[#151515]"
            style={{
              backgroundColor: projectManagementStatusColors[member.status],
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-zinc-950 dark:text-zinc-100">
              {member.name}
            </h2>
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                statusStyles[member.status],
              )}
            >
              {statusLabels[member.status]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {format(new Date(member.joinedDate), "MMM d, yyyy")}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
            Tasks
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-7 rounded-md">
              <Plus className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 rounded-md">
              <ChevronUp className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {member.tasks.map((task) => (
            <div
              key={task}
              className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400"
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900" />
              <span className="line-clamp-1">{task}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto border-t border-dashed border-zinc-200 pt-4 dark:border-white/10">
        <div className="min-w-0 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <p className="truncate">{member.email}</p>
          <div className="flex items-center justify-between gap-4 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{phoneNumber}</span>
            <span className="shrink-0">{member.teams.length} teams</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProjectManagementTeamList3() {
  const [query, setQuery] = useState("");

  const members = useMemo<TeamTaskCard[]>(
    () =>
      projectManagementMembers.slice(0, 8).map((member, index) => ({
        ...member,
        teams: getProjectManagementMemberTeams(member.id),
        tasks: taskTemplates[index % taskTemplates.length],
      })),
    [],
  );

  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return members;
    }

    return members.filter((member) => {
      const searchable = [
        member.name,
        member.email,
        member.role,
        ...member.tasks,
        ...member.teams.flatMap((team) => [team.name, team.id]),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [members, query]);

  return (
    <main
      id="main-content"
      className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="border-b bg-white dark:border-white/8 dark:bg-[#111111]">
        <div className="px-4 pt-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Teams</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                Team Tasks
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="gap-2">
                <UserPlus className="size-4" />
                New Member
              </Button>
            </div>
          </div>

          <div className="mt-6 flex gap-6 overflow-x-auto text-sm">
            {[
              { label: "Workload", icon: UsersRound, active: true },
              { label: "Departments", icon: LayoutGrid },
              { label: "Task pool", icon: ListTodo },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-0 pb-3 text-zinc-500 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100",
                    item.active
                      ? "border-zinc-950 text-zinc-950 dark:border-zinc-100 dark:text-zinc-100"
                      : "border-transparent",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/80 dark:bg-[#0f0f0f]">
        <div className="grid gap-3 border-b bg-white px-4 py-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center dark:border-white/8 dark:bg-[#111111]">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-100">
              Workload
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {visibleMembers.length} teammate task cards
            </p>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:justify-end">
            <div className="relative col-span-2 sm:col-span-1 sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks..."
                className="h-9 bg-white pl-9 dark:bg-zinc-950"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <SlidersHorizontal className="size-4" />
              Filter
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {visibleMembers.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleMembers.map((member) => (
                <TeamTaskCard key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed bg-white p-8 text-center dark:border-white/10 dark:bg-[#151515]">
              <div>
                <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
                  No task cards found
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Try another teammate, department, or task keyword.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

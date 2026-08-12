"use client";

import { format } from "date-fns";
import {
  Check,
  Copy,
  LayoutGrid,
  ListTodo,
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

type TeamMemberCard = ProjectManagementMember & {
  teams: ProjectManagementTeam[];
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

function TeamMemberCard({
  member,
  copiedEmailId,
  onCopyEmail,
}: {
  member: TeamMemberCard;
  copiedEmailId: string | null;
  onCopyEmail: (member: TeamMemberCard) => void;
}) {
  const primaryTeam = member.teams[0];
  const isEmailCopied = copiedEmailId === member.id;
  const phoneNumber = `(${200 + member.name.length * 7}) 555-${String(
    1000 + member.id.length * 13,
  ).slice(0, 4)}`;

  return (
    <article className="group relative flex min-h-[248px] flex-col rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#151515] dark:hover:border-white/18">
      <div className="flex items-start justify-between gap-3">
        <div className="relative">
          <Avatar className="size-14 border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900">
            <AvatarImage src={member.avatar} alt={member.name} />
            <AvatarFallback className="text-sm">
              {getProjectManagementInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <span
            className="absolute right-0.5 bottom-0.5 size-3 rounded-full border-2 border-white dark:border-[#151515]"
            style={{
              backgroundColor: projectManagementStatusColors[member.status],
            }}
          />
        </div>

        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-1 text-[11px] font-medium",
            statusStyles[member.status],
          )}
        >
          {statusLabels[member.status]}
        </span>
      </div>

      <div className="mt-4 min-w-0">
        <h2 className="truncate text-[15px] font-semibold text-zinc-950 dark:text-zinc-100">
          {member.name}
        </h2>
        <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
          {member.role}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Team</p>
          <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {primaryTeam?.name ?? "Unassigned"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Joined</p>
          <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {format(new Date(member.joinedDate), "MMM d, yyyy")}
          </p>
        </div>
      </div>

      <div className="mt-4 min-w-0 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate">{member.email}</p>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 rounded-md text-zinc-400 hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-zinc-100"
            onClick={() => onCopyEmail(member)}
            aria-label={`Copy ${member.email}`}
          >
            {isEmailCopied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="truncate">{phoneNumber}</span>
          <span className="shrink-0">{member.teams.length} teams</span>
        </div>
      </div>
    </article>
  );
}

export function ProjectManagementTeamList2() {
  const [query, setQuery] = useState("");
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);

  const members = useMemo<TeamMemberCard[]>(
    () =>
      projectManagementMembers.map((member) => ({
        ...member,
        teams: getProjectManagementMemberTeams(member.id),
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
        member.status,
        ...member.teams.flatMap((team) => [team.name, team.id]),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [members, query]);

  const copyEmail = (member: TeamMemberCard) => {
    void navigator.clipboard?.writeText(member.email);
    setCopiedEmailId(member.id);
    window.setTimeout(() => setCopiedEmailId(null), 1400);
  };

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
                Teams
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
              { label: "Directory", icon: UsersRound, active: true },
              { label: "Departments", icon: LayoutGrid },
              { label: "Tasks", icon: ListTodo },
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
              Members
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {visibleMembers.length} people across active project teams
            </p>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:justify-end">
            <div className="relative col-span-2 sm:col-span-1 sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members..."
                className="h-9 bg-white pl-9 dark:bg-zinc-950"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <SlidersHorizontal className="size-4" />
              Filter
            </Button>
            <Button variant="outline" size="icon" className="size-9">
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {visibleMembers.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleMembers.map((member) => (
                <TeamMemberCard
                  key={member.id}
                  member={member}
                  copiedEmailId={copiedEmailId}
                  onCopyEmail={copyEmail}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed bg-white p-8 text-center dark:border-white/10 dark:bg-[#151515]">
              <div>
                <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100">
                  No members found
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Try a different name, team, or role.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

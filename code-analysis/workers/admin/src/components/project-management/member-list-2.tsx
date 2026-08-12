"use client";

import {
  ArrowUpDown,
  CheckCircle2,
  CircleDotDashed,
  Clock3,
  type LucideIcon,
  Mail,
  Phone,
  Plus,
  Search,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  getProjectManagementInitials,
  getProjectManagementMemberTeams,
  type ProjectManagementMember,
  projectManagementMembers,
  type ProjectManagementMemberStatus,
  projectManagementStatusColors,
  type ProjectManagementTeam,
} from "./people-data";

type MemberCardRecord = ProjectManagementMember & {
  phone: string;
  title: string;
  teams: ProjectManagementTeam[];
};

type MemberGridSort = "name-asc" | "name-desc" | "joined-desc";

const mutedControlClassName =
  "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground";

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

const memberTitles = [
  "Program lead",
  "Customer operations",
  "Delivery manager",
  "Release coordinator",
  "Field strategist",
  "Support partner",
  "Planning lead",
  "Experience owner",
];

const phoneNumbers = [
  "+1-202-555-0108",
  "+1-202-555-0146",
  "+1-202-555-0184",
  "+1-202-555-0129",
  "+1-202-555-0163",
  "+1-202-555-0197",
];

function MemberGridCard({ member }: { member: MemberCardRecord }) {
  const statusDetail = statusDetails[member.status];
  const StatusIcon = statusDetail.icon;

  return (
    <Card className="group overflow-hidden rounded-xl shadow-none transition-colors hover:border-zinc-300 dark:border-white/8 dark:bg-[#141414]/95 dark:hover:border-white/16">
      <CardHeader className="items-center gap-3 p-4 text-center">
        <div className="relative">
          <Avatar className="size-14 border dark:border-white/10">
            <AvatarImage src={member.avatar} alt={member.name} />
            <AvatarFallback>
              {getProjectManagementInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <span
            className="border-background absolute right-0.5 bottom-0.5 size-2.5 rounded-full border-2 dark:border-[#141414]"
            style={{
              backgroundColor: projectManagementStatusColors[member.status],
            }}
          />
        </div>

        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold dark:text-zinc-100">
            {member.name}
          </h3>
          <p className="text-muted-foreground mt-1 truncate text-xs dark:text-zinc-400">
            {member.title}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant="secondary" className="rounded-full">
            {member.role}
          </Badge>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs dark:text-zinc-400">
            <StatusIcon className={cn("size-3.5", statusDetail.className)} />
            {statusDetail.label}
          </span>
        </div>
      </CardHeader>

      <CardFooter className="divide-border border-t p-0 dark:divide-white/8 dark:border-white/8">
        <a
          href={`mailto:${member.email}`}
          className="hover:bg-muted/50 flex min-w-0 flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors dark:text-zinc-100 dark:hover:bg-white/5"
        >
          <Mail className="text-muted-foreground size-4 dark:text-zinc-500" />
          Email
        </a>
        <a
          href={`tel:${member.phone}`}
          className="hover:bg-muted/50 flex min-w-0 flex-1 items-center justify-center gap-2 border-l px-3 py-2.5 text-sm font-medium transition-colors dark:border-white/8 dark:text-zinc-100 dark:hover:bg-white/5"
        >
          <Phone className="text-muted-foreground size-4 dark:text-zinc-500" />
          Call
        </a>
      </CardFooter>
    </Card>
  );
}

export function ProjectManagementMemberList2() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<MemberGridSort>("name-asc");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const members = useMemo<MemberCardRecord[]>(
    () =>
      projectManagementMembers.map((member, index) => ({
        ...member,
        phone: phoneNumbers[index % phoneNumbers.length],
        title: memberTitles[(index * 3 + 1) % memberTitles.length],
        teams: getProjectManagementMemberTeams(member.id),
      })),
    [],
  );

  const visibleMembers = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return members
      .filter((member) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          member.name,
          member.email,
          member.title,
          member.role,
          member.teams.map((team) => team.name).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sort === "name-desc") {
          return b.name.localeCompare(a.name);
        }

        if (sort === "joined-desc") {
          return (
            new Date(b.joinedDate).getTime() - new Date(a.joinedDate).getTime()
          );
        }

        return a.name.localeCompare(b.name);
      });
  }, [deferredSearchQuery, members, sort]);

  const hasSearch = deferredSearchQuery.trim().length > 0;

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
                {visibleMembers.length}
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

          <div className="grid min-w-0 grid-cols-3 items-center gap-2 lg:flex lg:flex-wrap lg:justify-end">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 w-full justify-center gap-1.5 px-2 lg:h-8 lg:w-auto lg:px-3",
                mutedControlClassName,
              )}
              onClick={() =>
                setSort((current) =>
                  current === "name-asc" ? "name-desc" : "name-asc",
                )
              }
            >
              <ArrowUpDown className="size-3.5" />
              Sort
            </Button>

            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 w-full justify-center gap-1.5 px-2 lg:h-8 lg:w-auto lg:px-3",
                mutedControlClassName,
              )}
              onClick={() => setSort("joined-desc")}
            >
              <Shield className="size-3.5" />
              Recent
            </Button>

            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 w-full justify-center gap-1.5 px-2 lg:h-8 lg:w-auto lg:px-3",
                mutedControlClassName,
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              Display
            </Button>

            <Button size="sm" className="hidden h-8 gap-1.5 lg:inline-flex">
              <Plus className="size-3.5" />
              Invite Member
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.01),transparent_12%)]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight dark:text-zinc-100">
              Member List 2
            </h1>
            <p className="text-muted-foreground mt-1 text-sm dark:text-zinc-400">
              Contact-card grid with team ownership and quick member actions.
            </p>
          </div>

          <div className="relative w-full sm:max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 dark:text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search members..."
              className="h-9 pl-9 shadow-none dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
        </div>

        {visibleMembers.length > 0 ? (
          <ul
            role="list"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {visibleMembers.map((member) => (
              <li key={member.id}>
                <MemberGridCard member={member} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-border/60 bg-card flex min-h-72 items-center justify-center rounded-xl border border-dashed p-8 text-center dark:border-white/10 dark:bg-[#161616]">
            <div>
              <p className="text-sm font-medium dark:text-zinc-100">
                No members match the current search
              </p>
              <p className="text-muted-foreground mt-2 text-sm dark:text-zinc-400">
                Clear the search query to bring the contact cards back.
              </p>
              {hasSearch ? (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("mt-4 h-8", mutedControlClassName)}
                  onClick={() => setSearchQuery("")}
                >
                  Clear search
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

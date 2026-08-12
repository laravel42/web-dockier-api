"use client";

import {
  ArrowDownAZ,
  ArrowDownUp,
  ArrowUpAZ,
  CalendarDays,
  CircleX,
  Ellipsis,
  ListFilter,
  Mail,
  PlusCircle,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  getProjectManagementInitials,
  type ProjectManagementMember,
  type ProjectManagementMemberRole,
  projectManagementMembers,
} from "./people-data";

type MemberAccessRole = "Owner" | "Admin" | "Member" | "Viewer";
type MemberTab = "team" | "pending" | "suggested";
type MemberSort = "date-desc" | "date-asc" | "name-asc" | "name-desc";
type TwoFactorFilter = "all" | "enabled" | "disabled";
type RoleFilter = "all" | Lowercase<MemberAccessRole>;

type MemberRecord = ProjectManagementMember & {
  accessRole: MemberAccessRole;
  hasTwoFactor: boolean;
  tab: MemberTab;
};

type InviteRow = {
  id: string;
  email: string;
  role: Exclude<MemberAccessRole, "Owner">;
};

const accessRoles: Exclude<MemberAccessRole, "Owner">[] = [
  "Viewer",
  "Member",
  "Admin",
];

const fallbackSwatches = [
  "bg-emerald-500",
  "bg-fuchsia-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
];

const roleLabels: Record<RoleFilter, string> = {
  all: "All Team Roles",
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const twoFactorLabels: Record<TwoFactorFilter, string> = {
  all: "2FA Status",
  enabled: "Enabled",
  disabled: "Disabled",
};

const sortLabels: Record<MemberSort, string> = {
  "date-desc": "Date",
  "date-asc": "Oldest",
  "name-asc": "Name A-Z",
  "name-desc": "Name Z-A",
};

const roleByIndex: MemberAccessRole[] = [
  "Viewer",
  "Owner",
  "Admin",
  "Member",
  "Viewer",
  "Admin",
  "Member",
  "Viewer",
  "Member",
  "Admin",
  "Viewer",
  "Member",
];

function mapProjectRole(role: ProjectManagementMemberRole): MemberAccessRole {
  if (role === "Admin") {
    return "Admin";
  }

  if (role === "Guest") {
    return "Viewer";
  }

  return "Member";
}

function createMemberRecords(): MemberRecord[] {
  return projectManagementMembers.map((member, index) => ({
    ...member,
    accessRole: roleByIndex[index] ?? mapProjectRole(member.role),
    hasTwoFactor: index % 3 !== 2,
    tab: index < 2 ? "team" : index < 5 ? "pending" : "suggested",
  }));
}

function getRoleFilterValue(role: MemberAccessRole): RoleFilter {
  return role.toLowerCase() as RoleFilter;
}

function InviteRoleSelect({
  value,
  onValueChange,
}: {
  value: Exclude<MemberAccessRole, "Owner">;
  onValueChange: (value: Exclude<MemberAccessRole, "Owner">) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        onValueChange(nextValue as Exclude<MemberAccessRole, "Owner">)
      }
    >
      <SelectTrigger className="h-10 shadow-none">
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {accessRoles.map((role) => (
            <SelectItem key={role} value={role}>
              {role}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function MemberFilterSelect<TValue extends string>({
  value,
  label,
  icon,
  options,
  onValueChange,
}: {
  value: TValue;
  label: string;
  icon?: React.ReactNode;
  options: { label: string; value: TValue }[];
  onValueChange: (value: TValue) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
    >
      <SelectTrigger
        className={cn(
          "relative h-9 min-w-0 shadow-none lg:h-10 lg:min-w-40",
          icon && "pl-8 lg:pl-9",
        )}
      >
        {icon ? (
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 flex -translate-y-1/2 items-center lg:left-3 [&_svg]:size-3.5 lg:[&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <SelectValue>
          <span className="block truncate text-xs lg:text-sm">{label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function InvitePanel({
  inviteRows,
  onAddInviteRow,
  onChangeInviteRow,
  onInvite,
}: {
  inviteRows: InviteRow[];
  onAddInviteRow: () => void;
  onChangeInviteRow: (id: string, updates: Partial<InviteRow>) => void;
  onInvite: () => void;
}) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-4 p-5 sm:p-6">
        <div className="text-sm font-medium">
          Invite new members by email address
        </div>
        <Button type="button" size="sm" className="h-9" onClick={onInvite}>
          <UserPlus data-icon="inline-start" />
          Invite
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <FieldGroup className="gap-4">
          {inviteRows.map((row, index) => (
            <div
              key={row.id}
              className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)]"
            >
              <Field className="gap-2">
                {index === 0 ? (
                  <FieldLabel htmlFor={`invite-email-${row.id}`}>
                    Email Address
                  </FieldLabel>
                ) : (
                  <span className="sr-only">Email Address</span>
                )}
                <InputGroup>
                  <InputGroupAddon>
                    <Mail />
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`invite-email-${row.id}`}
                    value={row.email}
                    placeholder="jane@example.com"
                    onChange={(event) =>
                      onChangeInviteRow(row.id, { email: event.target.value })
                    }
                  />
                </InputGroup>
              </Field>

              <Field className="gap-2">
                {index === 0 ? (
                  <FieldLabel>Role</FieldLabel>
                ) : (
                  <span className="sr-only">Role</span>
                )}
                <InviteRoleSelect
                  value={row.role}
                  onValueChange={(role) => onChangeInviteRow(row.id, { role })}
                />
              </Field>
            </div>
          ))}
        </FieldGroup>

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={onAddInviteRow}
          >
            <PlusCircle data-icon="inline-start" />
            Add more
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberAvatar({
  member,
  index,
}: {
  member: MemberRecord;
  index: number;
}) {
  return (
    <Avatar className="size-9">
      <AvatarImage src={member.avatar} alt={member.name} />
      <AvatarFallback
        className={cn(
          "text-primary-foreground text-xs font-semibold",
          fallbackSwatches[index % fallbackSwatches.length],
        )}
      >
        {getProjectManagementInitials(member.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function TwoFactorStatus({ enabled }: { enabled: boolean }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      {enabled ? (
        <ShieldCheck className="text-muted-foreground" />
      ) : (
        <CircleX className="text-muted-foreground" />
      )}
      2FA
    </span>
  );
}

function MemberActions({ member }: { member: MemberRecord }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {member.accessRole !== "Owner" ? (
        <Button type="button" variant="outline" size="sm" className="h-9">
          Manage Access
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Open actions for ${member.name}`}
            className="size-8"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>{member.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>View profile</DropdownMenuItem>
            <DropdownMenuItem>Change role</DropdownMenuItem>
            <DropdownMenuItem>Resend invite</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            Remove access
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MemberTable({
  members,
  selectedIds,
  onToggleMember,
  onToggleAll,
}: {
  members: MemberRecord[];
  selectedIds: string[];
  onToggleMember: (id: string) => void;
  onToggleAll: () => void;
}) {
  const selectedVisibleCount = members.filter((member) =>
    selectedIds.includes(member.id),
  ).length;
  const allVisibleSelected =
    members.length > 0 && selectedVisibleCount === members.length;
  const hasPartialSelection =
    selectedVisibleCount > 0 && selectedVisibleCount < members.length;

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 px-4">
              <Checkbox
                aria-label="Select all visible members"
                checked={
                  allVisibleSelected
                    ? true
                    : hasPartialSelection
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={onToggleAll}
              />
            </TableHead>
            <TableHead className="min-w-72">
              {selectedVisibleCount > 0
                ? `${selectedVisibleCount} selected`
                : `Select all (${members.length})`}
            </TableHead>
            <TableHead className="hidden w-36 lg:table-cell">Role</TableHead>
            <TableHead className="hidden w-32 md:table-cell">
              Security
            </TableHead>
            <TableHead className="w-44 text-right">Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member, index) => (
            <TableRow
              key={member.id}
              data-state={
                selectedIds.includes(member.id) ? "selected" : undefined
              }
            >
              <TableCell className="px-4">
                <Checkbox
                  aria-label={`Select ${member.name}`}
                  checked={selectedIds.includes(member.id)}
                  onCheckedChange={() => onToggleMember(member.id)}
                />
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar member={member} index={index} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {member.name}
                    </div>
                    <div className="text-muted-foreground truncate text-sm">
                      {member.email}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs lg:hidden">
                      <span className="text-muted-foreground">
                        {member.accessRole}
                      </span>
                      <TwoFactorStatus enabled={member.hasTwoFactor} />
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground hidden lg:table-cell">
                {member.accessRole}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <TwoFactorStatus enabled={member.hasTwoFactor} />
              </TableCell>
              <TableCell>
                <MemberActions member={member} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ProjectManagementMemberList3() {
  const [activeTab, setActiveTab] = useState<MemberTab>("team");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [twoFactorFilter, setTwoFactorFilter] =
    useState<TwoFactorFilter>("all");
  const [sort, setSort] = useState<MemberSort>("date-desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([
    { id: "invite-1", email: "", role: "Member" },
  ]);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const members = useMemo(() => createMemberRecords(), []);

  const tabCounts = useMemo(
    () => ({
      team: members.filter((member) => member.tab === "team").length,
      pending: members.filter((member) => member.tab === "pending").length,
      suggested: members.filter((member) => member.tab === "suggested").length,
    }),
    [members],
  );

  const visibleMembers = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return members
      .filter((member) => {
        const matchesTab = member.tab === activeTab;
        const matchesRole =
          roleFilter === "all" ||
          getRoleFilterValue(member.accessRole) === roleFilter;
        const matchesTwoFactor =
          twoFactorFilter === "all" ||
          (twoFactorFilter === "enabled" && member.hasTwoFactor) ||
          (twoFactorFilter === "disabled" && !member.hasTwoFactor);
        const matchesSearch =
          !normalizedQuery ||
          [member.name, member.email, member.accessRole]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

        return matchesTab && matchesRole && matchesTwoFactor && matchesSearch;
      })
      .sort((a, b) => {
        if (sort === "name-asc") {
          return a.name.localeCompare(b.name);
        }

        if (sort === "name-desc") {
          return b.name.localeCompare(a.name);
        }

        if (sort === "date-asc") {
          return (
            new Date(a.joinedDate).getTime() - new Date(b.joinedDate).getTime()
          );
        }

        return (
          new Date(b.joinedDate).getTime() - new Date(a.joinedDate).getTime()
        );
      });
  }, [
    activeTab,
    deferredSearchQuery,
    members,
    roleFilter,
    sort,
    twoFactorFilter,
  ]);

  const toggleMember = (memberId: string) => {
    setSelectedIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  };

  const toggleAllVisibleMembers = () => {
    setSelectedIds((current) => {
      const visibleIds = visibleMembers.map((member) => member.id);
      const allSelected = visibleIds.every((id) => current.includes(id));

      if (allSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const addInviteRow = () => {
    setInviteRows((current) => [
      ...current,
      { id: `invite-${current.length + 1}`, email: "", role: "Member" },
    ]);
  };

  const updateInviteRow = (id: string, updates: Partial<InviteRow>) => {
    setInviteRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const inviteMembers = () => {
    const invitedEmails = inviteRows
      .map((row) => row.email.trim())
      .filter(Boolean);

    if (invitedEmails.length === 0) {
      toast({
        title: "Add an email address",
        description: "Enter at least one email before sending invites.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Invites prepared",
      description: `${invitedEmails.length} invitation${
        invitedEmails.length === 1 ? "" : "s"
      } ready to send.`,
    });
  };

  return (
    <main
      id="main-content"
      className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold">Members</h1>
            <p className="text-muted-foreground text-sm">
              Manage team members and invitations
            </p>
          </div>

          <InvitePanel
            inviteRows={inviteRows}
            onAddInviteRow={addInviteRow}
            onChangeInviteRow={updateInviteRow}
            onInvite={inviteMembers}
          />

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as MemberTab)}
            className="flex flex-col gap-3"
          >
            <div className="overflow-x-auto border-b">
              <TabsList className="inline-flex h-auto min-w-max justify-start gap-7 rounded-none bg-transparent p-0 sm:gap-8">
                <TabsTrigger
                  value="team"
                  className="data-[state=active]:border-foreground shrink-0 rounded-none border-b-2 border-transparent px-0 pb-3 text-sm shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:pb-4"
                >
                  Team Members
                </TabsTrigger>
                <TabsTrigger
                  value="pending"
                  className="data-[state=active]:border-foreground shrink-0 rounded-none border-b-2 border-transparent px-0 pb-3 text-sm shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:pb-4"
                >
                  Pending Invitations
                </TabsTrigger>
                <TabsTrigger
                  value="suggested"
                  className="data-[state=active]:border-foreground shrink-0 rounded-none border-b-2 border-transparent px-0 pb-3 text-sm shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:pb-4"
                >
                  Suggested Members
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:grid-cols-[minmax(280px,1fr)_auto_auto_auto] lg:gap-3">
              <InputGroup className="col-span-3 h-9 lg:col-span-1 lg:h-10">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={searchQuery}
                  placeholder="Filter..."
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </InputGroup>

              <MemberFilterSelect<RoleFilter>
                value={roleFilter}
                label={roleLabels[roleFilter]}
                icon={<ListFilter />}
                options={[
                  { label: "All Team Roles", value: "all" },
                  { label: "Owner", value: "owner" },
                  { label: "Admin", value: "admin" },
                  { label: "Member", value: "member" },
                  { label: "Viewer", value: "viewer" },
                ]}
                onValueChange={setRoleFilter}
              />

              <MemberFilterSelect<TwoFactorFilter>
                value={twoFactorFilter}
                label={twoFactorLabels[twoFactorFilter]}
                icon={<ShieldCheck />}
                options={[
                  { label: "2FA Status", value: "all" },
                  { label: "Enabled", value: "enabled" },
                  { label: "Disabled", value: "disabled" },
                ]}
                onValueChange={setTwoFactorFilter}
              />

              <MemberFilterSelect<MemberSort>
                value={sort}
                label={sortLabels[sort]}
                icon={
                  sort === "name-asc" ? (
                    <ArrowDownAZ />
                  ) : sort === "name-desc" ? (
                    <ArrowUpAZ />
                  ) : sort === "date-asc" ? (
                    <CalendarDays />
                  ) : (
                    <ArrowDownUp />
                  )
                }
                options={[
                  { label: "Date", value: "date-desc" },
                  { label: "Oldest", value: "date-asc" },
                  { label: "Name A-Z", value: "name-asc" },
                  { label: "Name Z-A", value: "name-desc" },
                ]}
                onValueChange={setSort}
              />
            </div>

            {(["team", "pending", "suggested"] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-0">
                {visibleMembers.length > 0 ? (
                  <MemberTable
                    members={visibleMembers}
                    selectedIds={selectedIds}
                    onToggleMember={toggleMember}
                    onToggleAll={toggleAllVisibleMembers}
                  />
                ) : (
                  <div className="bg-card rounded-lg border border-dashed p-10 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="bg-muted flex size-10 items-center justify-center rounded-full">
                        <UserPlus />
                      </div>
                      <div>
                        <p className="text-sm font-medium">No members found</p>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Adjust the current filters to show more people.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>

          <span className="sr-only">
            Team members {tabCounts.team}, pending invitations{" "}
            {tabCounts.pending}, suggested members {tabCounts.suggested}
          </span>
        </div>
      </div>
    </main>
  );
}

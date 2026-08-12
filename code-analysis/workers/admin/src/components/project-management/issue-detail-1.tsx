"use client";

import {
  Bell,
  CheckSquare,
  Circle,
  Clock3,
  Diamond,
  Flag,
  Globe as Github,
  Grid2X2,
  History,
  ListFilter,
  MessageCircle,
  MoreVertical,
  PanelRight,
  Plus,
  SmilePlus,
  Star,
  UserCircle,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { FileLinkRow } from "@/components/projects/FileLinkRow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { QuickLink } from "@/lib/data/project-details";
import { cn } from "@/lib/utils";

const issue = {
  project: "Redwood Flow",
  parent: "RFC-101",
  identifier: "RFC-109",
  github: "#8744",
  repository: "planning-ui",
  title: "Bug: timeline density loses issue context",
  description:
    "When the project timeline is filtered down to a focused sprint, the issue bars keep their dates but lose the parent issue context. The result is still editable, but it is difficult to tell whether a row belongs to the parent planning track or to a nested follow-up issue.",
  followUp:
    "Here you can see the nested timeline issue still appears in the direct planning view, but the same issue loses its parent marker after switching to the compact calendar view:",
  status: "Under review",
  priority: "Medium",
  createdBy: {
    name: "Maya Chen",
    initials: "MC",
    avatar: "/avatars/avatar-2.png",
  },
  assignee: {
    name: "Aarav Mehta",
    initials: "AM",
    avatar: "/avatars/avatar-4.png",
  },
  labels: ["bug"],
};

const properties = [
  {
    label: "Status",
    icon: Clock3,
    value: issue.status,
    accent: true,
  },
  { label: "Priority", icon: Flag, value: issue.priority },
  { label: "Created by", person: issue.createdBy },
  { label: "Assignee", icon: UserCircle, value: issue.assignee.name },
  { label: "Labels", value: "bug", pill: true },
];

const secondaryProperties = [
  { label: "Component", icon: Diamond, value: "Timeline surfaces" },
  { label: "Milestone", icon: Flag, value: "Sprint 18" },
];

const workProperties = [
  { label: "Task type", icon: CheckSquare, value: "Issue" },
  { label: "Estimation", value: "0h" },
  { label: "Spent time", value: "0h" },
  { label: "Remaining time", value: "0h" },
];

const stateHistory = [
  { label: "Under review", time: "a year" },
  { label: "In Progress", time: "12 minutes" },
  { label: "Todo", time: "4 minutes" },
];

const attachments = [
  {
    id: "issue-file-1",
    name: "Timeline architecture notes.pdf",
    type: "pdf",
    sizeMB: 1.8,
    url: "#",
  },
  {
    id: "issue-file-2",
    name: "Interaction states.fig",
    type: "fig",
    sizeMB: 3.4,
    url: "#",
  },
  {
    id: "issue-file-3",
    name: "Review packet.zip",
    type: "zip",
    sizeMB: 7.2,
    url: "#",
  },
] satisfies QuickLink[];

const subIssues = [
  {
    id: "RFC-112",
    title: "Normalize parent markers across timeline rows",
    status: "In Progress",
  },
  {
    id: "RFC-118",
    title: "Render image attachments in issue activity",
    status: "Todo",
  },
  {
    id: "RFC-121",
    title: "Check compact rail behavior in admin shell",
    status: "Under review",
  },
];

const evidenceScreenshots = [
  {
    id: "timeline-context",
    src: "/images/issue-detail/timeline-context-missing.png",
    alt: "Timeline UI screenshot showing missing parent context in compact timeline view",
    title: "Compact timeline loses parent context",
  },
  {
    id: "calendar-context",
    src: "/images/issue-detail/calendar-context-missing.png",
    alt: "Calendar UI screenshot showing missing parent context in compact calendar view",
    title: "Calendar view keeps the issue but drops hierarchy",
  },
];

const activity = [
  {
    actor: "Maya Chen",
    avatar: "/avatars/avatar-2.png",
    initials: "MC",
    meta: "at 28/04, 19:54",
    text: "Unset assignee",
    icon: UserCircle,
  },
  {
    actor: "Aarav Mehta",
    avatar: "/avatars/avatar-4.png",
    initials: "AM",
    meta: "at 28/04, 19:54",
    text: "Status set to Under review",
    icon: Clock3,
  },
  {
    actor: "Aarav Mehta",
    avatar: "/avatars/avatar-4.png",
    initials: "AM",
    meta: "at 28/04, 19:42",
    text: "Assignee set to Aarav Mehta",
    icon: UserCircle,
  },
  {
    actor: "Maya Chen",
    avatar: "/avatars/avatar-2.png",
    initials: "MC",
    meta: "left a comment at 28/04, 19:38",
    text: "Also - the timeline freezes when I open any issue that is using a compact nested date range.",
    icon: MessageCircle,
  },
  {
    actor: "System",
    avatar: "",
    initials: "GH",
    meta: "28/04, 19:37",
    text: `connected to Issue ${issue.github} inside ${issue.repository}`,
    icon: Github,
  },
];

function RailSection({ children }: { children: React.ReactNode }) {
  return <section className="border-b px-7 py-5">{children}</section>;
}

function RailRow({
  label,
  icon: Icon,
  value,
  accent,
  pill,
  person,
}: {
  label: string;
  icon?: React.ElementType;
  value?: string;
  accent?: boolean;
  pill?: boolean;
  person?: { name: string; initials: string; avatar: string };
}) {
  return (
    <div className="grid grid-cols-[118px_minmax(0,1fr)] items-center gap-5 py-2.5">
      <div className="text-muted-foreground text-sm font-normal">{label}</div>
      <div className="text-foreground flex min-w-0 items-center gap-2 text-sm">
        {person ? (
          <>
            <Avatar className="size-6 rounded-md">
              <AvatarImage src={person.avatar} alt={person.name} />
              <AvatarFallback>{person.initials}</AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground truncate">
              {person.name}
            </span>
          </>
        ) : (
          <>
            {Icon ? (
              <Icon
                className={cn(
                  "text-muted-foreground size-4",
                  accent && "text-primary",
                )}
              />
            ) : null}
            {pill ? (
              <Badge
                variant="outline"
                className="h-7 rounded-full px-2.5 text-xs font-normal"
              >
                <span className="bg-primary mr-2 size-2 rounded-full" />
                {value}
              </Badge>
            ) : (
              <span className="text-muted-foreground truncate">{value}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AttachmentStrip() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 md:grid-cols-3">
        {attachments.map((attachment) => (
          <FileLinkRow
            key={attachment.id}
            file={attachment}
            className="rounded-md border px-3 py-2"
          />
        ))}
      </div>
    </div>
  );
}

function ActivityItem({ item }: { item: (typeof activity)[number] }) {
  const Icon = item.icon;

  return (
    <div className="group hover:bg-muted/60 focus-within:bg-muted/60 relative flex gap-3 rounded-md px-0 py-3 transition-colors sm:gap-4 sm:px-4">
      <Avatar className="size-9 shrink-0 rounded-md">
        <AvatarImage src={item.avatar} alt={item.actor} />
        <AvatarFallback>{item.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-2">
          <span className="font-semibold">{item.actor}</span>
          <span className="text-muted-foreground text-sm">{item.meta}</span>
        </div>
        <div className="mt-1.5 flex max-w-[62ch] items-start gap-2 text-sm leading-5">
          <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{item.text}</span>
        </div>
      </div>
      <div className="bg-background mt-0 hidden h-10 shrink-0 items-center gap-3 rounded-md border px-3 opacity-0 shadow-xl transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:flex">
        <SmilePlus className="size-4" />
        <Bell className="size-4" />
        <Star className="size-4" />
        <MessageCircle className="size-4" />
        <MoreVertical className="size-4" />
      </div>
    </div>
  );
}

function IssueDetailsRail() {
  return (
    <>
      <RailSection>
        {properties.map((property) => (
          <RailRow key={property.label} {...property} />
        ))}
      </RailSection>

      <RailSection>
        {secondaryProperties.map((property) => (
          <RailRow key={property.label} {...property} />
        ))}
      </RailSection>

      <RailSection>
        {workProperties.map((property) => (
          <RailRow key={property.label} {...property} />
        ))}
      </RailSection>

      <RailSection>
        <RailRow label="Repository" icon={Github} value={issue.repository} />
      </RailSection>

      <RailSection>
        <RailRow label="Status" value="Status" />
      </RailSection>

      <RailSection>
        <RailRow label="Collaborators" icon={Users} value="2 members" />
      </RailSection>

      <RailSection>
        <div className="text-muted-foreground mb-4 text-sm">State History:</div>
        <div className="flex flex-col gap-4">
          {stateHistory.map((state) => (
            <div
              key={state.label}
              className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-4"
            >
              <div className="flex items-center gap-3">
                <Clock3 className="text-primary size-4" />
                <span className="text-sm">{state.label}</span>
              </div>
              <span className="text-muted-foreground text-sm">
                {state.time}
              </span>
            </div>
          ))}
        </div>
      </RailSection>
    </>
  );
}

export function ProjectManagementIssueDetail1() {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="bg-background text-foreground h-[calc(100vh-4rem)] overflow-hidden text-sm">
      <div className="bg-background grid h-full grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 min-w-0">
          <main className="h-full min-h-0 overflow-y-auto">
            <div className="mx-auto flex max-w-[900px] flex-col gap-8 px-5 py-8 sm:px-8">
              <div className="text-muted-foreground flex min-w-0 flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-foreground font-medium">
                    {issue.project}
                  </span>
                  <span className="text-border">/</span>
                  <span>{issue.parent}</span>
                  <span className="text-border">/</span>
                  <span>{issue.identifier} (Issue)</span>
                </div>

                <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end">
                  <div className="flex min-w-0 items-center gap-3">
                    <Github className="size-4 shrink-0" />
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{issue.repository}</span>
                      <span className="text-foreground shrink-0 font-semibold">
                        {issue.github}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0 xl:hidden"
                    aria-label="Open issue details"
                    onClick={() => setDetailsOpen(true)}
                  >
                    <PanelRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-background w-fit rounded-md border px-3 py-2.5 shadow-xs">
                <div className="text-muted-foreground flex items-center gap-2.5 text-sm">
                  <Circle className="text-primary size-4" />
                  <span>{issue.parent}</span>
                  <span>Timeline architecture</span>
                  <span className="border-l pl-3">65</span>
                  <Grid2X2 className="size-4" />
                </div>
              </div>

              <section className="flex max-w-[760px] flex-col gap-6">
                <h1 className="text-xl font-medium tracking-normal">
                  {issue.title}
                </h1>
                <div className="text-muted-foreground flex flex-col gap-5 text-[15px] leading-6">
                  <p>{issue.description}</p>
                  <p>{issue.followUp}</p>
                </div>
              </section>

              <section className="flex max-w-[820px] flex-col gap-5">
                <div className="grid gap-4">
                  {evidenceScreenshots.map((screenshot) => (
                    <figure
                      key={screenshot.id}
                      className="bg-background overflow-hidden rounded-lg border"
                    >
                      <Image
                        src={screenshot.src}
                        alt={screenshot.alt}
                        width={1440}
                        height={810}
                        className="w-full object-cover"
                      />
                      <figcaption className="text-muted-foreground border-t px-4 py-2.5 text-xs font-medium">
                        {screenshot.title}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>

              <section className="flex max-w-[820px] flex-col gap-6">
                <AttachmentStrip />

                <button className="text-foreground flex w-fit items-center gap-2.5 text-[15px]">
                  <Plus className="size-5" />
                  Add sub-issue
                </button>

                <div className="divide-y rounded-md border">
                  {subIssues.map((subIssue) => (
                    <div
                      key={subIssue.id}
                      className="grid grid-cols-[92px_minmax(0,1fr)_120px] items-center gap-3 px-4 py-3"
                    >
                      <span className="text-muted-foreground text-xs font-semibold">
                        {subIssue.id}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {subIssue.title}
                      </span>
                      <span className="text-muted-foreground justify-self-end text-xs">
                        {subIssue.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="max-w-[820px]">
                <div className="mb-4 flex items-center justify-between gap-4 border-b pb-3">
                  <div className="flex items-center gap-3">
                    <History className="size-5" />
                    <h2 className="text-lg font-medium tracking-normal sm:text-xl">
                      Activity
                    </h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                    <Button
                      variant="outline"
                      className="h-9 px-3 sm:h-10 sm:px-4"
                    >
                      All
                    </Button>
                    <ListFilter className="size-5" />
                  </div>
                </div>

                <div className="flex flex-col divide-y">
                  {activity.map((item) => (
                    <ActivityItem
                      key={`${item.actor}-${item.meta}`}
                      item={item}
                    />
                  ))}
                </div>
              </section>
            </div>
          </main>
        </div>

        <aside className="bg-background hidden min-h-0 overflow-y-auto border-l xl:block">
          <IssueDetailsRail />
        </aside>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[340px] max-w-[88vw] p-0">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle>Issue details</SheetTitle>
            <SheetDescription>{issue.identifier}</SheetDescription>
          </SheetHeader>
          <div className="h-[calc(100dvh-73px)] overflow-y-auto">
            <IssueDetailsRail />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

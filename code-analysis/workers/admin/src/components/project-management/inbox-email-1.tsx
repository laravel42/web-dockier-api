"use client";

import {
  Archive,
  ArrowLeft,
  Bold,
  ChevronDown,
  Clock3,
  FileText,
  Folder,
  Inbox,
  Italic,
  Link,
  List,
  Mail,
  MoreVertical,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  Underline,
} from "lucide-react";
import NextLink from "next/link";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type MailboxId = "inbox" | "sent" | "drafts" | "archive" | "trash";

type Mailbox = {
  id: MailboxId;
  label: string;
  count: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type TimelineItem = {
  id: string;
  author: string;
  avatar: string;
  meta: string;
  body: string;
  tone?: "note" | "internal";
};

const mailboxes: Mailbox[] = [
  { id: "inbox", label: "Inbox", count: 18, icon: Inbox },
  { id: "sent", label: "Sent", count: 9, icon: Send },
  { id: "drafts", label: "Drafts", count: 3, icon: FileText },
  { id: "archive", label: "Archive", count: 42, icon: Archive },
  { id: "trash", label: "Trash", count: 0, icon: Trash2 },
];

const spaces = [
  { label: "Renewal Forecast", count: 8 },
  { label: "Platform QA", count: 5 },
  { label: "Design Partners", count: 4 },
  { label: "Finance Ops", count: 3 },
];

const selectedEmail = {
  id: "RFC-101",
  sender: "Nina Oliver",
  role: "Product lead",
  company: "Renewal Forecast",
  avatar: "/avatars/avatar-1.png",
  subject: "Final review before timeline architecture handoff",
  preview:
    "Can you confirm the resize behavior notes and the remaining calendar follow-up copy before we send this to engineering?",
  time: "09:24 AM",
  labels: ["RFC-101", "handoff"],
  attachments: ["timeline-handoff.pdf", "calendar-copy.md"],
  body: [
    "Can you confirm the resize behavior notes and the remaining calendar follow-up copy before we send this to engineering?",
    "The timeline architecture section is approved, but I want the disabled calendar state and overlap behavior to read cleanly in the implementation brief.",
    "If the wording looks good, I will attach it to the release thread and mark the handoff ready for review.",
  ],
};

const timeline: TimelineItem[] = [
  {
    id: "raised",
    author: "Nina Oliver",
    avatar: "/avatars/avatar-1.png",
    meta: "raised this email from Renewal Forecast · 12 minutes ago",
    body: "Asked for final confirmation before the timeline architecture handoff goes to engineering.",
    tone: "note",
  },
  {
    id: "internal",
    author: "Ava Reed",
    avatar: "/avatars/avatar-6.png",
    meta: "Internal note · 8 minutes ago",
    body: "Dark-mode screenshots are attached in the QA thread. Main open question is disabled calendar state weight.",
    tone: "internal",
  },
  {
    id: "reply",
    author: "Kai Young",
    avatar: "/avatars/avatar-2.png",
    meta: "5 minutes ago",
    body: "Resize behavior is now consistent with the current drag affordance. I am checking the overlap copy before closing the implementation brief.",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function MailboxButton({
  mailbox,
  active,
}: {
  mailbox: Mailbox;
  active: boolean;
}) {
  const Icon = mailbox.icon;

  return (
    <button
      type="button"
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
        active
          ? "bg-zinc-100 text-zinc-950 dark:bg-white/8 dark:text-zinc-100"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-zinc-100",
      )}
    >
      <Icon className="size-4" />
      <span className="min-w-0 flex-1 truncate text-left">{mailbox.label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs",
          active
            ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
            : "bg-zinc-100 text-zinc-500 dark:bg-white/8 dark:text-zinc-400",
        )}
      >
        {mailbox.count}
      </span>
    </button>
  );
}

function MailSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r bg-zinc-50/80 lg:flex dark:border-white/8 dark:bg-[#0d0d0d]">
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4 dark:border-white/8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
            <Mail className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              Project Mail
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Renewal workspace
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-8">
          <ChevronDown className="size-4" />
        </Button>
      </div>

      <div className="p-3">
        <Button className="h-10 w-full justify-start gap-2">
          <Plus className="size-4" />
          Compose
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-4">
        <div className="space-y-1">
          {mailboxes.map((mailbox) => (
            <MailboxButton
              key={mailbox.id}
              mailbox={mailbox}
              active={mailbox.id === "inbox"}
            />
          ))}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Spaces
            </p>
            <Button variant="ghost" size="icon" className="size-7">
              <Plus className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-1">
            {spaces.map((space) => (
              <button
                key={space.label}
                type="button"
                className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-zinc-100"
              >
                <Folder className="size-4" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {space.label}
                </span>
                <span className="text-xs text-zinc-400">{space.count}</span>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

function AttachmentChip({ filename }: { filename: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-zinc-700 shadow-[0_1px_1px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
      <Paperclip className="size-4 text-zinc-400" />
      {filename}
    </span>
  );
}

function ReplyComposer() {
  return (
    <div className="rounded-xl border bg-white shadow-sm dark:border-white/10 dark:bg-[#111111]">
      <div className="flex border-b text-sm font-medium dark:border-white/8">
        <button
          type="button"
          className="border-b-2 border-zinc-950 px-4 py-3 text-zinc-950 dark:border-zinc-100 dark:text-zinc-100"
        >
          Reply to Nina
        </button>
        <button
          type="button"
          className="px-4 py-3 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Internal comment
        </button>
      </div>

      <div className="flex items-center gap-1 border-b px-3 py-2 text-zinc-500 dark:border-white/8">
        {[Bold, Italic, Underline, List, Link, Paperclip].map((Icon) => (
          <Button
            key={Icon.displayName ?? Icon.name}
            variant="ghost"
            size="icon"
            className="size-8"
          >
            <Icon className="size-4" />
          </Button>
        ))}
      </div>

      <Textarea
        placeholder="Write a reply..."
        className="min-h-32 resize-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0"
      />

      <div className="flex items-center gap-2 border-t px-4 py-3 dark:border-white/8">
        <Button>Send reply</Button>
        <Button variant="outline">Save draft</Button>
      </div>
    </div>
  );
}

export function ProjectManagementInboxEmail1() {
  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 overflow-hidden">
      <MailSidebar />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-[#101010]">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-5 dark:border-white/8">
          <Button asChild variant="ghost" size="sm" className="gap-2 px-2">
            <NextLink href="/project-management/inbox-4">
              <ArrowLeft className="size-4" />
              Back
            </NextLink>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Archive className="size-4" />
              Archive
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Star className="size-4" />
              Star
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Clock3 className="size-4" />
              Snooze
            </Button>
            <Button variant="outline" size="icon" className="size-9">
              <MoreVertical className="size-4" />
            </Button>
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <article className="mx-auto w-full max-w-5xl px-5 py-6">
            <div className="flex flex-col gap-4 border-b pb-6 dark:border-white/8">
              <div className="flex items-start gap-4">
                <Avatar className="size-12">
                  <AvatarImage
                    src={selectedEmail.avatar}
                    alt={selectedEmail.sender}
                  />
                  <AvatarFallback>
                    {initials(selectedEmail.sender)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl dark:text-zinc-100">
                      {selectedEmail.subject}
                    </h1>
                    <ShieldCheck className="size-5 text-sky-500" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedEmail.sender}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-white/8 dark:text-zinc-300">
                      {selectedEmail.role}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <Clock3 className="size-3.5" />
                      {selectedEmail.time}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="py-6">
              <div className="min-w-0">
                <div className="space-y-5 text-base leading-7 text-zinc-700 dark:text-zinc-300">
                  {selectedEmail.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {selectedEmail.attachments.map((attachment) => (
                    <AttachmentChip key={attachment} filename={attachment} />
                  ))}
                </div>

                <div className="mt-8">
                  <div className="mb-4 flex gap-6 border-b text-sm font-medium dark:border-white/8">
                    {["All", "Comments", "Actions"].map((tab, index) => (
                      <button
                        key={tab}
                        type="button"
                        className={cn(
                          "border-b-2 pb-3",
                          index === 0
                            ? "border-zinc-950 text-zinc-950 dark:border-zinc-100 dark:text-zinc-100"
                            : "border-transparent text-zinc-500 dark:text-zinc-400",
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <ReplyComposer />

                  <div className="before:bg-border relative mt-8 space-y-5 before:absolute before:top-3.5 before:bottom-3.5 before:left-3.5 before:w-px dark:before:bg-white/10">
                    {timeline.map((item) => (
                      <div
                        key={item.id}
                        className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-5"
                      >
                        <Avatar className="relative z-10 size-7 border-2 border-white dark:border-[#101010]">
                          <AvatarImage src={item.avatar} alt={item.author} />
                          <AvatarFallback>
                            {initials(item.author)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm">
                            <span className="font-semibold text-zinc-950 dark:text-zinc-100">
                              {item.author}
                            </span>{" "}
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {item.meta}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "mt-2 max-w-2xl rounded-lg px-3 py-2 text-sm leading-6",
                              item.tone === "internal"
                                ? "bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-200"
                                : "bg-zinc-100 text-zinc-700 dark:bg-white/8 dark:text-zinc-300",
                            )}
                          >
                            {item.body}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </article>
        </ScrollArea>
      </section>
    </main>
  );
}

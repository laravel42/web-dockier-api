"use client";

import {
  Archive,
  ChevronDown,
  FileText,
  Folder,
  Inbox,
  Mail,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type MailboxId = "inbox" | "sent" | "drafts" | "archive" | "trash";

type Mailbox = {
  id: MailboxId;
  label: string;
  count: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type Email = {
  id: string;
  mailbox: MailboxId;
  sender: string;
  role: string;
  company: string;
  avatar: string;
  verified?: boolean;
  subject: string;
  preview: string;
  time: string;
  unread?: boolean;
  starred?: boolean;
  labels: string[];
  attachments: string[];
  body: string[];
  nextStep: string;
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

const emails: Email[] = [
  {
    id: "mail-101",
    mailbox: "inbox",
    sender: "Nina Oliver",
    role: "Product lead",
    company: "Renewal Forecast",
    avatar: "/avatars/avatar-1.png",
    verified: true,
    subject: "Final review before timeline architecture handoff",
    preview:
      "Can you confirm the resize behavior notes and the remaining calendar follow-up copy before we send this to engineering?",
    time: "09:24",
    unread: true,
    starred: true,
    labels: ["RFC-101", "handoff"],
    attachments: ["timeline-handoff.pdf", "calendar-copy.md"],
    body: [
      "Can you confirm the resize behavior notes and the remaining calendar follow-up copy before we send this to engineering?",
      "The timeline architecture section is approved, but I want the disabled calendar state and overlap behavior to read cleanly in the implementation brief.",
      "If the wording looks good, I will attach it to the release thread and mark the handoff ready for review.",
    ],
    nextStep: "Reply with confirmed copy and attach final timeline notes.",
  },
  {
    id: "mail-102",
    mailbox: "inbox",
    sender: "Ava Reed",
    role: "Design systems",
    company: "Platform QA",
    avatar: "/avatars/avatar-6.png",
    verified: true,
    subject: "Dark mode borders are ready for one more pass",
    preview:
      "I pushed the latest screenshots. Calendar 2 now matches the quieter border model from Calendar 1.",
    time: "10:02",
    unread: true,
    labels: ["calendar", "dark mode"],
    attachments: ["dark-mode-review.png"],
    body: [
      "I pushed the latest screenshots. Calendar 2 now matches the quieter border model from Calendar 1.",
      "The only thing I want checked is whether the disabled column still feels too heavy in compact view.",
      "After that, we can close the visual QA item.",
    ],
    nextStep: "Review disabled state on desktop and mobile before closing QA.",
  },
  {
    id: "mail-103",
    mailbox: "inbox",
    sender: "Kai Young",
    role: "Frontend engineer",
    company: "Renewal Forecast",
    avatar: "/avatars/avatar-2.png",
    subject: "Kanban reorder issue looks fixed in local testing",
    preview:
      "The drag target now uses the actual item midpoint instead of the stale list index. Reorder feels consistent across columns.",
    time: "Yesterday",
    starred: true,
    labels: ["kanban", "drag"],
    attachments: ["reorder-recording.mov"],
    body: [
      "The drag target now uses the actual item midpoint instead of the stale list index. Reorder feels consistent across columns.",
      "I also made each group scroll independently so tall columns do not push the whole board around.",
      "Please try moving items quickly between In Progress and Review. That was the previous failure case.",
    ],
    nextStep: "Test fast cross-column dragging before merging.",
  },
  {
    id: "mail-104",
    mailbox: "inbox",
    sender: "Morgan Lee",
    role: "Customer success",
    company: "Design Partners",
    avatar: "/avatars/avatar-3.png",
    verified: true,
    subject: "Partner call notes and follow-up owners",
    preview:
      "The customer likes the new inbox direction. They asked for clearer owners and a simpler attachment row.",
    time: "Mon",
    labels: ["customer", "notes"],
    attachments: ["partner-call-notes.docx"],
    body: [
      "The customer likes the new inbox direction. They asked for clearer owners and a simpler attachment row.",
      "Their team mostly works from the list view, so the sender, subject, and next action need to remain visible even when the preview pane is open.",
      "They also asked that attachments stay compact and scannable.",
    ],
    nextStep: "Fold feedback into the next inbox exploration.",
  },
  {
    id: "mail-105",
    mailbox: "inbox",
    sender: "Stripe",
    role: "Billing",
    company: "Finance Ops",
    avatar: "/avatars/avatar-black-4.png",
    subject: "Payout reconciliation export is ready",
    preview:
      "Your reconciliation export for the April payout window is ready to download from the finance workspace.",
    time: "Tue",
    labels: ["finance"],
    attachments: ["april-reconciliation.csv"],
    body: [
      "Your reconciliation export for the April payout window is ready to download from the finance workspace.",
      "The export includes fees, refunds, and disputed charges for the selected reporting period.",
      "No action is required unless the finance team needs a revised date range.",
    ],
    nextStep: "Forward to Finance Ops if they need the export.",
  },
  {
    id: "mail-106",
    mailbox: "drafts",
    sender: "Draft",
    role: "Internal",
    company: "Renewal Forecast",
    avatar: "/avatars/avatar-bw-1.png",
    subject: "Launch readiness response",
    preview:
      "Adding the final QA note and dependency summary before this goes to the launch channel.",
    time: "Draft",
    labels: ["draft"],
    attachments: [],
    body: [
      "Adding the final QA note and dependency summary before this goes to the launch channel.",
      "Open items: confirm issue calendar editing flow, run one final dark-mode capture, and include the owner for QA keyboard reorder flow.",
    ],
    nextStep: "Finish draft after QA confirms screenshots.",
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

function getAttachmentTone(filename: string) {
  if (filename.endsWith(".pdf")) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300";
  }

  if (filename.endsWith(".csv") || filename.endsWith(".xlsx")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (filename.endsWith(".md") || filename.endsWith(".docx")) {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300";
  }

  if (filename.endsWith(".mov") || filename.endsWith(".png")) {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/8 dark:text-zinc-300";
}

function MailboxButton({
  mailbox,
  active,
  onClick,
}: {
  mailbox: Mailbox;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = mailbox.icon;

  return (
    <button
      type="button"
      onClick={onClick}
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

function EmailRow({
  email,
  selected,
  onSelect,
}: {
  email: Email;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group grid w-full grid-cols-[auto_minmax(0,1fr)] gap-4 border-b px-6 py-5 text-left transition dark:border-white/8",
        selected
          ? "bg-zinc-50/80 dark:bg-white/5"
          : "bg-white hover:bg-zinc-50 dark:bg-[#101010] dark:hover:bg-white/5",
      )}
    >
      <Avatar className="mt-1 size-10">
        <AvatarImage src={email.avatar} alt={email.sender} />
        <AvatarFallback>{initials(email.sender)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-100">
            {email.subject}
          </p>
          {email.verified ? (
            <ShieldCheck className="size-4 shrink-0 text-sky-500" />
          ) : null}
          {email.starred ? (
            <Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />
          ) : null}
        </div>

        <p className="mt-2 truncate text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {email.preview}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {email.attachments.map((attachment) => (
            <span
              key={attachment}
              className="inline-flex h-8 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-zinc-700 shadow-[0_1px_1px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/5 dark:text-zinc-200"
            >
              <span
                className={cn(
                  "inline-flex size-4 items-center justify-center rounded border text-[8px] leading-none font-bold uppercase",
                  getAttachmentTone(attachment),
                )}
              >
                {attachment.split(".").pop()?.slice(0, 1)}
              </span>
              {attachment}
            </span>
          ))}
          {email.attachments.length === 0
            ? email.labels.slice(0, 2).map((label) => (
                <Badge
                  key={label}
                  variant="outline"
                  className="h-8 rounded-lg bg-white px-3 text-sm font-medium dark:bg-white/5"
                >
                  {label}
                </Badge>
              ))
            : null}
          <span className="ml-auto hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
            {email.sender} · {email.time}
          </span>
        </div>
      </div>
    </button>
  );
}

export function ProjectManagementInbox4() {
  const router = useRouter();
  const [activeMailbox, setActiveMailbox] = React.useState<MailboxId>("inbox");
  const [selectedEmailId, setSelectedEmailId] = React.useState(emails[0].id);
  const [query, setQuery] = React.useState("");

  const filteredEmails = emails.filter((email) => {
    if (email.mailbox !== activeMailbox) {
      return false;
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return [email.sender, email.subject, email.preview, email.company]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  return (
    <main className="bg-background text-foreground flex min-h-0 flex-1 overflow-hidden">
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
                active={activeMailbox === mailbox.id}
                onClick={() => {
                  setActiveMailbox(mailbox.id);
                  setSelectedEmailId(emails[0].id);
                }}
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

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-[#101010]">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 dark:border-white/8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {filteredEmails.length} conversations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-9 lg:hidden">
              <Plus className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-9">
              <SlidersHorizontal className="size-4" />
            </Button>
          </div>
        </header>

        <div className="border-b p-3 dark:border-white/8">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search mail..."
              className="h-10 pl-9"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
          {filteredEmails.map((email) => (
            <EmailRow
              key={email.id}
              email={email}
              selected={selectedEmailId === email.id}
              onSelect={() => {
                setSelectedEmailId(email.id);
                router.push("/project-management/inbox-email-1");
              }}
            />
          ))}
        </ScrollArea>
      </section>
    </main>
  );
}

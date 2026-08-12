"use client";

import {
  ArchiveX,
  BadgeCheck,
  ChevronDown,
  File,
  Inbox,
  Mail,
  MoreHorizontal,
  Paperclip,
  Reply,
  Send,
  Trash2,
} from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FolderId = "inbox" | "drafts" | "sent" | "junk" | "trash";

type Folder = {
  id: FolderId;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type MailItem = {
  id: string;
  folder: FolderId;
  name: string;
  email: string;
  avatar: string;
  verified: boolean;
  subject: string;
  date: string;
  teaser: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  body: string[];
  attachments?: string[];
};

const folders: Folder[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "drafts", label: "Drafts", icon: File },
  { id: "sent", label: "Sent", icon: Send },
  { id: "junk", label: "Junk", icon: ArchiveX },
  { id: "trash", label: "Trash", icon: Trash2 },
];

const initialMails: MailItem[] = [
  {
    id: "mail-1",
    folder: "inbox",
    name: "Sarah Mitchell",
    email: "sarah.mitchell@acme.io",
    avatar: "/avatars/avatar-1.png",
    verified: true,
    subject: "Q4 Product Roadmap Review",
    date: "09:30 AM",
    teaser:
      "Hey team, I have put together the draft roadmap for Q4 and would love your input before we finalize it next week.",
    read: false,
    starred: true,
    labels: ["roadmap", "planning"],
    body: [
      "Hey team,",
      "I have put together the draft roadmap for Q4 and would love your input before we finalize it next week. The main decision points are the analytics refresh, workspace permissions, and whether we keep the mobile search improvements in the same release train.",
      "Can you review the attached summary and leave comments by Thursday afternoon? I want to make sure we have enough time to reconcile dependencies before the leadership review.",
      "Thanks, Sarah",
    ],
    attachments: ["q4-roadmap-draft.pdf", "launch-dependencies.csv"],
  },
  {
    id: "mail-2",
    folder: "inbox",
    name: "GitHub",
    email: "noreply@github.com",
    avatar: "/avatars/avatar-black-2.png",
    verified: true,
    subject: "[acme/dashboard] PR #847 merged",
    date: "Yesterday",
    teaser:
      "Your pull request has been merged into main. The CI/CD pipeline has started and deployment to staging is queued.",
    read: true,
    starred: false,
    labels: ["deploy"],
    body: [
      "PR #847 has been merged into main by Nina Oliver.",
      "The CI/CD pipeline has started and deployment to staging is queued. Required checks passed: lint, typecheck, unit tests, and visual snapshots.",
      "View the deployment once the staging preview is ready.",
    ],
  },
  {
    id: "mail-3",
    folder: "inbox",
    name: "Alex Thompson",
    email: "alex.t@designstudio.co",
    avatar: "/avatars/avatar-3.png",
    verified: true,
    subject: "New brand assets ready for review",
    date: "Yesterday",
    teaser:
      "The updated brand guidelines and asset library are now available. I included the new color palette and usage notes.",
    read: true,
    starred: false,
    labels: ["design"],
    body: [
      "Hi Jordan,",
      "The updated brand guidelines and asset library are now available. I included the new color palette, logo lockups, icon usage notes, and examples for the product empty states.",
      "The biggest change is the refreshed neutral scale. It should make the dashboard surfaces feel cleaner without losing contrast.",
      "Alex",
    ],
    attachments: ["brand-guidelines-v3.fig"],
  },
  {
    id: "mail-4",
    folder: "inbox",
    name: "Stripe",
    email: "notifications@stripe.com",
    avatar: "/avatars/avatar-black-4.png",
    verified: true,
    subject: "Your December payout has been initiated",
    date: "2 days ago",
    teaser:
      "A payout of $12,450.00 USD has been initiated to your bank account ending in 4521.",
    read: true,
    starred: true,
    labels: ["finance"],
    body: [
      "A payout of $12,450.00 USD has been initiated to your bank account ending in 4521.",
      "The payout includes charges processed between Dec 1 and Dec 7. Funds typically arrive in 1-2 business days depending on your bank.",
      "You can download the payout reconciliation from your Stripe dashboard.",
    ],
  },
  {
    id: "mail-5",
    folder: "inbox",
    name: "Marcus Johnson",
    email: "marcus@venturecap.fund",
    avatar: "/avatars/avatar-5.png",
    verified: false,
    subject: "Follow-up: Series A discussion",
    date: "3 days ago",
    teaser:
      "Great meeting you at TechCrunch Disrupt last week. I would love to continue our conversation about your growth plans.",
    read: true,
    starred: false,
    labels: ["investor"],
    body: [
      "Jordan,",
      "Great meeting you at TechCrunch Disrupt last week. I would love to continue our conversation about your growth plans and the enterprise pipeline you mentioned.",
      "If you are open to it, my team can join a 30 minute call next week to talk through how we think about the Series A round.",
      "Marcus",
    ],
  },
  {
    id: "mail-6",
    folder: "inbox",
    name: "Linear",
    email: "notifications@linear.app",
    avatar: "/avatars/avatar-black-5.png",
    verified: true,
    subject: "Weekly project digest",
    date: "3 days ago",
    teaser:
      "Here is your weekly summary: 23 issues completed, 8 in progress, and 5 new issues created this week.",
    read: true,
    starred: false,
    labels: ["digest"],
    body: [
      "Here is your weekly summary for Product Platform.",
      "23 issues completed, 8 in progress, and 5 new issues created this week. Two cycles are on track, and the search polish milestone has one blocking dependency.",
      "Open Linear to review the full issue breakdown.",
    ],
  },
  {
    id: "mail-7",
    folder: "inbox",
    name: "Emma Watson",
    email: "emma.w@clientcorp.com",
    avatar: "/avatars/avatar-6.png",
    verified: true,
    subject: "Contract renewal - Action required",
    date: "4 days ago",
    teaser:
      "Our annual contract is coming up for renewal next month. I wanted to discuss the new pricing tiers.",
    read: false,
    starred: false,
    labels: ["customer", "renewal"],
    body: [
      "Hi Jordan,",
      "Our annual contract is coming up for renewal next month. I wanted to discuss the new pricing tiers and make sure we understand what changes before our procurement review.",
      "Can you send a renewal quote and confirm whether our current data retention addendum carries forward?",
      "Emma",
    ],
  },
  {
    id: "mail-8",
    folder: "inbox",
    name: "Vercel",
    email: "notifications@vercel.com",
    avatar: "/avatars/avatar-black-6.png",
    verified: true,
    subject: "Build failed: acme-dashboard",
    date: "4 days ago",
    teaser:
      "The latest deployment for acme-dashboard failed. Error: Module not found: Cannot resolve components/ui.",
    read: true,
    starred: false,
    labels: ["deploy", "alert"],
    body: [
      "The latest deployment for acme-dashboard failed.",
      "Error: Module not found: Cannot resolve components/ui. The failure happened during the production build step after dependency installation completed.",
      "Review the build logs for the full stack trace and retry once the missing import is fixed.",
    ],
  },
  {
    id: "mail-9",
    folder: "drafts",
    name: "Nina Oliver",
    email: "nina@acme.io",
    avatar: "/avatars/avatar-bw-1.png",
    verified: true,
    subject: "Draft: Launch readiness notes",
    date: "Draft",
    teaser:
      "Adding the final QA notes here before we send the launch readiness update to the broader project group.",
    read: true,
    starred: false,
    labels: ["draft"],
    body: [
      "Nina,",
      "Adding the final QA notes here before we send the launch readiness update to the broader project group.",
      "Open item: confirm analytics replay job status and include owner handoff for the support macro.",
    ],
  },
  {
    id: "mail-10",
    folder: "sent",
    name: "Kai Young",
    email: "kai@acme.io",
    avatar: "/avatars/avatar-bw-2.png",
    verified: true,
    subject: "Re: Timeline handoff",
    date: "Monday",
    teaser:
      "Thanks for the review. I pushed the handoff notes and linked the remaining QA issue in the timeline.",
    read: true,
    starred: false,
    labels: ["sent"],
    body: [
      "Thanks for the review.",
      "I pushed the handoff notes and linked the remaining QA issue in the timeline. The final dependency list is now attached to the project page.",
      "Jordan",
    ],
  },
  {
    id: "mail-11",
    folder: "junk",
    name: "Unknown Sender",
    email: "promo@example.net",
    avatar: "/avatars/avatar-bw-3.png",
    verified: false,
    subject: "Exclusive workspace offer",
    date: "Last week",
    teaser:
      "You have been selected for an exclusive offer to upgrade your business workspace tools.",
    read: true,
    starred: false,
    labels: ["junk"],
    body: [
      "You have been selected for an exclusive offer to upgrade your business workspace tools.",
      "This sender is outside your trusted domain list.",
    ],
  },
  {
    id: "mail-12",
    folder: "trash",
    name: "Old Billing Alias",
    email: "billing-old@vendor.example",
    avatar: "/avatars/avatar-bw-4.png",
    verified: false,
    subject: "Invoice copy",
    date: "Last month",
    teaser:
      "This archived invoice copy was moved to trash after the billing alias was retired.",
    read: true,
    starred: false,
    labels: ["trash"],
    body: [
      "This archived invoice copy was moved to trash after the billing alias was retired.",
      "No action is required.",
    ],
  },
];

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22 22"
      className={cn("size-4 text-sky-500", className)}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
    </svg>
  );
}

interface FolderTabsProps {
  folders: Folder[];
  activeFolder: FolderId;
  onFolderChange: (folderId: FolderId) => void;
  activeEmailCount: number;
}

function FolderTabs({
  folders,
  activeFolder,
  onFolderChange,
  activeEmailCount,
}: FolderTabsProps) {
  const visibleFolders = folders.slice(0, 3);
  const overflowFolders = folders.slice(3);

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-1 lg:flex">
        {folders.map((folder) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.id;

          return (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              onClick={() => onFolderChange(folder.id)}
              className={cn(
                "h-[30px] gap-1.5",
                isActive && "bg-muted text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span className="text-[13px]">{folder.label}</span>
              {isActive && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {activeEmailCount.toLocaleString()}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      <div className="hidden items-center gap-1 md:flex lg:hidden">
        {visibleFolders.map((folder) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.id;

          return (
            <Button
              key={folder.id}
              variant="ghost"
              size="sm"
              onClick={() => onFolderChange(folder.id)}
              className={cn(
                "h-[30px] gap-1.5",
                isActive && "bg-muted text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              <span className="text-[13px]">{folder.label}</span>
              {isActive && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {activeEmailCount.toLocaleString()}
                </Badge>
              )}
            </Button>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-[30px]">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {overflowFolders.map((folder) => {
              const Icon = folder.icon;

              return (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() => onFolderChange(folder.id)}
                >
                  <Icon className="mr-2 size-4" />
                  {folder.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-[30px] gap-1.5">
              {(() => {
                const ActiveIcon =
                  folders.find((folder) => folder.id === activeFolder)?.icon ??
                  Inbox;

                return <ActiveIcon className="size-4" />;
              })()}
              <span className="text-[13px]">
                {folders.find((folder) => folder.id === activeFolder)?.label}
              </span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {activeEmailCount.toLocaleString()}
              </Badge>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {folders.map((folder) => {
              const Icon = folder.icon;
              const isActive = activeFolder === folder.id;

              return (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() => onFolderChange(folder.id)}
                >
                  <Icon className="mr-2 size-4" />
                  {folder.label}
                  {isActive && (
                    <span className="text-muted-foreground ml-auto text-xs">
                      {activeEmailCount.toLocaleString()}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface MailListProps {
  activeFolder: FolderId;
  mails: MailItem[];
  selectedEmailId: string | null;
  query: string;
  showUnreadOnly: boolean;
  onQueryChange: (query: string) => void;
  onUnreadOnlyChange: (value: boolean) => void;
  onEmailSelect: (emailId: string) => void;
}

function MailList({
  activeFolder,
  mails,
  selectedEmailId,
  query,
  showUnreadOnly,
  onQueryChange,
  onUnreadOnlyChange,
  onEmailSelect,
}: MailListProps) {
  const activeFolderLabel =
    folders.find((folder) => folder.id === activeFolder)?.label ?? "Inbox";

  return (
    <aside className="bg-background flex h-full w-full shrink-0 flex-col overflow-hidden border-r md:w-[320px]">
      <div className="flex shrink-0 flex-col gap-3.5 border-b p-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-foreground text-base font-medium">
            {activeFolderLabel}
          </div>
          <Label className="flex items-center gap-2 text-sm">
            <span>Unreads</span>
            <Switch
              checked={showUnreadOnly}
              onCheckedChange={onUnreadOnlyChange}
              className="shadow-none"
            />
          </Label>
        </div>
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Type to search..."
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        {mails.length > 0 ? (
          mails.map((mail) => {
            const isSelected = selectedEmailId === mail.id;

            return (
              <button
                type="button"
                key={mail.id}
                onClick={() => onEmailSelect(mail.id)}
                className={cn(
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full gap-3 border-b p-4 text-left text-sm leading-tight last:border-b-0",
                  !mail.read && "bg-muted/30",
                  isSelected && "bg-sidebar-accent",
                )}
              >
                <Avatar className="mt-0.5 size-9 shrink-0">
                  <AvatarImage src={mail.avatar} alt={mail.name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                    {getInitials(mail.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <span
                        className={cn(
                          "truncate text-sm",
                          !mail.read && "font-semibold",
                        )}
                      >
                        {mail.name}
                      </span>
                      {mail.verified && (
                        <VerifiedIcon className="size-3.5 shrink-0" />
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {mail.date}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-sm",
                      !mail.read && "font-medium",
                    )}
                  >
                    {mail.subject}
                  </p>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                    {mail.teaser}
                  </p>
                </div>
              </button>
            );
          })
        ) : (
          <div className="text-muted-foreground flex h-48 items-center justify-center px-6 text-center text-sm">
            No messages match this view.
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}

function MailDetail({ mail }: { mail: MailItem | null }) {
  if (!mail) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center">
        <div className="text-center">
          <Mail className="mx-auto size-12 opacity-50" />
          <p className="mt-2 text-sm">Select a message to read</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Mail className="size-5 shrink-0" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium sm:text-base">
              {mail.subject}
            </h2>
            <p className="text-muted-foreground truncate text-xs">
              From {mail.email}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Reply className="size-3.5" />
            Reply
          </Button>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <article className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6 lg:px-10">
          <div className="flex items-start gap-3">
            <Avatar className="size-10 shrink-0">
              <AvatarImage src={mail.avatar} alt={mail.name} />
              <AvatarFallback className="bg-primary text-primary-foreground font-medium">
                {getInitials(mail.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{mail.name}</span>
                {mail.verified && <VerifiedIcon />}
              </div>
              <p className="text-muted-foreground text-sm">{mail.email}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {mail.date}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 text-sm leading-relaxed">
            {mail.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          {mail.attachments && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Attachments
              </p>
              <div className="flex flex-wrap gap-2">
                {mail.attachments.map((attachment) => (
                  <Button
                    key={attachment}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Paperclip className="size-3.5" />
                    {attachment}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </article>
      </ScrollArea>

      <div className="shrink-0 border-t px-6 py-4 lg:px-10">
        <div className="bg-muted/30 mx-auto max-w-3xl rounded-lg border">
          <div className="text-muted-foreground border-b px-3 py-2 text-sm">
            Reply to {mail.email}
          </div>
          <Textarea
            placeholder="Write a reply..."
            className="min-h-[90px] resize-none border-0 bg-transparent focus-visible:ring-0"
          />
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-muted-foreground text-xs">
              Use / for snippets
            </span>
            <Button size="sm" className="gap-1.5">
              <Send className="size-3.5" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectManagementInbox2() {
  const [activeFolder, setActiveFolder] = React.useState<FolderId>("inbox");
  const [mails, setMails] = React.useState<MailItem[]>(initialMails);
  const [selectedEmailId, setSelectedEmailId] = React.useState<string | null>(
    initialMails.find((mail) => mail.folder === "inbox")?.id ?? null,
  );
  const [query, setQuery] = React.useState("");
  const [showUnreadOnly, setShowUnreadOnly] = React.useState(false);
  const [isMobileMailOpen, setIsMobileMailOpen] = React.useState(false);

  const folderMails = mails.filter((mail) => mail.folder === activeFolder);
  const filteredMails = folderMails.filter((mail) => {
    if (showUnreadOnly && mail.read) {
      return false;
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return [mail.name, mail.email, mail.subject, mail.teaser]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const selectedEmail =
    filteredMails.find((mail) => mail.id === selectedEmailId) ??
    filteredMails[0] ??
    null;

  const handleFolderChange = (folderId: FolderId) => {
    setActiveFolder(folderId);
    setQuery("");
    setSelectedEmailId(
      mails.find((mail) => mail.folder === folderId)?.id ?? null,
    );
  };

  const handleEmailSelect = (emailId: string) => {
    setSelectedEmailId(emailId);
    setMails((previousMails) =>
      previousMails.map((mail) =>
        mail.id === emailId ? { ...mail, read: true } : mail,
      ),
    );

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobileMailOpen(true);
    }
  };

  return (
    <div
      data-layout="fixed"
      className="bg-background text-foreground flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <header className="bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <FolderTabs
          folders={folders}
          activeFolder={activeFolder}
          onFolderChange={handleFolderChange}
          activeEmailCount={filteredMails.length}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <BadgeCheck className="size-3.5" />
              Jordan Lee
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Account</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuItem>Notifications</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MailList
          activeFolder={activeFolder}
          mails={filteredMails}
          selectedEmailId={selectedEmail?.id ?? null}
          query={query}
          showUnreadOnly={showUnreadOnly}
          onQueryChange={setQuery}
          onUnreadOnlyChange={setShowUnreadOnly}
          onEmailSelect={handleEmailSelect}
        />
        <div className="hidden min-w-0 flex-1 md:flex">
          <MailDetail mail={selectedEmail} />
        </div>
      </div>

      <Drawer open={isMobileMailOpen} onOpenChange={setIsMobileMailOpen}>
        <DrawerContent className="h-[90vh] overflow-hidden md:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Message detail</DrawerTitle>
          </DrawerHeader>
          <MailDetail mail={selectedEmail} />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

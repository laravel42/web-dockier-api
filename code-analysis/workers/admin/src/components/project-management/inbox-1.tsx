"use client";

import {
  ArrowLeft,
  ChevronDown,
  Clock,
  MessageSquare,
  PanelRight,
  Plus,
  Search,
  Send,
  Sparkles,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TicketStatus = "active" | "pending" | "closed";

type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role?: string;
};

type Customer = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  avatar: string;
  isHighValue: boolean;
};

type Message = {
  id: string;
  sender: User | Customer;
  content: string;
  timestamp: string;
  date: string;
  isStaff: boolean;
};

type Ticket = {
  id: string;
  subject: string;
  preview: string;
  timestamp: string;
  read: boolean;
  customer: Customer;
  assignee?: User;
  status: TicketStatus;
  messages: Message[];
  respondingUser?: User;
  agentSummary: string[];
  followUpLead: string;
  suggestedFollowUp: string;
  previousConversations: PreviousConversation[];
};

type PreviousConversation = {
  id: string;
  subject: string;
  timestamp: string;
};

const staffUsers: User[] = [
  {
    id: "peter",
    name: "Peter Lann",
    email: "peter.lann@cloudstar.com",
    avatar: "/avatars/avatar-2.png",
    role: "Support Agent",
  },
  {
    id: "alex",
    name: "Alex Chen",
    email: "alex.chen@cloudstar.com",
    avatar: "/avatars/avatar-3.png",
    role: "Support Agent",
  },
];

const mockCustomers: Customer[] = [
  {
    id: "sarah",
    name: "Sarah Tran",
    email: "sarah.tran@example.com",
    company: "BrightWave Marketing",
    role: "Ops Manager",
    avatar: "/images/block/avatar-1.webp",
    isHighValue: true,
  },
  {
    id: "mike",
    name: "Mike Johnson",
    email: "mike.j@techcorp.io",
    company: "TechCorp",
    role: "Developer",
    avatar: "/avatars/avatar-4.png",
    isHighValue: false,
  },
];

const mockTickets: Ticket[] = [
  {
    id: "1",
    subject: "Trouble connecting Slack integration",
    preview:
      "Our team is trying to connect Slack with CloudStar, but the authorization process fails with...",
    timestamp: "6h ago",
    read: false,
    customer: mockCustomers[0],
    assignee: staffUsers[0],
    status: "active",
    respondingUser: staffUsers[0],
    messages: [
      {
        id: "m1",
        sender: mockCustomers[0],
        content: `Hi CloudStar Support,

Our team is trying to connect Slack with CloudStar, but the authorization process fails with the following error message: "OAuth token invalid."

We've tried reconnecting a couple of times and even restarted the workspace, but no luck.

Could you help us get this integration working?

Thanks,
Sarah Tran
Ops Manager, BrightWave Marketing`,
        timestamp: "8:03 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m2",
        sender: staffUsers[0],
        content: `Hi Sarah,

Thanks for reaching out - happy to help! That error usually happens when Slack doesn't grant CloudStar the right permissions during the connection step. Here are a few things to try:

1. Make sure you're logged into the correct Slack workspace before starting the connection.
2. When prompted, grant all requested permissions to CloudStar (sometimes "Deny" is clicked accidentally).
3. Try using a private/incognito browser window to rule out cached credentials.

Let me know if that helps or if you're still seeing the error!`,
        timestamp: "12:56 PM",
        date: "Aug 29",
        isStaff: true,
      },
    ],
    agentSummary: [
      "Customer seems calm, but has potential to become frustrated. Likely non-technical as she hasn't read the documentation guide on the Slack integration.",
      "Peter replied with the necessary details to fix her issue, but she has yet to confirm whether or not her issue has been resolved.",
    ],
    followUpLead:
      "If the customer doesn't reply within the next 12 hours a follow up should be sent:",
    suggestedFollowUp: `Hi Sarah, just following up to see if you managed to get the integration working?

If you're still struggling, I'd be happy to schedule a call to make sure we can get you up and running.

Regards, Peter Lann`,
    previousConversations: [
      {
        id: "prev1",
        subject: "Trouble connecting Slack integration",
        timestamp: "6h ago",
      },
      {
        id: "prev2",
        subject: "API token expiry",
        timestamp: "2w ago",
      },
    ],
  },
  {
    id: "2",
    subject: "Missing files in shared workspace",
    preview:
      "Yesterday I uploaded a set of project files to our shared workspace. Today, two of the files are no...",
    timestamp: "6h ago",
    read: false,
    customer: mockCustomers[1],
    status: "active",
    respondingUser: staffUsers[1],
    messages: [
      {
        id: "m3",
        sender: mockCustomers[1],
        content: `Hi team,

Yesterday I uploaded a set of project files to our shared workspace. Today, two of the files are no longer visible to anyone on our side.

The activity log still shows the upload, but the files don't appear in search or in the folder where I placed them.

Can you check whether they were moved, quarantined, or removed by a retention rule?`,
        timestamp: "9:18 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m4",
        sender: staffUsers[1],
        content: `Hi Mike,

I can see the upload events from yesterday. The files were not deleted, but they were flagged by the workspace scanner because the filenames matched an older policy.

I'm restoring them to the original folder now and will update the policy so future project files with the same naming pattern are not hidden.`,
        timestamp: "9:47 AM",
        date: "Aug 29",
        isStaff: true,
      },
      {
        id: "m5",
        sender: mockCustomers[1],
        content: `Thanks Alex. We need those files for a client review this afternoon, so a restore today would be ideal.`,
        timestamp: "10:02 AM",
        date: "Aug 29",
        isStaff: false,
      },
    ],
    agentSummary: [
      "Mike needs two missing files restored before a client review later today.",
      "Alex found that the files were hidden by a workspace scanner policy, not deleted. The next response should confirm the restore and mention the policy change.",
    ],
    followUpLead:
      "If the restore is complete, send a concise confirmation with the folder location:",
    suggestedFollowUp: `Hi Mike, the two files have been restored to the original shared workspace folder.

I also updated the scanner policy so this filename pattern should not be hidden again.

Thanks, Alex Chen`,
    previousConversations: [
      {
        id: "prev3",
        subject: "Shared folder permission request",
        timestamp: "3d ago",
      },
      {
        id: "prev4",
        subject: "Asset upload size limit",
        timestamp: "1w ago",
      },
    ],
  },
  {
    id: "3",
    subject: "Billing discrepancy on latest invoice",
    preview:
      "Our invoice for this month shows 10 Pro licenses, but we only have 8 active users. Can you review...",
    timestamp: "8h ago",
    read: true,
    customer: mockCustomers[0],
    status: "pending",
    respondingUser: staffUsers[0],
    messages: [
      {
        id: "m6",
        sender: mockCustomers[0],
        content: `Hi CloudStar billing,

Our invoice for this month shows 10 Pro licenses, but we only have 8 active users in the workspace.

Can you review the charge before our finance team processes payment? We may have had two pending invites that were never accepted.`,
        timestamp: "7:54 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m7",
        sender: staffUsers[0],
        content: `Hi Sarah,

You're right to flag this. I checked the billing snapshot and it included two pending seats that should not have been counted after the invite window expired.

I'm sending a corrected invoice for 8 Pro licenses and applying the difference as a credit on the current billing period.`,
        timestamp: "8:31 AM",
        date: "Aug 29",
        isStaff: true,
      },
      {
        id: "m8",
        sender: mockCustomers[0],
        content: `Thanks, Peter. Please send the corrected invoice to finance@brightwave.co as well so our controller has the updated copy.`,
        timestamp: "8:46 AM",
        date: "Aug 29",
        isStaff: false,
      },
    ],
    agentSummary: [
      "Billing discrepancy is valid: two expired pending seats were included in the invoice.",
      "Sarah needs the corrected invoice sent to both her and the finance alias before payment is processed.",
    ],
    followUpLead:
      "The next reply should confirm the corrected invoice and CC finance:",
    suggestedFollowUp: `Hi Sarah, I sent the corrected invoice for 8 Pro licenses to you and finance@brightwave.co.

The two expired pending seats have been removed from this billing snapshot, and the difference is reflected as a credit.

Regards, Peter Lann`,
    previousConversations: [
      {
        id: "prev5",
        subject: "Annual contract renewal terms",
        timestamp: "1mo ago",
      },
      {
        id: "prev6",
        subject: "Adding temporary contractor seats",
        timestamp: "2mo ago",
      },
    ],
  },
  {
    id: "4",
    subject: "Can't reset my password",
    preview:
      'I tried to reset my CloudStar password using the "Forgot Password" link, but the reset email never...',
    timestamp: "12h ago",
    read: true,
    customer: mockCustomers[1],
    status: "active",
    respondingUser: staffUsers[1],
    messages: [
      {
        id: "m9",
        sender: mockCustomers[1],
        content: `Hi,

I tried to reset my CloudStar password using the "Forgot Password" link, but the reset email never arrived.

I've checked spam and quarantine. Our SSO is disabled for my account right now, so I'm blocked from getting into the dashboard.`,
        timestamp: "6:22 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m10",
        sender: staffUsers[1],
        content: `Hi Mike,

I checked our email logs and the reset message is being accepted by your mail server, but it is landing in a company quarantine rule before it reaches your inbox.

I can either send a one-time reset link to your backup email or coordinate with your workspace admin to re-enable SSO.`,
        timestamp: "6:48 AM",
        date: "Aug 29",
        isStaff: true,
      },
      {
        id: "m11",
        sender: mockCustomers[1],
        content: `Please use the backup email for now. I'll ask our admin to fix the quarantine rule after I'm back in.`,
        timestamp: "7:03 AM",
        date: "Aug 29",
        isStaff: false,
      },
    ],
    agentSummary: [
      "Mike is locked out because password reset emails are being quarantined by his company's mail rules.",
      "He asked for a one-time reset link to be sent to his backup email. Avoid asking him to check spam again.",
    ],
    followUpLead:
      "Send a security-conscious response that confirms the backup reset path:",
    suggestedFollowUp: `Hi Mike, I sent a one-time reset link to the backup email on your account.

For security, the link expires in 30 minutes. Once you're back in, your workspace admin can re-enable SSO and update the quarantine rule for future reset emails.

Thanks, Alex Chen`,
    previousConversations: [
      {
        id: "prev7",
        subject: "SSO certificate rotation",
        timestamp: "2w ago",
      },
      {
        id: "prev8",
        subject: "New developer workspace invite",
        timestamp: "1mo ago",
      },
    ],
  },
  {
    id: "5",
    subject: "Dashboard analytics not updating",
    preview:
      "The analytics dashboard stopped updating yesterday around 3 PM. All charts are stuck at t...",
    timestamp: "1d ago",
    read: true,
    customer: mockCustomers[0],
    status: "closed",
    assignee: staffUsers[0],
    messages: [
      {
        id: "m12",
        sender: mockCustomers[0],
        content: `Hi CloudStar,

The analytics dashboard stopped updating yesterday around 3 PM. All charts are stuck at the same values even though new campaigns are running.

Can you confirm whether this is a data delay or something wrong with our workspace?`,
        timestamp: "3:18 PM",
        date: "Aug 28",
        isStaff: false,
      },
      {
        id: "m13",
        sender: staffUsers[0],
        content: `Hi Sarah,

We found a delayed warehouse job affecting a small number of marketing workspaces. Your raw events are still being collected; only the dashboard aggregation is behind.

The replay job is running now, and I expect the charts to catch up within the hour.`,
        timestamp: "3:44 PM",
        date: "Aug 28",
        isStaff: true,
      },
      {
        id: "m14",
        sender: mockCustomers[0],
        content: `Confirmed, the dashboard has caught up on our side. Thanks for the quick fix.`,
        timestamp: "4:29 PM",
        date: "Aug 28",
        isStaff: false,
      },
    ],
    agentSummary: [
      "Dashboard aggregation delay was resolved after replaying the warehouse job.",
      "Sarah confirmed the charts caught up, so the ticket can stay closed unless she reports another lag.",
    ],
    followUpLead:
      "No follow-up is required unless the customer replies again. If reopened, acknowledge the prior incident:",
    suggestedFollowUp: `Hi Sarah, thanks for confirming the dashboard caught up.

We'll keep monitoring the aggregation job for this workspace and reopen the ticket if the lag returns.

Regards, Peter Lann`,
    previousConversations: [
      {
        id: "prev9",
        subject: "Campaign attribution report export",
        timestamp: "3w ago",
      },
      {
        id: "prev10",
        subject: "Dashboard timezone setting",
        timestamp: "2mo ago",
      },
    ],
  },
  {
    id: "6",
    subject: "Request for HIPAA compliance details",
    preview:
      "Before we move forward with onboarding, our legal team would like documentation on CloudSt...",
    timestamp: "2w ago",
    read: true,
    customer: mockCustomers[1],
    status: "pending",
    assignee: staffUsers[1],
    messages: [
      {
        id: "m15",
        sender: mockCustomers[1],
        content: `Hi CloudStar,

Before we move forward with onboarding, our legal team would like documentation on CloudStar's HIPAA controls.

Can you share the current security packet, BAA process, and any notes about data retention for exported reports?`,
        timestamp: "11:12 AM",
        date: "Aug 15",
        isStaff: false,
      },
      {
        id: "m16",
        sender: staffUsers[1],
        content: `Hi Mike,

I can share our standard security packet and retention summary today. The BAA request needs to go through our compliance queue, but I can start that intake for your legal team.

Do you want the packet sent to you directly, or should I include a legal contact?`,
        timestamp: "11:38 AM",
        date: "Aug 15",
        isStaff: true,
      },
      {
        id: "m17",
        sender: mockCustomers[1],
        content: `Please include legal@techcorp.io and keep me copied. Our review meeting is next Wednesday.`,
        timestamp: "12:04 PM",
        date: "Aug 15",
        isStaff: false,
      },
    ],
    agentSummary: [
      "TechCorp legal needs HIPAA documentation, data retention notes, and the BAA intake started before next Wednesday.",
      "Mike asked to include legal@techcorp.io and keep him copied. This is pending because compliance intake is not finished yet.",
    ],
    followUpLead:
      "The next reply should confirm the security packet and BAA intake status:",
    suggestedFollowUp: `Hi Mike, I've sent the security packet and retention summary to you and legal@techcorp.io.

I also opened the BAA intake with our compliance team and will send the next status update before your review meeting next Wednesday.

Thanks, Alex Chen`,
    previousConversations: [
      {
        id: "prev11",
        subject: "Enterprise onboarding checklist",
        timestamp: "3w ago",
      },
      {
        id: "prev12",
        subject: "Data export retention settings",
        timestamp: "1mo ago",
      },
    ],
  },
  {
    id: "7",
    subject: "Need SAML metadata refreshed",
    preview:
      "Our identity provider rotated certificates overnight and SSO logins started failing for a subset of users...",
    timestamp: "3h ago",
    read: false,
    customer: mockCustomers[1],
    status: "active",
    respondingUser: staffUsers[1],
    messages: [
      {
        id: "m18",
        sender: mockCustomers[1],
        content: `Hi CloudStar,

Our identity provider rotated certificates overnight and SSO logins started failing for a subset of users this morning.

Can you confirm whether we need to upload a fresh metadata file, or if the old configuration should still work?`,
        timestamp: "9:12 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m19",
        sender: staffUsers[1],
        content: `Hi Mike,

The new certificate is not visible in the current metadata file on our side, so the safest fix is to upload the refreshed IdP metadata in the SSO settings.

Once that's in place, I can verify the new signing certificate and confirm logins are healthy again.`,
        timestamp: "9:34 AM",
        date: "Aug 29",
        isStaff: true,
      },
    ],
    agentSummary: [
      "SSO failures started after an IdP certificate rotation.",
      "Alex should confirm the metadata refresh path and verify the new signing certificate once uploaded.",
    ],
    followUpLead:
      "The next reply should confirm the metadata upload and offer to verify the certificate:",
    suggestedFollowUp: `Hi Mike, once you upload the refreshed IdP metadata I can verify the new certificate on our side and confirm SSO logins are working again.

If you'd prefer, I can stay on the ticket while your admin completes the update.

Thanks, Alex Chen`,
    previousConversations: [
      {
        id: "prev13",
        subject: "SSO login timeout settings",
        timestamp: "5d ago",
      },
      {
        id: "prev14",
        subject: "Workspace SCIM provisioning sync",
        timestamp: "3w ago",
      },
    ],
  },
  {
    id: "8",
    subject: "Webhook delivery failing for staging",
    preview:
      "Deliveries to our staging webhook endpoint started returning 401 after yesterday's secret rotation...",
    timestamp: "5h ago",
    read: false,
    customer: mockCustomers[0],
    status: "pending",
    respondingUser: staffUsers[0],
    messages: [
      {
        id: "m20",
        sender: mockCustomers[0],
        content: `Hi support,

Deliveries to our staging webhook endpoint started returning 401 after yesterday's secret rotation.

Production still looks fine, but staging notifications are no longer reaching our test environment.`,
        timestamp: "8:14 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m21",
        sender: staffUsers[0],
        content: `Hi Sarah,

I checked the webhook logs and staging is still using the previous signing secret. Production was updated correctly, but staging was left behind during the rotation.

I'm preparing a fresh test delivery once the new secret is saved.`,
        timestamp: "8:39 AM",
        date: "Aug 29",
        isStaff: true,
      },
    ],
    agentSummary: [
      "Staging webhook deliveries fail with 401 because the rotated secret was not updated there.",
      "Peter should confirm the secret change and include one successful test delivery in the reply.",
    ],
    followUpLead:
      "The next response should confirm the new secret and mention the test event:",
    suggestedFollowUp: `Hi Sarah, I updated the staging webhook secret and sent a fresh test delivery successfully.

You should start seeing new staging notifications arrive normally again.

Regards, Peter Lann`,
    previousConversations: [
      {
        id: "prev15",
        subject: "Webhook retries delayed",
        timestamp: "4d ago",
      },
      {
        id: "prev16",
        subject: "Endpoint verification header",
        timestamp: "2w ago",
      },
    ],
  },
  {
    id: "9",
    subject: "Can we export audit logs by date range",
    preview:
      "Our security team needs an audit log export for the last 30 days, filtered down to admin permission changes...",
    timestamp: "9h ago",
    read: true,
    customer: mockCustomers[1],
    status: "active",
    respondingUser: staffUsers[1],
    messages: [
      {
        id: "m22",
        sender: mockCustomers[1],
        content: `Hi CloudStar,

Our security team needs an audit log export for the last 30 days, filtered down to admin permission changes.

Is that something we can generate in the product, or does your team need to prepare it?`,
        timestamp: "7:21 AM",
        date: "Aug 29",
        isStaff: false,
      },
      {
        id: "m23",
        sender: staffUsers[1],
        content: `Hi Mike,

You can export audit logs by date range in the admin console, but the current UI doesn't support filtering only permission changes.

I can generate that filtered export for you today and also share the path for the standard self-serve export.`,
        timestamp: "7:46 AM",
        date: "Aug 29",
        isStaff: true,
      },
    ],
    agentSummary: [
      "Mike needs a 30-day audit log export filtered to admin permission changes.",
      "Alex can provide the filtered export manually and point him to the self-serve audit export for future requests.",
    ],
    followUpLead:
      "The next reply should include timing for the filtered export and the self-serve path:",
    suggestedFollowUp: `Hi Mike, I can prepare the filtered export for admin permission changes today and send it directly once it's ready.

For future requests, the standard date-range export is available in the admin console under Audit Logs > Export.

Thanks, Alex Chen`,
    previousConversations: [
      {
        id: "prev17",
        subject: "Audit log retention period",
        timestamp: "2w ago",
      },
      {
        id: "prev18",
        subject: "Admin role change history",
        timestamp: "1mo ago",
      },
    ],
  },
  {
    id: "10",
    subject: "Mobile push alerts are too noisy",
    preview:
      "Our on-call team is getting duplicate push notifications for resolved incidents and it's creating alert fatigue...",
    timestamp: "1d ago",
    read: true,
    customer: mockCustomers[0],
    status: "pending",
    respondingUser: staffUsers[0],
    messages: [
      {
        id: "m24",
        sender: mockCustomers[0],
        content: `Hi team,

Our on-call group is getting duplicate push notifications for incidents that were already resolved.

Can you check whether the mobile app is re-sending alerts from cached activity?`,
        timestamp: "2:08 PM",
        date: "Aug 28",
        isStaff: false,
      },
      {
        id: "m25",
        sender: staffUsers[0],
        content: `Hi Sarah,

I found a duplicate notification rule tied to a legacy escalation policy in your workspace. The mobile app is showing both the current and older policy alerts.

I've disabled the outdated rule and I'm watching for any repeated notifications over the next hour.`,
        timestamp: "2:34 PM",
        date: "Aug 28",
        isStaff: true,
      },
    ],
    agentSummary: [
      "Duplicate push alerts are coming from an old escalation rule that was still enabled.",
      "Peter disabled the outdated rule and should confirm whether any duplicates continue to appear.",
    ],
    followUpLead:
      "The next reply should confirm the cleanup and ask for one final check from the on-call team:",
    suggestedFollowUp: `Hi Sarah, I removed the outdated escalation rule that was causing duplicate mobile notifications.

Please let me know if your on-call team sees any repeated alerts after the next incident cycle.

Regards, Peter Lann`,
    previousConversations: [
      {
        id: "prev19",
        subject: "Notification digest settings",
        timestamp: "1w ago",
      },
      {
        id: "prev20",
        subject: "Escalation policy cleanup",
        timestamp: "2mo ago",
      },
    ],
  },
  {
    id: "11",
    subject: "Unexpected archive rule triggered",
    preview:
      "A batch of recently updated records was archived overnight even though their status should have kept them active...",
    timestamp: "2d ago",
    read: true,
    customer: mockCustomers[1],
    status: "closed",
    assignee: staffUsers[1],
    messages: [
      {
        id: "m26",
        sender: mockCustomers[1],
        content: `Hi support,

A batch of recently updated records was archived overnight even though their status should have kept them active.

We restored a few manually, but I want to understand whether this was an automation issue or a policy problem.`,
        timestamp: "10:17 AM",
        date: "Aug 27",
        isStaff: false,
      },
      {
        id: "m27",
        sender: staffUsers[1],
        content: `Hi Mike,

This came from an older archive automation that still matched records with a stale tag value. I disabled that rule and restored the affected records in bulk.

The current status-based rule is still correct, so no additional action is needed on your side.`,
        timestamp: "10:44 AM",
        date: "Aug 27",
        isStaff: true,
      },
    ],
    agentSummary: [
      "An outdated archive automation matched a stale tag and archived active records incorrectly.",
      "The bad rule was disabled and the records were restored, so this can stay closed unless the batch issue returns.",
    ],
    followUpLead:
      "No immediate follow-up is required. If reopened, reference the disabled archive rule:",
    suggestedFollowUp: `Hi Mike, the outdated archive automation was disabled and the affected records were restored in bulk.

If you see another unexpected archive event, reply here and we'll reopen the investigation with the exact rule history attached.

Thanks, Alex Chen`,
    previousConversations: [
      {
        id: "prev21",
        subject: "Archive rule filter question",
        timestamp: "9d ago",
      },
      {
        id: "prev22",
        subject: "Bulk restore request",
        timestamp: "1mo ago",
      },
    ],
  },
  {
    id: "12",
    subject: "Can we merge duplicate contacts",
    preview:
      "We imported the same customer list twice and now several contacts appear duplicated across the workspace...",
    timestamp: "2d ago",
    read: true,
    customer: mockCustomers[0],
    status: "active",
    respondingUser: staffUsers[0],
    messages: [
      {
        id: "m28",
        sender: mockCustomers[0],
        content: `Hi CloudStar,

We imported the same customer list twice and now several contacts appear duplicated across the workspace.

Is there a merge action we can run, or do you need to deduplicate them from your side?`,
        timestamp: "11:26 AM",
        date: "Aug 27",
        isStaff: false,
      },
      {
        id: "m29",
        sender: staffUsers[0],
        content: `Hi Sarah,

There's no self-serve merge action for contacts yet, but I can run a deduplication job using email as the primary key and send you a review list before anything changes.

That will keep the safest path while we confirm there are no legitimate duplicates in the import.`,
        timestamp: "11:51 AM",
        date: "Aug 27",
        isStaff: true,
      },
    ],
    agentSummary: [
      "Sarah imported duplicate contacts and needs a safe deduplication path.",
      "Peter should send a review list first because there is no self-serve merge for contacts yet.",
    ],
    followUpLead:
      "The next reply should offer the review list and explain the merge rule briefly:",
    suggestedFollowUp: `Hi Sarah, I can send a review list of the duplicate contacts and then run the deduplication using email as the primary key once you confirm it looks correct.

That will avoid merging any contacts that should stay separate.

Regards, Peter Lann`,
    previousConversations: [
      {
        id: "prev23",
        subject: "CSV import field mapping",
        timestamp: "1w ago",
      },
      {
        id: "prev24",
        subject: "Contact ownership reassignment",
        timestamp: "6w ago",
      },
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

function getStatusColor(status: TicketStatus) {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "pending":
      return "bg-amber-500";
    case "closed":
      return "bg-muted-foreground";
    default:
      return "bg-muted-foreground";
  }
}

interface TicketListPanelProps {
  tickets: Ticket[];
  selectedTicketId: string | null;
  onTicketSelect: (ticketId: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

function TicketListPanel({
  tickets,
  selectedTicketId,
  onTicketSelect,
  searchQuery,
  onSearchChange,
}: TicketListPanelProps) {
  return (
    <div className="bg-background flex h-full w-1/4 max-w-[320px] min-w-[240px] shrink-0 flex-col overflow-hidden border-r">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <div className="relative w-full">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search threads..."
            className="h-9 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        {tickets.length > 0 ? (
          tickets.map((ticket) => {
            const isSelected = selectedTicketId === ticket.id;

            return (
              <button
                type="button"
                key={ticket.id}
                onClick={() => onTicketSelect(ticket.id)}
                className={cn(
                  "hover:bg-muted/50 w-full border-b p-4 text-left text-sm leading-tight last:border-b-0",
                  !ticket.read && "bg-muted/30",
                  isSelected && "bg-muted",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        !ticket.read && "font-semibold",
                      )}
                    >
                      {ticket.subject}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {ticket.timestamp}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                    {ticket.preview}
                  </p>
                  {ticket.respondingUser && (
                    <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                      <Avatar className="size-4">
                        <AvatarImage
                          src={ticket.respondingUser.avatar}
                          alt={ticket.respondingUser.name}
                        />
                        <AvatarFallback className="text-[8px]">
                          {getInitials(ticket.respondingUser.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span>
                        {ticket.respondingUser.name.split(" ")[0]} is
                        responding...
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <div className="text-muted-foreground flex min-h-full items-center justify-center p-6 text-center text-sm">
            No threads match this search.
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const sender = message.sender;
  const isCustomer = "company" in sender;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar className="mt-0.5 size-10 shrink-0">
          <AvatarImage src={sender.avatar} alt={sender.name} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
            {getInitials(sender.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{sender.name}</span>
            {!isCustomer && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                Staff
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span>From</span>
            <span>{sender.email}</span>
          </div>
          <span className="text-muted-foreground text-xs">
            {message.date}, {message.timestamp}
          </span>
        </div>
      </div>
      <div className="pl-13 text-sm leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

interface ReplyComposerProps {
  recipientEmail: string;
  respondingUser?: User;
}

function ReplyComposer({ recipientEmail, respondingUser }: ReplyComposerProps) {
  return (
    <div className="bg-background shrink-0 border-t px-6 py-4 lg:px-10">
      <div className="bg-muted/30 mx-auto max-w-3xl rounded-lg border">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <ArrowLeft className="text-muted-foreground size-4 shrink-0 rotate-[135deg]" />
          <span className="text-muted-foreground truncate text-sm">
            {recipientEmail}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 shrink-0 px-2 text-xs"
          >
            Cc
          </Button>
        </div>
        <Textarea
          placeholder="Write a reply..."
          className="min-h-[80px] resize-none border-0 bg-transparent focus-visible:ring-0 md:min-h-[100px]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-8 shrink-0">
              <Plus className="size-4" />
            </Button>
            <span className="text-muted-foreground hidden text-xs sm:inline">
              Use <kbd className="bg-muted rounded px-1">/</kbd> for shortcuts
            </span>
          </div>
          <div className="flex items-center gap-2">
            {respondingUser && (
              <div className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
                <Avatar className="size-5">
                  <AvatarImage
                    src={respondingUser.avatar}
                    alt={respondingUser.name}
                  />
                  <AvatarFallback className="text-[8px]">
                    {getInitials(respondingUser.name)}
                  </AvatarFallback>
                </Avatar>
                <span>
                  {respondingUser.name.split(" ")[0]} is responding...
                </span>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  Close
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Close as resolved</DropdownMenuItem>
                <DropdownMenuItem>Close as spam</DropdownMenuItem>
                <DropdownMenuItem>Close without reply</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-1">
              <Send className="size-3" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxAgentPanel({
  ticket,
  className,
}: {
  ticket: Ticket;
  className?: string;
}) {
  const customer = ticket.customer;

  return (
    <div
      className={cn(
        "bg-background flex h-full w-1/4 max-w-[360px] min-w-[280px] shrink-0 flex-col overflow-hidden border-l",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Sparkles className="size-4" />
        <span className="font-semibold">Inbox Agent</span>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-6 p-4">
          <section className="flex flex-col gap-3">
            <div className="min-w-0">
              <div className="font-medium">{customer.name}</div>
              <div className="text-muted-foreground mt-1 text-sm leading-6">
                {customer.role}, {customer.company}
              </div>
              {customer.isHighValue && (
                <Badge
                  variant="outline"
                  className="mt-3 border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                >
                  High value customer
                </Badge>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
              Signals
            </p>
            <div className="flex flex-col gap-3">
              {ticket.agentSummary.map((summary) => (
                <div
                  key={summary}
                  className="border-primary/15 border-l-2 pl-3 text-sm leading-6"
                >
                  {summary}
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
              Suggested follow up
            </p>
            <p className="text-muted-foreground text-sm leading-6">
              {ticket.followUpLead}
            </p>
            <div className="bg-background rounded-xl border px-4 py-4 text-sm leading-6 whitespace-pre-wrap">
              {ticket.suggestedFollowUp}
            </div>
            <Button variant="outline" className="w-full gap-2">
              <Clock className="size-4" />
              Schedule follow up
            </Button>
          </section>

          <section className="flex flex-col gap-3">
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
              Previous conversations
            </p>
            <div className="overflow-hidden rounded-xl border">
              {ticket.previousConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className="hover:bg-muted flex w-full items-start justify-between gap-2 border-b p-3 text-left last:border-b-0"
                >
                  <span className="line-clamp-2 text-sm">
                    {conversation.subject}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {conversation.timestamp}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

export function ProjectManagementInbox1() {
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(
    mockTickets[0]?.id ?? null,
  );
  const [tickets, setTickets] = React.useState<Ticket[]>(mockTickets);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isAgentPanelOpen, setIsAgentPanelOpen] = React.useState(true);
  const [isMobileConversationOpen, setIsMobileConversationOpen] =
    React.useState(false);
  const [isMobileAgentOpen, setIsMobileAgentOpen] = React.useState(false);
  const deferredSearchQuery = React.useDeferredValue(searchQuery);

  const filteredTickets = React.useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();

    if (!query) {
      return tickets;
    }

    return tickets.filter((ticket) => {
      const searchableParts = [
        ticket.subject,
        ticket.preview,
        ticket.customer.name,
        ticket.customer.email,
        ticket.customer.company,
        ...ticket.messages.map((message) => message.content),
      ];

      return searchableParts.some((part) => part.toLowerCase().includes(query));
    });
  }, [deferredSearchQuery, tickets]);

  React.useEffect(() => {
    if (filteredTickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }

    if (!filteredTickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(filteredTickets[0].id);
    }
  }, [filteredTickets, selectedTicketId]);

  const selectedTicket =
    tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const handleTicketSelect = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, read: true } : ticket,
      ),
    );

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobileConversationOpen(true);
    }
  };

  return (
    <div
      data-layout="fixed"
      className="bg-background text-foreground flex min-h-0 flex-1 overflow-hidden"
    >
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden md:hidden">
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="size-5 shrink-0" />
            <span className="truncate font-semibold">Inbox</span>
          </div>
          <Badge variant="secondary">{filteredTickets.length}</Badge>
        </div>
        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search threads..."
              className="h-9 pl-9 shadow-none"
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]>div]:!block">
          {filteredTickets.length > 0 ? (
            filteredTickets.map((ticket) => {
              const isSelected = selectedTicketId === ticket.id;

              return (
                <button
                  type="button"
                  key={ticket.id}
                  onClick={() => handleTicketSelect(ticket.id)}
                  className={cn(
                    "hover:bg-muted/50 w-full border-b p-4 text-left text-sm leading-tight last:border-b-0",
                    !ticket.read && "bg-muted/30",
                    isSelected && "bg-muted",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          !ticket.read && "font-semibold",
                        )}
                      >
                        {ticket.subject}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {ticket.timestamp}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                      {ticket.preview}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="text-muted-foreground flex min-h-full items-center justify-center p-6 text-center text-sm">
              No threads match this search.
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="hidden min-w-0 flex-1 overflow-hidden md:flex">
        <TicketListPanel
          tickets={filteredTickets}
          selectedTicketId={selectedTicketId}
          onTicketSelect={handleTicketSelect}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedTicket ? (
            <>
              <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <MessageSquare className="size-5 shrink-0" />
                  <span className="truncate font-medium">
                    Re: {selectedTicket.subject}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            getStatusColor(selectedTicket.status),
                          )}
                        />
                        <span className="capitalize">
                          {selectedTicket.status}
                        </span>
                        <ChevronDown className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Active</DropdownMenuItem>
                      <DropdownMenuItem>Pending</DropdownMenuItem>
                      <DropdownMenuItem>Closed</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setIsAgentPanelOpen(!isAgentPanelOpen)}
                  >
                    <PanelRight
                      className={cn(
                        "size-4",
                        isAgentPanelOpen && "text-primary",
                      )}
                    />
                  </Button>
                </div>
              </header>

              <ScrollArea className="min-h-0 flex-1">
                <div className="px-6 py-6 lg:px-10">
                  <div className="mx-auto flex max-w-3xl flex-col gap-8">
                    {selectedTicket.messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                  </div>
                </div>
              </ScrollArea>

              <ReplyComposer
                recipientEmail={selectedTicket.customer.email}
                respondingUser={selectedTicket.respondingUser}
              />
            </>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto size-12 opacity-50" />
                <p className="mt-2 text-sm">Select a ticket to view</p>
              </div>
            </div>
          )}
        </div>

        {isAgentPanelOpen && selectedTicket && (
          <InboxAgentPanel ticket={selectedTicket} />
        )}
      </div>

      <Drawer
        open={isMobileConversationOpen}
        onOpenChange={setIsMobileConversationOpen}
      >
        <DrawerContent className="h-[90vh] overflow-hidden md:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Conversation</DrawerTitle>
          </DrawerHeader>
          {selectedTicket ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
                <span className="line-clamp-1 min-w-0 font-medium">
                  {selectedTicket.subject}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setIsMobileAgentOpen(true)}
                >
                  <Sparkles className="size-4" />
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-6 p-4">
                  {selectedTicket.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </div>
              </ScrollArea>
              <ReplyComposer
                recipientEmail={selectedTicket.customer.email}
                respondingUser={selectedTicket.respondingUser}
              />
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>

      <Drawer open={isMobileAgentOpen} onOpenChange={setIsMobileAgentOpen}>
        <DrawerContent className="h-[85vh] overflow-hidden md:hidden">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Inbox Agent
            </DrawerTitle>
          </DrawerHeader>
          {selectedTicket ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <InboxAgentPanel
                ticket={selectedTicket}
                className="w-full max-w-none min-w-0 border-l-0"
              />
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

import { getAvatarUrl } from "@/lib/assets/avatars";
import type { Project as ProjectListItem } from "@/lib/data/projects";
import { projects } from "@/lib/data/projects";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export type User = {
  id: string;
  name: string;
  avatarUrl?: string;
  role?: string;
};

export type ProjectMeta = {
  priorityLabel: string;
  locationLabel: string;
  sprintLabel: string;
  lastSyncLabel: string;
};

export type ProjectScope = {
  inScope: string[];
  outOfScope: string[];
};

export type KeyFeatures = {
  p0: string[];
  p1: string[];
  p2: string[];
};

export type TimelineTask = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: "planned" | "in-progress" | "done";
};

export type WorkstreamTaskStatus = "todo" | "in-progress" | "done";

export type WorkstreamTask = {
  id: string;
  name: string;
  status: WorkstreamTaskStatus;
  dueLabel?: string;
  dueTone?: "danger" | "warning" | "muted";
  assignee?: User;
  /** Optional start date for the task (used in task views). */
  startDate?: Date;
  /** Optional priority identifier for the task. */
  priority?: "no-priority" | "low" | "medium" | "high" | "urgent";
  /** Optional tag label for the task (e.g. Feature, Bug). */
  tag?: string;
  /** Optional short description used in task lists. */
  description?: string;
};

export type WorkstreamGroup = {
  id: string;
  name: string;
  tasks: WorkstreamTask[];
};

export type ProjectTask = WorkstreamTask & {
  projectId: string;
  projectName: string;
  workstreamId: string;
  workstreamName: string;
};

export type TimeSummary = {
  estimateLabel: string;
  dueDate: Date;
  daysRemainingLabel: string;
  progressPercent: number;
};

export type BacklogSummary = {
  statusLabel: "Active" | "Backlog" | "Planned" | "Completed" | "Cancelled";
  groupLabel: string;
  priorityLabel: string;
  labelBadge: string;
  picUsers: User[];
  supportUsers?: User[];
};

export type QuickLink = {
  id: string;
  name: string;
  type: "pdf" | "zip" | "fig" | "doc" | "file";
  sizeMB: number;
  url: string;
};

export type ProjectFile = QuickLink & {
  addedBy: User;
  addedDate: Date;
  description?: string;
  isLinkAsset?: boolean;
  attachments?: QuickLink[];
};

export type NoteType = "general" | "meeting" | "audio";
export type NoteStatus = "completed" | "processing";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  timestamp: string;
  text: string;
};

export type AudioNoteData = {
  duration: string;
  fileName: string;
  aiSummary: string;
  keyPoints: string[];
  insights: string[];
  transcript: TranscriptSegment[];
};

export type ProjectNote = {
  id: string;
  title: string;
  content?: string;
  noteType: NoteType;
  status: NoteStatus;
  addedDate: Date;
  addedBy: User;
  audioData?: AudioNoteData;
};

export type ProjectDetails = {
  id: string;
  name: string;
  description: string;
  meta: ProjectMeta;
  scope: ProjectScope;
  outcomes: string[];
  keyFeatures: KeyFeatures;
  timelineTasks: TimelineTask[];
  workstreams: WorkstreamGroup[];
  time: TimeSummary;
  backlog: BacklogSummary;
  quickLinks: QuickLink[];
  files: ProjectFile[];
  notes: ProjectNote[];
  source?: ProjectListItem;
};

export function getProjectTasks(details: ProjectDetails): ProjectTask[] {
  const workstreams = details.workstreams ?? [];

  return workstreams.flatMap((group) =>
    group.tasks.map((task) => ({
      ...task,
      projectId: details.id,
      projectName: details.name,
      workstreamId: group.id,
      workstreamName: group.name,
    })),
  );
}

function userFromName(name: string, role?: string): User {
  return {
    id: name.trim().toLowerCase().replace(/\s+/g, "-"),
    name,
    avatarUrl: getAvatarUrl(name),
    role,
  };
}

function baseDetailsFromListItem(p: ProjectListItem): ProjectDetails {
  const picUsers = p.members.length
    ? p.members.map((n) => userFromName(n, "PIC"))
    : [userFromName("Alex Morgan", "PIC")];
  const today = new Date();

  return {
    id: p.id,
    name: p.name,
    description: p.client
      ? `Project for ${p.client}. This is mock content that will be replaced by API later.`
      : "This is mock content that will be replaced by API later.",
    meta: {
      priorityLabel: p.priority.charAt(0).toUpperCase() + p.priority.slice(1),
      locationLabel: "United States",
      sprintLabel:
        p.typeLabel && p.durationLabel
          ? `${p.typeLabel} ${p.durationLabel}`
          : (p.durationLabel ?? "Roadmap 4 weeks"),
      lastSyncLabel: "Just now",
    },
    scope: {
      inScope: [
        "Define scope",
        "Draft solution",
        "Validate with stakeholders",
        "Prepare handoff",
      ],
      outOfScope: ["Backend logic changes", "Marketing landing pages"],
    },
    outcomes: [
      "Reduce steps and improve usability",
      "Increase success rate",
      "Deliver production-ready UI",
    ],
    keyFeatures: {
      p0: ["Core user flow"],
      p1: ["Filters and empty states"],
      p2: ["Visual polish"],
    },
    workstreams: [
      {
        id: `${p.id}-ws-1`,
        name: "Initial discovery & alignment",
        tasks: [
          {
            id: `${p.id}-ws-1-t1`,
            name: "Kickoff with stakeholders",
            status: "done",
            dueLabel: "Today",
            dueTone: "muted",
            assignee: picUsers[0],
            startDate: today,
          },
          {
            id: `${p.id}-ws-1-t2`,
            name: "Define problem statement",
            status: "in-progress",
            dueLabel: "Tomorrow",
            dueTone: "warning",
            assignee: picUsers[0],
            startDate: addDays(today, 1),
          },
          {
            id: `${p.id}-ws-1-t3`,
            name: "Collect existing assets",
            status: "todo",
            startDate: addDays(today, 2),
          },
        ],
      },
      {
        id: `${p.id}-ws-2`,
        name: "Design & validation",
        tasks: [
          {
            id: `${p.id}-ws-2-t1`,
            name: "Draft wireframes",
            status: "todo",
            startDate: addDays(today, 3),
          },
          {
            id: `${p.id}-ws-2-t2`,
            name: "Review with team",
            status: "todo",
            startDate: addDays(today, 4),
          },
        ],
      },
    ],
    timelineTasks: [
      {
        id: `${p.id}-t1`,
        name: "Audit existing flows",
        startDate: new Date(2025, 11, 22), // Mon
        endDate: new Date(2025, 11, 23), // Tue
        status: "done",
      },
      {
        id: `${p.id}-t2`,
        name: "Build core workflow foundations",
        startDate: new Date(2025, 11, 23), // Tue
        endDate: new Date(2025, 11, 25), // Thu
        status: "in-progress",
      },
      {
        id: `${p.id}-t3`,
        name: "Usability testing",
        startDate: new Date(2025, 11, 25), // Thu
        endDate: new Date(2025, 11, 27), // Sat
        status: "planned",
      },
      {
        id: `${p.id}-t4`,
        name: "Iterate based on feedback",
        startDate: new Date(2025, 11, 27), // Sat
        endDate: new Date(2025, 11, 28), // Sun
        status: "planned",
      },
    ],
    time: {
      estimateLabel: "6 weeks",
      dueDate: new Date(2026, 1, 14),
      daysRemainingLabel: "34 days left",
      progressPercent: 58,
    },
    backlog: {
      statusLabel: "Active",
      groupLabel: "None",
      priorityLabel: p.priority.charAt(0).toUpperCase() + p.priority.slice(1),
      labelBadge: "Design",
      picUsers,
      supportUsers: [userFromName("Support", "Support")],
    },
    quickLinks: [],
    files: [],
    notes: [
      {
        id: `${p.id}-note-1`,
        title: "Project review",
        noteType: "audio",
        status: "completed",
        addedDate: new Date(2025, 6, 12),
        addedBy: picUsers[0],
        audioData: {
          duration: "00:02:21",
          fileName: "project-review-meeting.mp3",
          aiSummary:
            "The team reviewed project operations, clarified the next sprint boundaries, and agreed to tighten how work moves from intake into implementation. Open questions center on permissions, issue routing, and what dashboard metrics should be visible at launch.",
          keyPoints: [
            "Issue intake needs owner and status clarity",
            "Role permissions should be validated before build",
            "Dashboard metrics will start with cycle time and open blockers",
            "Team wants fewer handoff gaps between planning and execution",
          ],
          insights: [
            "Operational clarity matters more than visual novelty for launch",
            "Permissions are the biggest shared dependency",
            "A smaller analytics surface will reduce implementation risk",
          ],
          transcript: [
            {
              id: "t1",
              speaker: "SPK_1",
              timestamp: "0:00",
              text: "Let's use the detail screen to make the current project state obvious before anyone opens a separate report.",
            },
            {
              id: "t2",
              speaker: "SPK_2",
              timestamp: "0:15",
              text: "The biggest gap is ownership. A task can move across views without a clear responsible person.",
            },
            {
              id: "t3",
              speaker: "SPK_1",
              timestamp: "0:28",
              text: "Agreed. Intake, permissions, and blockers should be the first-pass scope.",
            },
            {
              id: "t4",
              speaker: "SPK_3",
              timestamp: "0:42",
              text: "For launch, keep analytics narrow: open blockers, cycle time, and overdue work.",
            },
            {
              id: "t5",
              speaker: "SPK_2",
              timestamp: "0:56",
              text: "That keeps the release practical and gives PMs what they need before standup.",
            },
          ],
        },
      },
      {
        id: `${p.id}-note-2`,
        title: "Sprint alignment",
        noteType: "meeting",
        status: "completed",
        addedDate: new Date(2024, 8, 18),
        addedBy: picUsers[0],
        content:
          "Reviewed current sprint goals, open issue states, and the handoff points between planning and implementation.",
      },
      {
        id: `${p.id}-note-3`,
        title: "Stakeholder feedback",
        noteType: "general",
        status: "completed",
        addedDate: new Date(2024, 8, 18),
        addedBy: picUsers[0],
        content:
          "Stakeholders want the detail screen to make ownership, blockers, and due windows visible without opening multiple tables.",
      },
      {
        id: `${p.id}-note-4`,
        title: "Operations brainstorm",
        noteType: "general",
        status: "completed",
        addedDate: new Date(2024, 8, 17),
        addedBy: picUsers[0],
        content:
          "Ideas for project intake improvements, including required fields, status transitions, and lightweight blocker prompts.",
      },
      {
        id: `${p.id}-note-5`,
        title: "Dashboard summary copy",
        noteType: "general",
        status: "completed",
        addedDate: new Date(2024, 8, 17),
        addedBy: picUsers[0],
        content:
          "Short labels for status summaries, blocker counts, and owner handoff states used throughout the PM dashboards.",
      },
      {
        id: `${p.id}-note-6`,
        title: "Trade-off",
        noteType: "meeting",
        status: "processing",
        addedDate: new Date(2024, 8, 17),
        addedBy: picUsers[0],
        content:
          "Notes about trade-offs between flexible custom fields and predictable project-management reporting.",
      },
      {
        id: `${p.id}-note-7`,
        title: "Roadmap",
        noteType: "general",
        status: "completed",
        addedDate: new Date(2024, 8, 16),
        addedBy: picUsers[0],
        content:
          "High-level roadmap for project operations: intake, issue planning, team capacity, and delivery reporting.",
      },
      {
        id: `${p.id}-note-8`,
        title: "Brainstorm",
        noteType: "general",
        status: "completed",
        addedDate: new Date(2024, 8, 16),
        addedBy: picUsers[0],
        content:
          "Rough brainstorming around potential integrations and automation opportunities.",
      },
    ],
    source: p,
  };
}

export function getProjectDetailsById(id: string): ProjectDetails {
  const base = projects.find((p) => p.id === id);

  const effectiveBase: ProjectListItem = base ?? {
    id,
    name: `Untitled project ${id}`,
    taskCount: 0,
    progress: 0,
    startDate: new Date(),
    endDate: new Date(),
    status: "planned",
    priority: "medium",
    tags: [],
    members: [],
    tasks: [],
  };

  const details = baseDetailsFromListItem(effectiveBase);

  if (base?.id === "2") {
    details.description =
      "Internal PM System brings project intake, issue planning, role permissions, and delivery reporting into one shared workspace. This detail view tracks the operations work needed to turn the existing dashboards, lists, and issue surfaces into a cohesive project management flow.";

    details.scope = {
      inScope: [
        "Unify project intake, issue lists, and dashboard navigation",
        "Define project roles, ownership states, and permission guardrails",
        "Build delivery reporting for blockers, cycle time, and team load",
        "Prepare reusable components for future project detail screens",
      ],
      outOfScope: [
        "Billing workflows",
        "Public client portals",
        "Native mobile release work",
      ],
    };

    details.outcomes = [
      "Reduce weekly project status preparation from 2 hours to 20 minutes",
      "Make every active issue traceable to an owner, due window, and workstream",
      "Give PMs one place to scan blockers before standup",
      "Ship a reusable detail pattern for the remaining project-management screens",
    ];

    details.keyFeatures = {
      p0: ["Issue intake pipeline", "Role-based project ownership"],
      p1: ["Blocker reporting", "Workstream-level task grouping"],
      p2: ["Saved views", "Stakeholder-ready status summaries"],
    };

    const primaryAssignee = details.backlog.picUsers[0];
    const today = new Date();

    const filesBaseDate = new Date(2024, 8, 18);

    const files: ProjectFile[] = [
      {
        id: "file-1",
        name: "PM-system-scope.pdf",
        type: "pdf",
        sizeMB: 4.2,
        url: "#",
        addedBy: primaryAssignee,
        addedDate: filesBaseDate,
      },
      {
        id: "file-2",
        name: "issue-flow-map.zip",
        type: "zip",
        sizeMB: 8.6,
        url: "#",
        addedBy: primaryAssignee,
        addedDate: filesBaseDate,
      },
      {
        id: "file-3",
        name: "project-ops-wireframes.fig",
        type: "fig",
        sizeMB: 11.4,
        url: "#",
        addedBy: primaryAssignee,
        addedDate: filesBaseDate,
      },
      {
        id: "file-4",
        name: "dashboard-metrics.fig",
        type: "fig",
        sizeMB: 9.8,
        url: "#",
        addedBy: primaryAssignee,
        addedDate: filesBaseDate,
      },
      {
        id: "file-5",
        name: "permission-matrix.pdf",
        type: "pdf",
        sizeMB: 2.7,
        url: "#",
        addedBy: primaryAssignee,
        addedDate: filesBaseDate,
      },
      {
        id: "file-6",
        name: "release-readiness.pdf",
        type: "pdf",
        sizeMB: 3.1,
        url: "#",
        addedBy: primaryAssignee,
        addedDate: filesBaseDate,
      },
    ];

    details.files = files;

    details.quickLinks = files.slice(0, 3);

    details.workstreams = [
      {
        id: "2-ws-1",
        name: "Project intake foundation",
        tasks: [
          {
            id: "2-ws-1-t1",
            name: "Map current intake states",
            status: "done",
            dueLabel: "Today",
            dueTone: "muted",
            assignee: primaryAssignee,
            startDate: today,
          },
          {
            id: "2-ws-1-t2",
            name: "Define required project fields",
            status: "todo",
            dueLabel: "Today",
            dueTone: "danger",
            assignee: primaryAssignee,
            startDate: today,
          },
          {
            id: "2-ws-1-t3",
            name: "Align statuses with issue views",
            status: "todo",
            dueLabel: "Tomorrow",
            dueTone: "warning",
            assignee: primaryAssignee,
            startDate: addDays(today, 1),
          },
          {
            id: "2-ws-1-t4",
            name: "Document intake edge cases",
            status: "todo",
            assignee: primaryAssignee,
            startDate: addDays(today, 2),
          },
        ],
      },
      {
        id: "2-ws-2",
        name: "Permissions and ownership",
        tasks: [
          {
            id: "2-ws-2-t1",
            name: "Draft role permission matrix",
            status: "in-progress",
            dueLabel: "This week",
            dueTone: "muted",
            assignee: primaryAssignee,
            startDate: addDays(today, 2),
          },
          {
            id: "2-ws-2-t2",
            name: "Validate owner and support rules",
            status: "todo",
            assignee: primaryAssignee,
            startDate: addDays(today, 3),
          },
          {
            id: "2-ws-2-t3",
            name: "Review access states with engineering",
            status: "todo",
            assignee: primaryAssignee,
            startDate: addDays(today, 4),
          },
        ],
      },
      {
        id: "2-ws-3",
        name: "Reporting and blockers",
        tasks: [
          {
            id: "2-ws-3-t1",
            name: "Define blocker summary logic",
            status: "todo",
            assignee: primaryAssignee,
            startDate: addDays(today, 3),
          },
          {
            id: "2-ws-3-t2",
            name: "Connect cycle-time cards to workstreams",
            status: "todo",
            assignee: primaryAssignee,
            startDate: addDays(today, 4),
          },
        ],
      },
      {
        id: "2-ws-4",
        name: "Reusable detail pattern",
        tasks: [
          {
            id: "2-ws-4-t1",
            name: "Extract shared project summary sections",
            status: "todo",
            assignee: primaryAssignee,
            startDate: addDays(today, 4),
          },
        ],
      },
      {
        id: "2-ws-5",
        name: "Launch readiness",
        tasks: [
          {
            id: "2-ws-5-t1",
            name: "Prepare handoff checklist for PM rollout",
            status: "todo",
            assignee: primaryAssignee,
            startDate: addDays(today, 5),
          },
        ],
      },
    ];
  }

  return details;
}

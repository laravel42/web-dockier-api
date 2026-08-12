export type ProjectManagementMemberRole = "Guest" | "Member" | "Admin";

export type ProjectManagementMemberStatus = "online" | "away" | "offline";

export type ProjectManagementProjectSummary = {
  id: string;
  name: string;
  code: string;
};

export type ProjectManagementMember = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: ProjectManagementMemberRole;
  status: ProjectManagementMemberStatus;
  joinedDate: string;
  teamIds: string[];
};

export type ProjectManagementTeam = {
  id: string;
  name: string;
  icon: string;
  joined: boolean;
  projectIds: string[];
};

export const projectManagementProjects: ProjectManagementProjectSummary[] = [
  { id: "proj-001", name: "Revenue Insights Revamp", code: "REV-241" },
  { id: "proj-002", name: "Enterprise Onboarding Flow", code: "ONB-118" },
  { id: "proj-003", name: "Claims Resolution Workspace", code: "CLM-084" },
  { id: "proj-004", name: "Retail Launch Readiness", code: "RTL-062" },
  { id: "proj-005", name: "Mobile Release Train", code: "MOB-092" },
  { id: "proj-006", name: "Inventory Accuracy Audit", code: "INV-176" },
  { id: "proj-007", name: "Knowledge Base Migration", code: "KB-057" },
  { id: "proj-008", name: "Partner SLA Tracker", code: "SLA-203" },
  { id: "proj-009", name: "Hiring Pipeline Cleanup", code: "HIR-074" },
  { id: "proj-010", name: "Renewal Forecast Console", code: "REN-133" },
  { id: "proj-011", name: "Field Ops Dispatch Board", code: "FLD-119" },
  { id: "proj-012", name: "Subscription Save Plays", code: "SUB-088" },
];

export const projectManagementTeams: ProjectManagementTeam[] = [
  {
    id: "OPS",
    name: "Operations",
    icon: "🧭",
    joined: true,
    projectIds: ["proj-001", "proj-004", "proj-006"],
  },
  {
    id: "GROWTH",
    name: "Growth",
    icon: "📈",
    joined: true,
    projectIds: ["proj-002", "proj-010"],
  },
  {
    id: "CX",
    name: "Customer Experience",
    icon: "💬",
    joined: false,
    projectIds: ["proj-003", "proj-007", "proj-012"],
  },
  {
    id: "MOBILE",
    name: "Mobile",
    icon: "📱",
    joined: true,
    projectIds: ["proj-005"],
  },
  {
    id: "PARTNER",
    name: "Partnerships",
    icon: "🤝",
    joined: false,
    projectIds: ["proj-008", "proj-010"],
  },
  {
    id: "TALENT",
    name: "Talent",
    icon: "🧲",
    joined: false,
    projectIds: ["proj-009"],
  },
  {
    id: "FIELD",
    name: "Field Services",
    icon: "🛠️",
    joined: false,
    projectIds: ["proj-011"],
  },
  {
    id: "PROGRAM",
    name: "Program Office",
    icon: "🗂️",
    joined: true,
    projectIds: ["proj-001", "proj-002", "proj-008"],
  },
];

export const projectManagementMembers: ProjectManagementMember[] = [
  {
    id: "riya-sharma",
    name: "Riya Sharma",
    email: "riya.sharma@shadcnblocks.dev",
    avatar: "/avatars/avatar-1.png",
    role: "Admin",
    status: "online",
    joinedDate: "2024-03-11",
    teamIds: ["OPS", "PROGRAM", "TALENT"],
  },
  {
    id: "ben-lewis",
    name: "Ben Lewis",
    email: "ben.lewis@shadcnblocks.dev",
    avatar: "/avatars/avatar-2.png",
    role: "Admin",
    status: "online",
    joinedDate: "2023-11-08",
    teamIds: ["OPS", "GROWTH"],
  },
  {
    id: "ava-reed",
    name: "Ava Reed",
    email: "ava.reed@shadcnblocks.dev",
    avatar: "/avatars/avatar-3.png",
    role: "Member",
    status: "online",
    joinedDate: "2024-04-22",
    teamIds: ["OPS", "CX", "PROGRAM"],
  },
  {
    id: "maya-rao",
    name: "Maya Rao",
    email: "maya.rao@shadcnblocks.dev",
    avatar: "/avatars/avatar-4.png",
    role: "Member",
    status: "away",
    joinedDate: "2024-01-17",
    teamIds: ["GROWTH", "PROGRAM"],
  },
  {
    id: "owen-lee",
    name: "Owen Lee",
    email: "owen.lee@shadcnblocks.dev",
    avatar: "/avatars/avatar-5.png",
    role: "Member",
    status: "offline",
    joinedDate: "2025-02-10",
    teamIds: ["GROWTH", "PARTNER"],
  },
  {
    id: "chloe-park",
    name: "Chloe Park",
    email: "chloe.park@shadcnblocks.dev",
    avatar: "/avatars/avatar-6.png",
    role: "Member",
    status: "online",
    joinedDate: "2024-09-03",
    teamIds: ["CX", "GROWTH"],
  },
  {
    id: "victor-hale",
    name: "Victor Hale",
    email: "victor.hale@shadcnblocks.dev",
    avatar: "/avatars/avatar-black-1.png",
    role: "Admin",
    status: "away",
    joinedDate: "2023-08-14",
    teamIds: ["GROWTH", "PARTNER", "OPS"],
  },
  {
    id: "kabir-sethi",
    name: "Kabir Sethi",
    email: "kabir.sethi@shadcnblocks.dev",
    avatar: "/avatars/avatar-black-2.png",
    role: "Member",
    status: "online",
    joinedDate: "2024-06-18",
    teamIds: ["CX", "PARTNER"],
  },
  {
    id: "dina-moss",
    name: "Dina Moss",
    email: "dina.moss@shadcnblocks.dev",
    avatar: "/avatars/avatar-black-3.png",
    role: "Guest",
    status: "offline",
    joinedDate: "2025-01-09",
    teamIds: ["CX", "PROGRAM"],
  },
  {
    id: "leo-park",
    name: "Leo Park",
    email: "leo.park@shadcnblocks.dev",
    avatar: "/avatars/avatar-black-4.png",
    role: "Member",
    status: "online",
    joinedDate: "2024-07-01",
    teamIds: ["MOBILE", "FIELD"],
  },
  {
    id: "sofia-ahmed",
    name: "Sofia Ahmed",
    email: "sofia.ahmed@shadcnblocks.dev",
    avatar: "/avatars/avatar-black-5.png",
    role: "Admin",
    status: "away",
    joinedDate: "2023-12-05",
    teamIds: ["OPS", "TALENT"],
  },
  {
    id: "tia-west",
    name: "Tia West",
    email: "tia.west@shadcnblocks.dev",
    avatar: "/avatars/avatar-black-6.png",
    role: "Member",
    status: "offline",
    joinedDate: "2025-03-07",
    teamIds: ["FIELD", "OPS"],
  },
  {
    id: "ethan-cole",
    name: "Ethan Cole",
    email: "ethan.cole@shadcnblocks.dev",
    avatar: "/avatars/avatar-bw-1.png",
    role: "Member",
    status: "online",
    joinedDate: "2024-05-13",
    teamIds: ["MOBILE"],
  },
  {
    id: "nina-brooks",
    name: "Nina Brooks",
    email: "nina.brooks@shadcnblocks.dev",
    avatar: "/avatars/avatar-bw-2.png",
    role: "Guest",
    status: "away",
    joinedDate: "2025-02-24",
    teamIds: ["MOBILE", "FIELD"],
  },
  {
    id: "jules-hart",
    name: "Jules Hart",
    email: "jules.hart@shadcnblocks.dev",
    avatar: "/avatars/avatar-bw-3.png",
    role: "Member",
    status: "online",
    joinedDate: "2024-08-26",
    teamIds: ["MOBILE", "CX"],
  },
  {
    id: "harper-singh",
    name: "Harper Singh",
    email: "harper.singh@shadcnblocks.dev",
    avatar: "/avatars/avatar-bw-4.png",
    role: "Member",
    status: "offline",
    joinedDate: "2024-10-15",
    teamIds: ["OPS", "TALENT"],
  },
];

const teamById = new Map(
  projectManagementTeams.map((team) => [team.id, team] as const),
);

const projectById = new Map(
  projectManagementProjects.map((project) => [project.id, project] as const),
);

export const projectManagementStatusColors: Record<
  ProjectManagementMemberStatus,
  string
> = {
  online: "#16a34a",
  away: "#eab308",
  offline: "#71717a",
};

export function getProjectManagementInitials(name: string) {
  return name
    .split(" ")
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getProjectManagementTeamMembers(teamId: string) {
  return projectManagementMembers.filter((member) =>
    member.teamIds.includes(teamId),
  );
}

export function getProjectManagementTeamProjects(teamId: string) {
  const team = teamById.get(teamId);

  if (!team) {
    return [];
  }

  return team.projectIds
    .map((projectId) => projectById.get(projectId))
    .filter((project): project is ProjectManagementProjectSummary =>
      Boolean(project),
    );
}

export function getProjectManagementMemberTeams(memberId: string) {
  const member = projectManagementMembers.find(
    (projectManagementMember) => projectManagementMember.id === memberId,
  );

  if (!member) {
    return [];
  }

  return member.teamIds
    .map((teamId) => teamById.get(teamId))
    .filter((team): team is ProjectManagementTeam => Boolean(team));
}

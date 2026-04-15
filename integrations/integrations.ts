import { api } from "encore.dev/api";
import { providers } from "./providers";
import type {
  ListTeamsRequest,
  ListTeamsResponse,
  ListTeamProjectsRequest,
  ListTeamProjectsResponse,
  CreateIssueRequest,
  CreateIssueResponse,
  TeamMember,
} from "./types";

// ─── List teams / top-level containers ───

export const listPMTeams = api(
  { expose: true, method: "POST", path: "/integrations/pm/teams" },
  async (req: ListTeamsRequest): Promise<ListTeamsResponse> => {
    const provider = providers[req.type];
    if (!provider) return { teams: [], teamLabel: "Project", projectLabel: "" };
    return provider.listTeams(req.config);
  },
);

// ─── List projects within a team ───

export const listPMTeamProjects = api(
  { expose: true, method: "POST", path: "/integrations/pm/team-projects" },
  async (req: ListTeamProjectsRequest): Promise<ListTeamProjectsResponse> => {
    const provider = providers[req.type];
    if (!provider?.listTeamProjects) return { projects: [] };
    return provider.listTeamProjects(req.config, req.teamId);
  },
);

// ─── List members within a team ───

export const listPMTeamMembers = api(
  { expose: true, method: "POST", path: "/integrations/pm/team-members" },
  async (req: { type: string; config: Record<string, string>; teamId: string }): Promise<{ members: TeamMember[] }> => {
    const provider = providers[req.type];
    if (!provider?.listTeamMembers) return { members: [] };
    return provider.listTeamMembers(req.config, req.teamId);
  },
);

// ─── Create issue ───

export const createPMIssue = api(
  { expose: true, method: "POST", path: "/integrations/pm/issues" },
  async (req: CreateIssueRequest): Promise<CreateIssueResponse> => {
    const provider = providers[req.type];
    if (!provider) throw new Error(`Unsupported integration type: ${req.type}`);
    return provider.createIssue(req);
  },
);

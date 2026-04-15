// ─── Shared types for PM integrations ───

export interface PMItem {
  id: string;
  name: string;
  key?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface ListTeamsRequest {
  type: string;
  config: Record<string, string>;
}

export interface ListTeamsResponse {
  teams: PMItem[];
  teamLabel: string;
  projectLabel: string;
}

export interface ListTeamProjectsRequest {
  type: string;
  config: Record<string, string>;
  teamId: string;
}

export interface ListTeamProjectsResponse {
  projects: PMItem[];
}

export interface CreateIssueRequest {
  type: string;
  config: Record<string, string>;
  teamId: string;
  projectId: string;
  title: string;
  description: string;
  priority?: number;
  estimateMinutes?: number;
  assigneeId?: string;
}

export interface CreateIssueResponse {
  issueId: string;
  issueKey: string;
  issueUrl: string;
}

// ─── Provider contract ───

export interface PMProvider {
  teamLabel: string;
  projectLabel: string;
  listTeams(config: Record<string, string>): Promise<ListTeamsResponse>;
  listTeamProjects?(config: Record<string, string>, teamId: string): Promise<ListTeamProjectsResponse>;
  listTeamMembers?(config: Record<string, string>, teamId: string): Promise<{ members: TeamMember[] }>;
  createIssue(req: CreateIssueRequest): Promise<CreateIssueResponse>;
}

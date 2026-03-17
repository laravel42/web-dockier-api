const API_BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || "Request failed");
  }

  return res.json();
}

// ─── Auth ───

export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    request<{ token: string; userId: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ token: string; userId: string; requires2FA?: boolean }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(data) }
    ),

  verify2FA: (data: { userId: string; token: string }) =>
    request<{ token: string; userId: string }>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  setup2FA: () =>
    request<{ secret: string; qrCodeUrl: string }>("/auth/2fa/setup", {
      method: "POST",
    }),

  enable2FA: (token: string) =>
    request<{ success: boolean }>("/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  socialLogin: (data: {
    provider: string;
    code: string;
    redirectUri: string;
  }) =>
    request<{ token: string; userId: string }>("/auth/social", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── Users ───

export const usersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    request<{
      users: Array<{
        id: string;
        email: string;
        name: string;
        avatarUrl?: string;
        createdAt: string;
      }>;
      total: number;
    }>(`/users?${new URLSearchParams(params as Record<string, string>)}`),

  get: (userId: string) =>
    request<{
      id: string;
      email: string;
      name: string;
      avatarUrl?: string;
      country: string;
      language: string;
      timezone: string;
      createdAt: string;
    }>(`/users/${userId}`),

  update: (userId: string, data: { name?: string; avatarUrl?: string; country?: string; language?: string; timezone?: string }) =>
    request(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ userId, ...data }),
    }),

  delete: (userId: string) =>
    request(`/users/${userId}`, { method: "DELETE" }),
};

// ─── Groups & Roles ───

export const groupsApi = {
  list: () =>
    request<{
      groups: Array<{
        id: string;
        name: string;
        description: string;
        createdAt: string;
      }>;
    }>("/groups"),

  create: (data: { name: string; description?: string }) =>
    request("/groups", { method: "POST", body: JSON.stringify(data) }),

  get: (groupId: string) => request<any>(`/groups/${groupId}`),

  update: (groupId: string, data: { name?: string; description?: string }) =>
    request(`/groups/${groupId}`, {
      method: "PUT",
      body: JSON.stringify({ groupId, ...data }),
    }),

  delete: (groupId: string) =>
    request(`/groups/${groupId}`, { method: "DELETE" }),

  listMembers: (groupId: string) =>
    request<{
      members: Array<{
        userId: string;
        groupId: string;
        roleId: string;
        roleName: string;
        joinedAt: string;
      }>;
    }>(`/groups/${groupId}/members`),

  addMember: (groupId: string, userId: string, roleId: string) =>
    request(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ groupId, userId, roleId }),
    }),

  removeMember: (groupId: string, userId: string) =>
    request(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
};

export const rolesApi = {
  list: () =>
    request<{
      roles: Array<{
        id: string;
        name: string;
        description: string;
        permissions: string[];
        createdAt: string;
      }>;
    }>("/roles"),

  create: (data: {
    name: string;
    description?: string;
    permissions: string[];
  }) => request("/roles", { method: "POST", body: JSON.stringify(data) }),

  delete: (roleId: string) =>
    request(`/roles/${roleId}`, { method: "DELETE" }),

  update: (roleId: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request(`/roles/${roleId}`, { method: "PUT", body: JSON.stringify({ roleId, ...data }) }),
};

// ─── Git Integration ───

export const gitApi = {
  listConnections: () =>
    request<{
      connections: Array<{
        id: string;
        provider: string;
        label: string;
        repoUrl: string;
        endpoint: string;
        createdAt: string;
      }>;
    }>("/git/connections"),

  addConnection: (data: {
    provider: string;
    personalToken: string;
    label: string;
    repoUrl: string;
    endpoint: string;
  }) =>
    request("/git/connections", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteConnection: (connectionId: string) =>
    request(`/git/connections/${connectionId}`, { method: "DELETE" }),

  updateConnection: (connectionId: string, data: { label: string }) =>
    request(`/git/connections/${connectionId}`, { method: "PUT", body: JSON.stringify({ connectionId, ...data }) }),

  listRepos: (connectionId: string) =>
    request<{
      repos: Array<{
        name: string;
        fullName: string;
        url: string;
        defaultBranch: string;
        private: boolean;
      }>;
    }>(`/git/connections/${connectionId}/repos`),

  listBranches: (connectionId: string, owner: string, repo: string) =>
    request<{ branches: string[] }>(
      `/git/connections/${connectionId}/repo-branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    ),

  getConnectionBranches: (connectionId: string) =>
    request<{ branches: string[] }>(
      `/git/connections/${connectionId}/branches`
    ),

  getRepoStats: (connectionId: string, owner: string, repo: string, branch?: string) =>
    request<{
      stars: number;
      forks: number;
      openIssues: number;
      watchers: number;
      language: string;
      languages: Record<string, number>;
      lastCommitDate: string;
      lastCommitMessage: string;
      lastCommitAuthor: string;
      totalCommits: number;
    }>(`/git/connections/${connectionId}/repo-stats?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),

  analyzeRepo: (connectionId: string, owner: string, repo: string, branch?: string) =>
    request<{
      techStack: Array<{ name: string; category: string; confidence: number }>;
      deployOptions: Array<{
        provider: string;
        type: string;
        description: string;
        pros: string[];
        cons: string[];
        estimatedMonthlyCost: string;
        bestFor: string;
      }>;
      repoSize: number;
      primaryLanguage: string;
      hasDocker: boolean;
      hasCi: boolean;
    }>(`/git/connections/${connectionId}/repo-analyze?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),
};

// ─── Notifications ───

export const notificationsApi = {
  listChannels: () =>
    request<{
      channels: Array<{
        id: string;
        type: string;
        config: Record<string, string>;
        enabled: boolean;
        createdAt: string;
      }>;
    }>("/notifications/channels"),

  addChannel: (data: {
    type: string;
    config: Record<string, string>;
  }) =>
    request("/notifications/channels", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  toggleChannel: (channelId: string, enabled: boolean) =>
    request(`/notifications/channels/${channelId}/toggle`, {
      method: "PUT",
      body: JSON.stringify({ channelId, enabled }),
    }),

  deleteChannel: (channelId: string) =>
    request(`/notifications/channels/${channelId}`, { method: "DELETE" }),

  list: (unreadOnly?: boolean) =>
    request<{
      notifications: Array<{
        id: string;
        title: string;
        message: string;
        read: boolean;
        createdAt: string;
      }>;
    }>(`/notifications${unreadOnly ? "?unreadOnly=true" : ""}`),

  markRead: (notificationId: string) =>
    request(`/notifications/${notificationId}/read`, { method: "PUT" }),

  send: (data: {
    userId: string;
    title: string;
    message: string;
    channels?: string[];
  }) =>
    request("/notifications/send", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── Deploy ───

export const deployApi = {
  listProviders: () =>
    request<{
      providers: Array<{
        id: string;
        provider: string;
        label: string;
        createdAt: string;
      }>;
    }>("/deploy/providers"),

  addProvider: (data: {
    provider: string;
    label: string;
    apiKey: string;
    apiSecret: string;
    region?: string;
  }) =>
    request("/deploy/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteProvider: (providerId: string) =>
    request(`/deploy/providers/${providerId}`, { method: "DELETE" }),

  updateProvider: (providerId: string, data: { label: string }) =>
    request(`/deploy/providers/${providerId}`, { method: "PUT", body: JSON.stringify({ providerId, ...data }) }),

  listDeployments: (providerId?: string) =>
    request<{
      deployments: Array<{
        id: string;
        providerId: string;
        repo: string;
        branch: string;
        status: string;
        createdAt: string;
      }>;
    }>(
      `/deploy/deployments${providerId ? `?providerId=${providerId}` : ""}`
    ),

  createDeployment: (data: {
    providerId: string;
    gitConnectionId: string;
    repo: string;
    branch: string;
  }) =>
    request<{
      id: string;
      providerId: string;
      repo: string;
      branch: string;
      status: string;
      logs: string;
      appUrl: string;
    }>("/deploy/deployments", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getDeployment: (deploymentId: string) =>
    request<{
      id: string;
      providerId: string;
      repo: string;
      branch: string;
      status: string;
      logs: string;
      appUrl: string;
      createdAt: string;
      updatedAt: string;
    }>(`/deploy/deployments/${deploymentId}`),
};

// ─── Projects ───

export const projectsApi = {
  list: () =>
    request<{
      projects: Array<{
        id: string;
        name: string;
        repository: string;
        branch: string;
        connectionId: string;
        createdAt: string;
      }>;
    }>("/projects"),

  get: (projectId: string) =>
    request<{
      id: string;
      name: string;
      repository: string;
      branch: string;
      connectionId: string;
      createdAt: string;
    }>(`/projects/${projectId}`),

  create: (data: { name: string; repository: string; branch: string; connectionId: string }) =>
    request("/projects", { method: "POST", body: JSON.stringify(data) }),

  update: (projectId: string, data: { name?: string; repository?: string; branch?: string; connectionId?: string }) =>
    request(`/projects/${projectId}`, { method: "PUT", body: JSON.stringify({ projectId, ...data }) }),

  delete: (projectId: string) =>
    request(`/projects/${projectId}`, { method: "DELETE" }),
};

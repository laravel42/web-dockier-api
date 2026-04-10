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

  // Allow callers to strip Authorization by setting it to empty
  if (!headers.Authorization) delete headers.Authorization;

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
      headers: { Authorization: "" },
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

  create: (data: { email: string; name: string; country?: string; language?: string; timezone?: string }) =>
    request("/users", { method: "POST", body: JSON.stringify(data) }),

  update: (userId: string, data: { name?: string; avatarUrl?: string; country?: string; language?: string; timezone?: string }) =>
    request(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ userId, ...data }),
    }),

  delete: (userId: string) =>
    request(`/users/${userId}`, { method: "DELETE" }),
};

// ─── Roles ───

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
      lastCommitHash: string;
      totalCommits: number;
      contributors: number;
      topContributors: Array<{ name: string; avatarUrl: string; commits: number; profileUrl: string }>;
    }>(`/git/connections/${connectionId}/repo-stats?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),

  analyzeRepo: (connectionId: string, owner: string, repo: string, branch?: string, aiType?: string, aiApiKey?: string) =>
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
      detectedServices: Array<{
        type: string;
        name: string;
        provider: string;
        confidence: number;
        configFile?: string;
      }>;
      repoSize: number;
      primaryLanguage: string;
      hasDocker: boolean;
      hasCi: boolean;
      aiAnalysis?: {
        runtime: string;
        runtimeVersion: string;
        framework: string;
        frameworkVersion: string;
        phpExtensions?: string[];
        nodeVersion?: string;
        buildCommand: string;
        startCommand: string;
        port: number;
        needsScheduler: boolean;
        needsQueueWorker: boolean;
        needsWebsockets: boolean;
        envVars: string[];
        postDeployCommands: string[];
        nginxConfig: "php-fpm" | "reverse-proxy" | "static";
        summary: string;
        deployOptions?: Array<{
          provider: string;
          type: string;
          description: string;
          pros: string[];
          cons: string[];
          estimatedMonthlyCost: string;
          bestFor: string;
        }>;
      };
    }>(`/git/connections/${connectionId}/repo-analyze?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}${aiType ? `&aiType=${encodeURIComponent(aiType)}` : ""}${aiApiKey ? `&aiApiKey=${encodeURIComponent(aiApiKey)}` : ""}`),

  getRepoTree: (connectionId: string, owner: string, repo: string, branch?: string) =>
    request<{
      files: Array<{ path: string; type: string; size: number }>;
    }>(`/git/connections/${connectionId}/repo-tree?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),

  getRepoBadges: (repo: string, branch?: string) =>
    request<{
      badges: Array<{ name: string; category: string; confidence: number }>;
    }>(`/git/repo-badges?repo=${encodeURIComponent(repo)}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`),

  pullOrigin: (connectionId: string, owner: string, repo: string, branch: string, currentHash?: string) =>
    request<{ log: string[] }>(`/git/connections/${connectionId}/pull`, {
      method: "POST",
      body: JSON.stringify({ connectionId, owner, repo, branch, currentHash }),
    }),

  createFixMR: (connectionId: string, data: {
    owner: string; repo: string; branch: string;
    filePath: string; startLine: number; endLine: number;
    ruleId: string; severity: string; message: string; snippet: string;
    aiType?: string; aiConfig?: Record<string, string>;
    assignee?: string; reviewer?: string;
  }) =>
    request<{ mrUrl: string; mrId: string; mrTitle: string }>(`/git/connections/${connectionId}/create-mr`, {
      method: "POST",
      body: JSON.stringify({ connectionId, ...data }),
    }),

  listRepoMembers: (connectionId: string, owner: string, repo: string) =>
    request<{ members: Array<{ id: string; username: string; name: string; avatarUrl: string }> }>(
      `/git/connections/${connectionId}/repo-members?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    ),

  getFileContent: (connectionId: string, owner: string, repo: string, branch: string, path: string) =>
    request<{ content: string }>(
      `/git/connections/${connectionId}/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`
    ),

  listBedrockModels: () =>
    request<{ models: Array<{ id: string; name: string }> }>("/git/bedrock/models"),

  summarizeFinding: (severity: string, message: string, filePath: string, snippet?: string, model?: string) =>
    request<{ title: string; estimateMinutes: number }>("/git/ai/summarize-finding", {
      method: "POST",
      body: JSON.stringify({ severity, message, filePath, snippet, model }),
    }),
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

  updateProvider: (providerId: string, data: { label?: string; apiSecret?: string }) =>
    request(`/deploy/providers/${providerId}`, { method: "PUT", body: JSON.stringify(data) }),

  listDeployments: (providerId?: string) =>
    request<{
      deployments: Array<{
        id: string;
        providerId: string;
        repo: string;
        branch: string;
        status: string;
        logs: string;
        appUrl: string;
        commitHash: string;
        dockerImage: string;
        deployStrategy: string;
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
    tofuScript?: string;
    techStack?: string[];
    primaryLanguage?: string;
    registryUrl?: string;
    deployStrategy?: string;
    buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
    skipPipeline?: boolean;
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

  updateDeployment: (deploymentId: string, data: {
    status?: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
    logs?: string;
    appUrl?: string;
  }) =>
    request<{ ok: boolean }>(`/deploy/deployments/${deploymentId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  destroyDeployment: (deploymentId: string) =>
    request<{ success: boolean; message: string }>(`/deploy/deployments/${deploymentId}/destroy`, {
      method: "POST",
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
      commitHash: string;
      dockerImage: string;
      deployStrategy: string;
      createdAt: string;
      updatedAt: string;
    }>(`/deploy/deployments/${deploymentId}`),

  generateTofu: (data: {
    providerId: string;
    repo: string;
    branch: string;
    techStack: string[];
    primaryLanguage: string;
    hasDocker: boolean;
    appName?: string;
    region?: string;
    deployStrategy?: "vps" | "managed" | "static";
    useDocker?: boolean;
    dockerImage?: string;
    instanceType?: string;
    services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
    aiAnalysis?: Record<string, any>;
  }) =>
    request<{
      script: string;
      provider: string;
      region: string;
      appName: string;
      estimatedResources: string[];
    }>("/deploy/tofu/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // SSH Keys
  listSshKeys: () =>
    request<{ keys: Array<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }> }>("/deploy/ssh-keys"),

  addSshKey: (data: { label: string; publicKey: string }) =>
    request<{ id: string; label: string; publicKey: string; fingerprint: string; createdAt: string }>("/deploy/ssh-keys", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteSshKey: (keyId: string) =>
    request<{ success: boolean }>(`/deploy/ssh-keys/${keyId}`, { method: "DELETE" }),
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

  create: (data: { name: string; repository: string; branch: string; connectionId: string; platform?: string }) =>
    request("/projects", { method: "POST", body: JSON.stringify(data) }),

  update: (projectId: string, data: { name?: string; repository?: string; branch?: string; connectionId?: string; platform?: string }) =>
    request(`/projects/${projectId}`, { method: "PUT", body: JSON.stringify({ projectId, ...data }) }),

  delete: (projectId: string) =>
    request(`/projects/${projectId}`, { method: "DELETE" }),
};

// ─── Code Analysis ───

type ScanSummaryApi = {
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  filesScanned: number;
  filesInRepo: number;
  progress?: { phase: "cloning" | "scanning" | "persisting" | "done"; currentFile?: string; filesScanned: number; filesInRepo: number; findingsCount: number };
  error?: string;
};

export const codeAnalysisApi = {
  createScan: (data: { projectId: string; connectionId: string; repo: string; branch: string }) =>
    request<{
      id: string;
      projectId: string;
      repo: string;
      branch: string;
      status: string;
      summary: ScanSummaryApi;
      commitSha: string;
      commitMessage: string;
      commitAuthor: string;
      commitDate: string;
      createdAt: string;
    }>("/code-analysis/scans", { method: "POST", body: JSON.stringify(data) }),

  listScans: (projectId?: string, branch?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (branch) params.set("branch", branch);
    const qs = params.toString();
    return request<{
      scans: Array<{
        id: string;
        projectId: string;
        repo: string;
        branch: string;
        status: string;
        summary: ScanSummaryApi;
        commitSha: string;
        commitMessage: string;
        commitAuthor: string;
        commitDate: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/code-analysis/scans${qs ? `?${qs}` : ""}`);
  },

  getScan: (scanId: string) =>
    request<{
      id: string;
      projectId: string;
      repo: string;
      branch: string;
      status: string;
      summary: ScanSummaryApi;
      commitSha: string;
      commitMessage: string;
      commitAuthor: string;
      commitDate: string;
      createdAt: string;
      updatedAt: string;
    }>(`/code-analysis/scans/${scanId}`),

  runScan: (scanId: string, tools?: { enableOpengrep?: boolean; enableSonarqube?: boolean; enableCustomRules?: boolean }) =>
    request<{
      id: string;
      status: string;
      summary: ScanSummaryApi;
    }>(`/code-analysis/scans/${scanId}/run`, { method: "POST", body: JSON.stringify({ scanId, ...tools }) }),

  listFindings: (scanId: string, severity?: string) =>
    request<{
      findings: Array<{
        id: string;
        ruleId: string;
        severity: string;
        message: string;
        filePath: string;
        startLine: number;
        endLine: number;
        snippet: string;
        createdAt: string;
      }>;
    }>(`/code-analysis/scans/${scanId}/findings${severity ? `?severity=${severity}` : ""}`),

  deleteScan: (scanId: string) =>
    request(`/code-analysis/scans/${scanId}`, { method: "DELETE" }),

  listCustomRules: () =>
    request<{ rules: Array<{
      id: string; ruleId: string; severity: string; message: string;
      pattern: string; extensions: string[]; enabled: boolean; isSystem: boolean; createdAt: string;
    }> }>("/code-analysis/custom-rules"),

  createCustomRule: (data: { ruleId: string; severity: string; message: string; pattern: string; extensions: string[] }) =>
    request<{ id: string; ruleId: string }>("/code-analysis/custom-rules", { method: "POST", body: JSON.stringify(data) }),

  updateCustomRule: (ruleDbId: string, data: { ruleId?: string; severity?: string; message?: string; pattern?: string; extensions?: string[]; enabled?: boolean }) =>
    request(`/code-analysis/custom-rules/${ruleDbId}`, { method: "PUT", body: JSON.stringify({ ruleDbId, ...data }) }),

  deleteCustomRule: (ruleDbId: string) =>
    request(`/code-analysis/custom-rules/${ruleDbId}`, { method: "DELETE" }),

  listOpengrepRules: () =>
    request<{ rules: Array<{ id: string; name: string; lang: string; path: string; severity: string; category: string; message: string }>; languages: string[] }>("/code-analysis/opengrep-rules"),

  getOpengrepRuleContent: (path: string) =>
    request<{ content: string }>(`/code-analysis/opengrep-rules/content?path=${encodeURIComponent(path)}`),

  updateOpengrepRuleContent: (path: string, content: string) =>
    request("/code-analysis/opengrep-rules/content", { method: "PUT", body: JSON.stringify({ path, content }) }),

  listSonarProfiles: () =>
    request<{ profiles: Array<{ key: string; name: string; language: string; languageName: string; isDefault: boolean; activeRuleCount: number }> }>("/code-analysis/sonar/profiles"),

  listSonarRules: (profileKey: string, page?: number, query?: string) =>
    request<{ rules: Array<{ key: string; name: string; severity: string; lang: string; langName: string; type: string; status: string; isActive: boolean; cleanCodeAttribute: string; impacts: Array<{ softwareQuality: string; severity: string }> }>; total: number }>(
      `/code-analysis/sonar/rules?profileKey=${encodeURIComponent(profileKey)}${page ? `&page=${page}` : ""}${query ? `&query=${encodeURIComponent(query)}` : ""}`
    ),

  toggleSonarRule: (profileKey: string, ruleKey: string, activate: boolean) =>
    request("/code-analysis/sonar/rules/toggle", { method: "POST", body: JSON.stringify({ profileKey, ruleKey, activate }) }),

  listRuleOverrides: (tool: "opengrep" | "sonarqube") =>
    request<{ overrides: Array<{ id: string; ruleId: string; enabled: boolean }> }>(`/code-analysis/rule-overrides?tool=${tool}`),

  toggleRule: (tool: "opengrep" | "sonarqube", ruleId: string, enabled: boolean) =>
    request("/code-analysis/rule-overrides", { method: "POST", body: JSON.stringify({ tool, ruleId, enabled }) }),
};

// ─── Image Builder ───

export const imageBuilderApi = {
  startBuild: (data: {
    sourceRepo: string;
    sourceRef?: string;
    commitSha?: string;
    imageRepo?: string;
    dockerfilePath?: string;
    buildContext?: string;
    tags?: string[];
    projectId?: string;
    gitConnectionId?: string;
    deployTarget?: "ecs" | "ec2" | "s3";
    deployParams?: {
      appName?: string;
      containerPort?: number;
      cpu?: string;
      memory?: string;
      desiredCount?: number;
      maxCount?: number;
      minInstances?: number;
      maxInstances?: number;
      instanceType?: string;
      vpcId?: string;
      subnetIds?: string[];
      envVars?: Array<{ name: string; value: string }>;
    };
  }) =>
    request<{
      id: string;
      codebuildId: string;
      userId: string;
      projectId: string;
      sourceRepo: string;
      sourceRef: string;
      commitSha: string;
      dockerfilePath: string;
      buildContext: string;
      imageRepo: string;
      imageUri: string;
      cacheRepoUri: string;
      status: string;
      statusReason: string;
      logsUrl: string;
      tags: string[];
      buildMetadata: Record<string, string>;
      startedAt: string;
      finishedAt: string;
      createdAt: string;
      updatedAt: string;
    }>("/image-builder/builds", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getBuild: (buildId: string) =>
    request<{
      id: string;
      codebuildId: string;
      sourceRepo: string;
      sourceRef: string;
      commitSha: string;
      imageUri: string;
      status: string;
      statusReason: string;
      logsUrl: string;
      tags: string[];
      buildMetadata: Record<string, string>;
      startedAt: string;
      finishedAt: string;
      createdAt: string;
    }>(`/image-builder/builds/${buildId}`),

  listBuilds: (params?: { sourceRepo?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.sourceRepo) qs.set("sourceRepo", params.sourceRepo);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return request<{
      builds: Array<{
        id: string;
        codebuildId: string;
        sourceRepo: string;
        sourceRef: string;
        commitSha: string;
        imageUri: string;
        status: string;
        statusReason: string;
        logsUrl: string;
        tags: string[];
        startedAt: string;
        finishedAt: string;
        createdAt: string;
      }>;
    }>(`/image-builder/builds${q ? `?${q}` : ""}`);
  },

  getImageForRevision: (revision: string) =>
    request<{
      imageUri: string;
      buildId: string;
      commitSha: string;
      status: string;
      createdAt: string;
    }>(`/image-builder/images/${encodeURIComponent(revision)}`),

  cancelBuild: (buildId: string) =>
    request<{
      id: string;
      status: string;
      statusReason: string;
    }>(`/image-builder/builds/${buildId}/cancel`, { method: "POST" }),

  getBuildLogs: (buildId: string, nextToken?: string) => {
    const q = nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : "";
    return request<{
      buildId: string;
      logs: string[];
      nextToken?: string;
    }>(`/image-builder/builds/${buildId}/logs${q}`);
  },

  getDeployStatus: (buildId: string) =>
    request<{
      status: string;
      appUrl: string;
      stackName: string;
    }>(`/image-builder/builds/${buildId}/deploy-status`),
};

// ─── Integrations ───

export const integrationsApi = {
  listPMTeams: (type: string, config: Record<string, string>) =>
    request<{
      teams: Array<{ id: string; name: string; key?: string }>;
      teamLabel: string;
      projectLabel: string;
    }>("/integrations/pm/teams", {
      method: "POST",
      body: JSON.stringify({ type, config }),
    }),

  listPMTeamProjects: (type: string, config: Record<string, string>, teamId: string) =>
    request<{
      projects: Array<{ id: string; name: string; key?: string }>;
    }>("/integrations/pm/team-projects", {
      method: "POST",
      body: JSON.stringify({ type, config, teamId }),
    }),

  listPMTeamMembers: (type: string, config: Record<string, string>, teamId: string) =>
    request<{
      members: Array<{ id: string; name: string; email?: string; avatarUrl?: string }>;
    }>("/integrations/pm/team-members", {
      method: "POST",
      body: JSON.stringify({ type, config, teamId }),
    }),

  createPMIssue: (data: { type: string; config: Record<string, string>; teamId: string; projectId: string; title: string; description: string; priority?: number; estimateMinutes?: number; assigneeId?: string }) =>
    request<{
      issueId: string;
      issueKey: string;
      issueUrl: string;
    }>("/integrations/pm/issues", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

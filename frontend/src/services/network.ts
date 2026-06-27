import { request } from "./request";

// ─── Types ───

export interface SecurityRuleCredential {
  id: string;
  username: string;
  createdAt: string;
}

export interface SecurityRule {
  id: string;
  projectId: string;
  name: string;
  path: string | null;
  credentials: SecurityRuleCredential[];
  createdAt: string;
  updatedAt: string;
}

export interface RedirectRule {
  id: string;
  projectId: string;
  fromPath: string;
  toPath: string;
  type: "temporary" | "permanent";
  createdAt: string;
  updatedAt: string;
}

// ─── API ───

export const networkApi = {
  // Security Rules
  listSecurityRules: (projectId: string) =>
    request<{ rules: SecurityRule[] }>(
      `/projects/${encodeURIComponent(projectId)}/network/security-rules`,
    ),

  createSecurityRule: (
    projectId: string,
    data: { name: string; path?: string; credentials?: Array<{ username: string; password: string }> },
  ) =>
    request<SecurityRule>(
      `/projects/${encodeURIComponent(projectId)}/network/security-rules`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  deleteSecurityRule: (projectId: string, ruleId: string) =>
    request(
      `/projects/${encodeURIComponent(projectId)}/network/security-rules/${encodeURIComponent(ruleId)}`,
      { method: "DELETE" },
    ),

  addCredential: (projectId: string, ruleId: string, data: { username: string; password: string }) =>
    request<SecurityRuleCredential>(
      `/projects/${encodeURIComponent(projectId)}/network/security-rules/${encodeURIComponent(ruleId)}/credentials`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  deleteCredential: (projectId: string, ruleId: string, credentialId: string) =>
    request(
      `/projects/${encodeURIComponent(projectId)}/network/security-rules/${encodeURIComponent(ruleId)}/credentials/${encodeURIComponent(credentialId)}`,
      { method: "DELETE" },
    ),

  // Redirect Rules
  listRedirectRules: (projectId: string) =>
    request<{ rules: RedirectRule[] }>(
      `/projects/${encodeURIComponent(projectId)}/network/redirect-rules`,
    ),

  createRedirectRule: (
    projectId: string,
    data: { fromPath: string; toPath: string; type: "temporary" | "permanent" },
  ) =>
    request<RedirectRule>(
      `/projects/${encodeURIComponent(projectId)}/network/redirect-rules`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  deleteRedirectRule: (projectId: string, ruleId: string) =>
    request(
      `/projects/${encodeURIComponent(projectId)}/network/redirect-rules/${encodeURIComponent(ruleId)}`,
      { method: "DELETE" },
    ),

  // Apply rules to server
  apply: (projectId: string) =>
    request<{ success: boolean; message: string; generatedConfig?: string }>(
      `/projects/${encodeURIComponent(projectId)}/network/apply`,
      { method: "POST" },
    ),
};

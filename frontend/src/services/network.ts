import { request } from "./request";
import type { SecurityRule, SecurityRuleCredential, RedirectRule } from "../types";

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
  // The apply waits for the server (SSM polls up to ~60 s, plus target lookup), so the
  // 30 s default reported a timeout while the rules were still being applied.
  apply: (projectId: string) =>
    request<{ success: boolean; message: string; generatedConfig?: string }>(
      `/projects/${encodeURIComponent(projectId)}/network/apply`,
      { method: "POST", timeout: 120_000 },
    ),
};

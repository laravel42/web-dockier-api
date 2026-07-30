import { request } from "./request";
import { buildQuery } from "./query";
import type { ScanSummary, Scan, Finding, SecurityFindingCounts } from "../types";

export const codeAnalysisApi = {
  createScan: (data: { projectId: string; connectionId: string; repo: string; branch: string }) =>
    request<Scan>("/code-analysis/scans", { method: "POST", body: JSON.stringify(data) }),

  listScans: (projectId?: string, branch?: string) =>
    request<{ scans: Scan[] }>(`/code-analysis/scans${buildQuery({ projectId, branch })}`),

  getScan: (scanId: string) =>
    request<Scan>(`/code-analysis/scans/${scanId}`),

  runScan: (scanId: string, tools?: { enableOpengrep?: boolean; enableSonarqube?: boolean; enableCustomRules?: boolean; enableSensitiveData?: boolean }) =>
    request<{
      id: string;
      status: string;
      summary: ScanSummary;
    }>(`/code-analysis/scans/${scanId}/run`, { method: "POST", body: JSON.stringify({ scanId, ...tools }) }),

  listFindings: (
    scanId: string,
    options?: { severity?: string; provider?: "semgrep" | "sonar" | "custom"; limit?: number; offset?: number },
  ) =>
    request<{
      findings: Array<Finding & { createdAt: string }>;
      total: number;
      hasMore: boolean;
      counts: SecurityFindingCounts;
    }>(`/code-analysis/scans/${scanId}/findings${buildQuery({
      severity: options?.severity,
      provider: options?.provider,
      limit: options?.limit,
      offset: options?.offset,
    })}`),

  deleteScan: (scanId: string) =>
    request(`/code-analysis/scans/${scanId}`, { method: "DELETE" }),

  listCustomRules: (type?: string) =>
    request<{ rules: Array<{
      id: string; ruleId: string; severity: string; message: string;
      pattern: string; extensions: string[]; enabled: boolean; isSystem: boolean;
      type: string; yamlContent: string; createdAt: string;
    }> }>(`/code-analysis/custom-rules${buildQuery({ type })}`),

  createCustomRule: (data: { ruleId: string; severity: string; message: string; pattern: string; extensions: string[]; type?: string; yamlContent?: string }) =>
    request<{ id: string; ruleId: string }>("/code-analysis/custom-rules", { method: "POST", body: JSON.stringify(data) }),

  updateCustomRule: (ruleDbId: string, data: { ruleId?: string; severity?: string; message?: string; pattern?: string; extensions?: string[]; enabled?: boolean; yamlContent?: string }) =>
    request(`/code-analysis/custom-rules/${ruleDbId}`, { method: "PUT", body: JSON.stringify({ ruleDbId, ...data }) }),

  deleteCustomRule: (ruleDbId: string) =>
    request(`/code-analysis/custom-rules/${ruleDbId}`, { method: "DELETE" }),

  listOpengrepRules: () =>
    request<{ rules: Array<{ id: string; name: string; lang: string; path: string; severity: string; category: string; message: string }>; languages: string[] }>("/code-analysis/semgrep-rules"),

  getOpengrepRuleContent: (path: string) =>
    request<{ content: string }>(`/code-analysis/semgrep-rules/content${buildQuery({ path })}`),

  updateOpengrepRuleContent: (path: string, content: string) =>
    request("/code-analysis/semgrep-rules/content", { method: "PUT", body: JSON.stringify({ path, content }) }),

  listSonarProfiles: () =>
    request<{ profiles: Array<{ key: string; name: string; language: string; languageName: string; isDefault: boolean; activeRuleCount: number }> }>("/code-analysis/sonar/profiles"),

  listSonarRules: (profileKey: string, page?: number, query?: string) =>
    request<{ rules: Array<{ key: string; name: string; severity: string; lang: string; langName: string; type: string; status: string; isActive: boolean; cleanCodeAttribute: string; impacts: Array<{ softwareQuality: string; severity: string }> }>; total: number }>(
      `/code-analysis/sonar/rules${buildQuery({ profileKey, page, query })}`
    ),

  toggleSonarRule: (profileKey: string, ruleKey: string, activate: boolean) =>
    request("/code-analysis/sonar/rules/toggle", { method: "POST", body: JSON.stringify({ profileKey, ruleKey, activate }) }),

  listRuleOverrides: (tool: "semgrep" | "sonarqube") =>
    request<{ overrides: Array<{ id: string; ruleId: string; enabled: boolean }> }>(`/code-analysis/rule-overrides${buildQuery({ tool })}`),

  toggleRule: (tool: "semgrep" | "sonarqube", ruleId: string, enabled: boolean) =>
    request("/code-analysis/rule-overrides", { method: "POST", body: JSON.stringify({ tool, ruleId, enabled }) }),
};

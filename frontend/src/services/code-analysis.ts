import { request } from "./request";
import type { ScanSummary, Scan, Finding } from "../types";

type ScanSummaryApi = ScanSummary & {
  progress?: { phase: "cloning" | "scanning" | "persisting" | "done"; currentFile?: string; filesScanned: number; filesInRepo: number; findingsCount: number };
  error?: string;
};

export const codeAnalysisApi = {
  createScan: (data: { projectId: string; connectionId: string; repo: string; branch: string }) =>
    request<Scan & { summary: ScanSummaryApi }>("/code-analysis/scans", { method: "POST", body: JSON.stringify(data) }),

  listScans: (projectId?: string, branch?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (branch) params.set("branch", branch);
    const qs = params.toString();
    return request<{ scans: Array<Scan & { summary: ScanSummaryApi }> }>(`/code-analysis/scans${qs ? `?${qs}` : ""}`);
  },

  getScan: (scanId: string) =>
    request<Scan & { summary: ScanSummaryApi }>(`/code-analysis/scans/${scanId}`),

  runScan: (scanId: string, tools?: { enableOpengrep?: boolean; enableCustomRules?: boolean }) =>
    request<{
      id: string;
      status: string;
      summary: ScanSummaryApi;
    }>(`/code-analysis/scans/${scanId}/run`, { method: "POST", body: JSON.stringify({ scanId, ...tools }) }),

  listFindings: (scanId: string, severity?: string) =>
    request<{
      findings: Array<Finding & { createdAt: string }>;
    }>(`/code-analysis/scans/${scanId}/findings${severity ? `?severity=${severity}` : ""}`),

  deleteScan: (scanId: string) =>
    request(`/code-analysis/scans/${scanId}`, { method: "DELETE" }),

  listCustomRules: (type?: string) => {
    const qs = type ? `?type=${type}` : "";
    return request<{ rules: Array<{
      id: string; ruleId: string; severity: string; message: string;
      pattern: string; extensions: string[]; enabled: boolean; isSystem: boolean;
      type: string; yamlContent: string; createdAt: string;
    }> }>(`/code-analysis/custom-rules${qs}`);
  },

  createCustomRule: (data: { ruleId: string; severity: string; message: string; pattern: string; extensions: string[]; type?: string; yamlContent?: string }) =>
    request<{ id: string; ruleId: string }>("/code-analysis/custom-rules", { method: "POST", body: JSON.stringify(data) }),

  updateCustomRule: (ruleDbId: string, data: { ruleId?: string; severity?: string; message?: string; pattern?: string; extensions?: string[]; enabled?: boolean; yamlContent?: string }) =>
    request(`/code-analysis/custom-rules/${ruleDbId}`, { method: "PUT", body: JSON.stringify({ ruleDbId, ...data }) }),

  deleteCustomRule: (ruleDbId: string) =>
    request(`/code-analysis/custom-rules/${ruleDbId}`, { method: "DELETE" }),

  listOpengrepRules: () =>
    request<{ rules: Array<{ id: string; name: string; lang: string; path: string; severity: string; category: string; message: string }>; languages: string[] }>("/code-analysis/semgrep-rules"),

  getOpengrepRuleContent: (path: string) =>
    request<{ content: string }>(`/code-analysis/semgrep-rules/content?path=${encodeURIComponent(path)}`),

  updateOpengrepRuleContent: (path: string, content: string) =>
    request("/code-analysis/semgrep-rules/content", { method: "PUT", body: JSON.stringify({ path, content }) }),

  listRuleOverrides: (tool: string) =>
    request<{ overrides: Array<{ id: string; ruleId: string; enabled: boolean }> }>(`/code-analysis/rule-overrides?tool=${tool}`),

  toggleRule: (tool: string, ruleId: string, enabled: boolean) =>
    request("/code-analysis/rule-overrides", { method: "POST", body: JSON.stringify({ tool, ruleId, enabled }) }),
};

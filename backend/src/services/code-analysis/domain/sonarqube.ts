import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ScanFindingInput } from "./scan-analysis.js";
import { sonarExclusionGlobs } from "./scan-skip-dirs.js";
import { logger } from "../../../shared/logger.js";
import { DomainError } from "../../../shared/supabase/errors.js";

export interface SonarConfig {
  baseUrl: string;
  token: string;
}

export interface SonarProfile {
  key: string;
  name: string;
  language: string;
  languageName: string;
  isDefault: boolean;
  activeRuleCount: number;
}

export interface SonarRule {
  key: string;
  name: string;
  severity: string;
  lang: string;
  langName: string;
  type: string;
  status: string;
  isActive: boolean;
  cleanCodeAttribute: string;
  impacts: Array<{ softwareQuality: string; severity: string }>;
}

interface SonarApiIssue {
  rule?: string;
  severity?: string;
  message?: string;
  component?: string;
  line?: number;
  textRange?: { startLine?: number; endLine?: number };
}

export function getSonarConfig(): SonarConfig | null {
  const baseUrl = process.env.SONARQUBE_URL?.trim();
  const token = process.env.SONARQUBE_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

export function isSonarConfigured(): boolean {
  return getSonarConfig() !== null;
}

export class SonarNotConfiguredError extends DomainError {
  constructor() {
    super("SonarQube URL or token not configured", "service_unavailable");
    this.name = "SonarNotConfiguredError";
  }
}

export function mapSonarSeverity(raw: string): "error" | "warning" | "info" {
  switch (raw) {
    case "BLOCKER":
    case "CRITICAL":
      return "error";
    case "MAJOR":
      return "warning";
    case "MINOR":
    case "INFO":
    default:
      return "info";
  }
}

export function parseSonarIssues(
  issues: SonarApiIssue[],
  projectKey: string,
): ScanFindingInput[] {
  const findings: ScanFindingInput[] = [];

  for (const issue of issues) {
    const component = issue.component ?? "";
    const prefix = `${projectKey}:`;
    const filePath = component.startsWith(prefix)
      ? component.slice(prefix.length)
      : component.includes(":")
        ? component.split(":").slice(1).join(":")
        : component;

    const startLine = issue.line ?? issue.textRange?.startLine ?? 1;
    const endLine = issue.textRange?.endLine ?? issue.line ?? startLine;
    const message = issue.message ?? "SonarQube issue";

    findings.push({
      ruleId: `sonar.${issue.rule ?? "unknown"}`,
      severity: mapSonarSeverity(issue.severity ?? "INFO"),
      message,
      filePath,
      startLine,
      endLine,
      snippet: message.slice(0, 200),
    });
  }

  return findings;
}

export function findSonarScanner(): string | null {
  const candidates = [
    "sonar-scanner",
    join(homedir(), ".sonar", "native-sonar-scanner", "sonar-scanner"),
    "/usr/local/bin/sonar-scanner",
    "/opt/homebrew/bin/sonar-scanner",
    "/opt/sonar-scanner/bin/sonar-scanner",
  ];

  for (const bin of candidates) {
    try {
      const result = spawnSync(bin, ["--version"], { stdio: "pipe", timeout: 5000 });
      if (result.status === 0) return bin;
    } catch {
      continue;
    }
  }

  return null;
}

type FetchFn = typeof fetch;

export async function sonarFetch(
  path: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
  fetchFn: FetchFn = fetch,
): Promise<Record<string, unknown>> {
  const config = getSonarConfig();
  if (!config) throw new SonarNotConfiguredError();

  const headers: Record<string, string> = { Authorization: `Bearer ${config.token}` };

  let res: Response;
  if (method === "POST") {
    const url = new URL(path, config.baseUrl);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    res = await fetchFn(url.toString(), {
      method: "POST",
      headers,
      body: new URLSearchParams(params).toString(),
    });
  } else {
    const url = new URL(path, config.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    res = await fetchFn(url.toString(), { headers });
  }

  if (!res.ok) {
    throw new Error(`SonarQube API ${path} returned ${res.status}: ${await res.text()}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export async function listSonarProfiles(): Promise<SonarProfile[]> {
  const data = await sonarFetch("/api/qualityprofiles/search");
  const profiles = (data.profiles as Array<Record<string, unknown>> | undefined) ?? [];
  return profiles.map((profile) => ({
    key: String(profile.key ?? ""),
    name: String(profile.name ?? ""),
    language: String(profile.language ?? ""),
    languageName: String(profile.languageName ?? ""),
    isDefault: Boolean(profile.isDefault),
    activeRuleCount: Number(profile.activeRuleCount ?? 0),
  }));
}

function mapSonarRule(rule: Record<string, unknown>, isActive: boolean): SonarRule {
  const impacts = (rule.impacts as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    key: String(rule.key ?? ""),
    name: String(rule.name ?? ""),
    severity: String(rule.severity ?? ""),
    lang: String(rule.lang ?? ""),
    langName: String(rule.langName ?? ""),
    type: String(rule.type ?? ""),
    status: String(rule.status ?? ""),
    isActive,
    cleanCodeAttribute: String(rule.cleanCodeAttribute ?? ""),
    impacts: impacts.map((impact) => ({
      softwareQuality: String(impact.softwareQuality ?? ""),
      severity: String(impact.severity ?? ""),
    })),
  };
}

export async function listSonarRules(params: {
  profileKey: string;
  page?: number;
  query?: string;
}): Promise<{ rules: SonarRule[]; total: number }> {
  const activeData = await sonarFetch("/api/rules/search", {
    activation: "true",
    qprofile: params.profileKey,
    ps: "500",
    p: String(params.page || 1),
    f: "name,severity,lang,langName,status,cleanCodeAttribute",
    ...(params.query ? { q: params.query } : {}),
  });

  const activeRulesRaw = (activeData.rules as Array<Record<string, unknown>> | undefined) ?? [];
  const activeKeys = new Set(activeRulesRaw.map((rule) => String(rule.key ?? "")));
  const activeRules = activeRulesRaw.map((rule) => mapSonarRule(rule, true));

  if (params.query) {
    const inactiveData = await sonarFetch("/api/rules/search", {
      activation: "false",
      qprofile: params.profileKey,
      ps: "500",
      p: String(params.page || 1),
      f: "name,severity,lang,langName,status,cleanCodeAttribute",
      q: params.query,
    });
    const inactiveRulesRaw = (inactiveData.rules as Array<Record<string, unknown>> | undefined) ?? [];
    for (const rule of inactiveRulesRaw) {
      const key = String(rule.key ?? "");
      if (!activeKeys.has(key)) {
        activeRules.push(mapSonarRule(rule, false));
      }
    }
  }

  return {
    rules: activeRules,
    total: Number(activeData.total ?? activeRules.length),
  };
}

export async function toggleSonarRule(params: {
  profileKey: string;
  ruleKey: string;
  activate: boolean;
}): Promise<void> {
  const endpoint = params.activate
    ? "/api/qualityprofiles/activate_rule"
    : "/api/qualityprofiles/deactivate_rule";
  await sonarFetch(
    endpoint,
    {
      key: params.profileKey,
      rule: params.ruleKey,
    },
    "POST",
  );
}

export async function waitForSonarAnalysis(
  taskId: string,
  timeoutMs = 120_000,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await sonarFetch("/api/ce/task", { id: taskId }, "GET", fetchFn);
    const task = data.task as Record<string, unknown> | undefined;
    const status = String(task?.status ?? "");
    if (status === "SUCCESS") return;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`SonarQube analysis ${status}: ${String(task?.errorMessage ?? "unknown error")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("SonarQube analysis timed out");
}

export interface RunSonarScannerDeps {
  findScanner?: () => string | null;
  execScanner?: (scannerBin: string, repoDir: string) => void;
  readReportTask?: (repoDir: string) => string | null;
  waitForAnalysis?: (taskId: string) => Promise<void>;
  fetchIssues?: (projectKey: string) => Promise<SonarApiIssue[]>;
  log?: (message: string) => void;
}

export async function runSonarScanner(
  repoDir: string,
  projectKey: string,
  deps: RunSonarScannerDeps = {},
): Promise<ScanFindingInput[]> {
  const log = deps.log ?? ((message: string) => logger.info(`[sonar] ${message}`));

  const config = getSonarConfig();
  if (!config) {
    log("SonarQube not configured (SONARQUBE_URL/SONARQUBE_TOKEN missing), skipping");
    return [];
  }

  const findScanner = deps.findScanner ?? findSonarScanner;
  const scannerBin = findScanner();
  if (!scannerBin) {
    log("sonar-scanner binary not found, skipping");
    return [];
  }

  log(`Running sonar-scanner for project ${projectKey}...`);

  const props = [
    `sonar.projectKey=${projectKey}`,
    `sonar.sources=.`,
    `sonar.exclusions=${sonarExclusionGlobs()}`,
    `sonar.host.url=${config.baseUrl}`,
    `sonar.token=${config.token}`,
    `sonar.sourceEncoding=UTF-8`,
    `sonar.scm.disabled=true`,
  ].join("\n");
  writeFileSync(join(repoDir, "sonar-project.properties"), props);

  const execScanner =
    deps.execScanner ??
    ((bin: string, dir: string) => {
      execSync(`${JSON.stringify(bin)} -Dsonar.projectBaseDir=${JSON.stringify(dir)}`, {
        cwd: dir,
        timeout: 300_000,
        stdio: "pipe",
        env: { ...process.env },
      });
    });

  try {
    execScanner(scannerBin, repoDir);
  } catch (err) {
    const execErr = err as { stderr?: Buffer; message?: string };
    const stderr = execErr.stderr?.toString() ?? "";
    log(`Scanner failed: ${stderr || execErr.message || String(err)}`);
  }

  const readReportTask =
    deps.readReportTask ??
    ((dir: string) => {
      const reportTaskPath = join(dir, ".scannerwork", "report-task.txt");
      if (!existsSync(reportTaskPath)) return null;
      return readFileSync(reportTaskPath, "utf-8");
    });

  const reportContent = readReportTask(repoDir);
  if (!reportContent) {
    log("No report-task.txt found, scanner may have failed");
    return [];
  }

  const ceTaskIdMatch = reportContent.match(/ceTaskId=(.+)/);
  if (!ceTaskIdMatch) {
    log("Could not find ceTaskId in report-task.txt");
    return [];
  }

  const waitForAnalysis = deps.waitForAnalysis ?? ((taskId: string) => waitForSonarAnalysis(taskId));
  log(`Waiting for analysis task ${ceTaskIdMatch[1]}...`);
  await waitForAnalysis(ceTaskIdMatch[1].trim());

  const fetchIssues =
    deps.fetchIssues ??
    (async (key: string) => {
      const issues: SonarApiIssue[] = [];
      let page = 1;
      const pageSize = 500;

      while (true) {
        const data = await sonarFetch("/api/issues/search", {
          componentKeys: key,
          resolved: "false",
          ps: String(pageSize),
          p: String(page),
        });
        const pageIssues = (data.issues as SonarApiIssue[] | undefined) ?? [];
        issues.push(...pageIssues);

        const paging = data.paging as Record<string, unknown> | undefined;
        const total = Number(paging?.total ?? 0);
        if (page * pageSize >= total) break;
        page++;
      }

      return issues;
    });

  log("Fetching issues...");
  const issues = await fetchIssues(projectKey);
  const findings = parseSonarIssues(issues, projectKey);
  log(`Found ${findings.length} issue(s)`);
  return findings;
}

export function filterDisabledSonarFindings(
  findings: ScanFindingInput[],
  disabledRuleIds: Set<string>,
): ScanFindingInput[] {
  return findings.filter((finding) => {
    const ruleKey = finding.ruleId.startsWith("sonar.")
      ? finding.ruleId.slice("sonar.".length)
      : finding.ruleId;
    return !disabledRuleIds.has(ruleKey);
  });
}

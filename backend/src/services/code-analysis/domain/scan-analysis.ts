import { extname, relative, resolve } from "node:path";
import {
  scanSensitiveData,
  type SensitiveField,
} from "../../git-integration/domain/sensitive-data-scanner.js";

export interface ScanFindingInput {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

const SEVERITY_RANK: Record<ScanFindingInput["severity"], number> = {
  error: 3,
  warning: 2,
  info: 1,
};

/** Stable key for the same issue location (rule + file + line span). */
export function scanFindingDedupeKey(
  finding: ScanFindingInput,
  repoDir?: string,
): string {
  const filePath = toRepoRelativePath(finding.filePath, repoDir);
  return `${finding.ruleId}\0${filePath}\0${finding.startLine}\0${finding.endLine}`;
}

/** Collapse duplicate findings from overlapping scanners or batched Semgrep runs. */
export function dedupeScanFindings(
  findings: ScanFindingInput[],
  repoDir?: string,
): ScanFindingInput[] {
  const byKey = new Map<string, ScanFindingInput>();

  for (const finding of findings) {
    const filePath = toRepoRelativePath(finding.filePath, repoDir);
    const normalized = { ...finding, filePath };
    const key = scanFindingDedupeKey(normalized, repoDir);
    const existing = byKey.get(key);
    if (
      !existing
      || SEVERITY_RANK[normalized.severity] > SEVERITY_RANK[existing.severity]
    ) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values());
}

export interface CustomRuleInput {
  ruleId: string;
  severity: string;
  message: string;
  pattern: string;
  extensions: string[];
}

export function mapSemgrepSeverity(raw?: string): "error" | "warning" | "info" {
  switch ((raw ?? "").toUpperCase()) {
    case "ERROR":
    case "CRITICAL":
    case "BLOCKER":
    case "HIGH":
      return "error";
    case "WARNING":
    case "MEDIUM":
    case "LOW":
      return "warning";
    case "INFO":
      return "info";
    default:
      return "warning";
  }
}

function resolveSemgrepSeverity(extra: SemgrepJsonResult["extra"]): "error" | "warning" | "info" {
  if (extra.severity) return mapSemgrepSeverity(extra.severity);

  const metadata = extra.metadata as Record<string, unknown> | undefined;
  const impact = String(metadata?.impact ?? "").toUpperCase();
  const likelihood = String(metadata?.likelihood ?? "").toUpperCase();
  if (impact === "HIGH" || likelihood === "HIGH") return "error";
  if (impact === "MEDIUM" || likelihood === "MEDIUM") return "warning";
  return "info";
}

export function normalizeSeverity(raw: string): "error" | "warning" | "info" {
  const lower = raw.toLowerCase();
  if (lower === "error" || lower === "warning" || lower === "info") return lower;
  return "warning";
}

interface SemgrepJsonResult {
  check_id: string;
  path: string;
  start: { line: number };
  end: { line: number };
  extra: {
    message: string;
    severity?: string;
    lines?: string;
    metadata?: Record<string, unknown>;
  };
}

/** Normalize an absolute scanner path to a repo-relative path for storage and display. */
export function toRepoRelativePath(filePath: string, repoDir?: string): string {
  if (!filePath) return filePath;
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized)) {
    return normalized;
  }

  if (repoDir) {
    const resolvedRepo = resolve(repoDir).replace(/\\/g, "/");
    const resolvedFile = resolve(filePath).replace(/\\/g, "/");
    if (resolvedFile === resolvedRepo) return "";
    if (resolvedFile.startsWith(`${resolvedRepo}/`)) {
      return relative(resolvedRepo, resolvedFile).replace(/\\/g, "/");
    }
  }

  const repoMarker = "/repo/";
  const markerIdx = normalized.indexOf(repoMarker);
  if (markerIdx >= 0) {
    return normalized.slice(markerIdx + repoMarker.length);
  }

  return normalized;
}

export function parseSemgrepOutput(
  stdout: string,
  disabledRuleIds: Set<string>,
  repoDir?: string,
): ScanFindingInput[] {
  let parsed: { results?: SemgrepJsonResult[] };
  try {
    parsed = JSON.parse(stdout) as { results?: SemgrepJsonResult[] };
  } catch {
    return [];
  }

  const findings: ScanFindingInput[] = [];
  for (const result of parsed.results ?? []) {
    if (disabledRuleIds.has(result.check_id)) continue;

    findings.push({
      ruleId: result.check_id,
      severity: resolveSemgrepSeverity(result.extra),
      message: result.extra.message,
      filePath: toRepoRelativePath(result.path, repoDir),
      startLine: result.start.line,
      endLine: result.end.line,
      snippet: result.extra.lines?.trim() ?? "",
    });
  }
  return findings;
}

export function matchesExtension(filePath: string, extensions: string[]): boolean {
  if (extensions.length === 0) return true;
  const fileExt = extname(filePath).toLowerCase();
  return extensions.some((ext) => {
    const normalized = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return fileExt === normalized;
  });
}

/** Path-aware exclusions for custom rules that would false-positive in normal project files. */
export function shouldApplyCustomRule(ruleId: string, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");

  if (ruleId === "custom.laravel.env-in-code") {
    // Laravel config files are where env() belongs; flag only app/runtime usage.
    if (/(?:^|\/)config\//i.test(normalized)) return false;
  }

  return true;
}

export function runCustomRulesOnContent(
  filePath: string,
  content: string,
  rules: CustomRuleInput[],
): ScanFindingInput[] {
  const findings: ScanFindingInput[] = [];

  for (const rule of rules) {
    if (!shouldApplyCustomRule(rule.ruleId, filePath)) continue;

    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, "gi");
    } catch {
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      const lineContent = content.split("\n")[lineNum - 1] ?? "";

      findings.push({
        ruleId: rule.ruleId,
        severity: normalizeSeverity(rule.severity),
        message: rule.message,
        filePath,
        startLine: lineNum,
        endLine: lineNum,
        snippet: lineContent.trim().slice(0, 200),
      });

      if (match[0].length === 0) regex.lastIndex++;
    }
  }

  return findings;
}

const SCHEMA_FILE_PATTERN = /(?:^|\/)(?:migrations?\/.*\.sql|schema\.sql)$/i;
const MODEL_FILE_PATTERN = /\.(ts|tsx|js|jsx|py|rb|php|prisma)$/i;

export function isSchemaFile(filePath: string): boolean {
  return SCHEMA_FILE_PATTERN.test(filePath);
}

export function isModelFile(filePath: string): boolean {
  return MODEL_FILE_PATTERN.test(filePath);
}

export function mapSensitiveSeverity(
  sensitivity: SensitiveField["sensitivity"],
): "error" | "warning" | "info" {
  switch (sensitivity) {
    case "secret":
      return "error";
    case "sensitive":
      return "warning";
    case "personal":
      return "info";
  }
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFieldLocation(
  content: string,
  field: string,
): { line: number; snippet: string } | null {
  const lines = content.split("\n");
  const escapedField = escapeRegexLiteral(field);
  const columnPattern = new RegExp(`["\`']?${escapedField}["\`']?\\s+`, "i");
  const propPattern = new RegExp(`(?:readonly\\s+)?["\`']?${escapedField}["\`']?\\s*[?:]?\\s*[:=]`, "i");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (columnPattern.test(line) || propPattern.test(line)) {
      return { line: i + 1, snippet: line.trim() };
    }
  }
  return null;
}

function locateSqlFinding(
  finding: SensitiveField,
  schemaFiles: Record<string, string>,
): { filePath: string; startLine: number; endLine: number; snippet: string } | null {
  const escapedEntity = escapeRegexLiteral(finding.entity);
  const tablePattern = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`']?${escapedEntity}["\`']?`,
    "i",
  );

  for (const [filePath, content] of Object.entries(schemaFiles)) {
    if (!tablePattern.test(content)) continue;
    const location = findFieldLocation(content, finding.field);
    if (location) {
      return {
        filePath,
        startLine: location.line,
        endLine: location.line,
        snippet: location.snippet,
      };
    }
  }
  return null;
}

function locateModelFinding(
  finding: SensitiveField,
  modelFiles: Record<string, string>,
): { filePath: string; startLine: number; endLine: number; snippet: string } | null {
  for (const [filePath, content] of Object.entries(modelFiles)) {
    const baseName =
      filePath
        .split("/")
        .pop()
        ?.replace(/\.(ts|tsx|js|jsx|py|rb|php|prisma)$/, "") ?? "";
    if (baseName.toLowerCase() !== finding.entity.toLowerCase()) continue;
    const location = findFieldLocation(content, finding.field);
    if (location) {
      return {
        filePath,
        startLine: location.line,
        endLine: location.line,
        snippet: location.snippet,
      };
    }
  }

  for (const [filePath, content] of Object.entries(modelFiles)) {
    const location = findFieldLocation(content, finding.field);
    if (location) {
      return {
        filePath,
        startLine: location.line,
        endLine: location.line,
        snippet: location.snippet,
      };
    }
  }
  return null;
}

export function convertSensitiveFieldsToFindings(
  fields: SensitiveField[],
  schemaFiles: Record<string, string>,
  modelFiles: Record<string, string>,
): ScanFindingInput[] {
  const findings: ScanFindingInput[] = [];

  for (const field of fields) {
    const location = locateSqlFinding(field, schemaFiles) ?? locateModelFinding(field, modelFiles);
    const filePath =
      location?.filePath ??
      Object.keys(schemaFiles)[0] ??
      Object.keys(modelFiles)[0] ??
      "unknown";
    const startLine = location?.startLine ?? 1;
    const endLine = location?.endLine ?? startLine;
    const snippet = location?.snippet ?? `${field.entity}.${field.field}`;

    findings.push({
      ruleId: `sensitive-data.${field.sensitivity}`,
      severity: mapSensitiveSeverity(field.sensitivity),
      message: `${field.reason} (${field.entity}.${field.field})`,
      filePath,
      startLine,
      endLine,
      snippet,
    });
  }

  return findings;
}

export function runSensitiveDataScan(
  files: Array<{ path: string; content: string }>,
): ScanFindingInput[] {
  const schemaFiles: Record<string, string> = {};
  const modelFiles: Record<string, string> = {};

  for (const { path, content } of files) {
    if (isSchemaFile(path)) schemaFiles[path] = content;
    if (isModelFile(path)) modelFiles[path] = content;
  }

  if (Object.keys(schemaFiles).length === 0 && Object.keys(modelFiles).length === 0) {
    return [];
  }

  const fields = scanSensitiveData(schemaFiles, modelFiles);
  return convertSensitiveFieldsToFindings(fields, schemaFiles, modelFiles);
}

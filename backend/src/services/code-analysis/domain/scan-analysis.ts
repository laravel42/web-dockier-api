import { extname } from "node:path";
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

export interface CustomRuleInput {
  ruleId: string;
  severity: string;
  message: string;
  pattern: string;
  extensions: string[];
}

export function mapSemgrepSeverity(raw: string): "error" | "warning" | "info" {
  switch (raw.toUpperCase()) {
    case "ERROR":
      return "error";
    case "WARNING":
      return "warning";
    default:
      return "info";
  }
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
    severity: string;
    lines?: string;
  };
}

export function parseSemgrepOutput(stdout: string, disabledRuleIds: Set<string>): ScanFindingInput[] {
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
      severity: mapSemgrepSeverity(result.extra.severity),
      message: result.extra.message,
      filePath: result.path,
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

export function runCustomRulesOnContent(
  filePath: string,
  content: string,
  rules: CustomRuleInput[],
): ScanFindingInput[] {
  const findings: ScanFindingInput[] = [];
  const lines = content.split("\n");

  for (const rule of rules) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, "g");
    } catch {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      regex.lastIndex = 0;
      if (!regex.test(line)) continue;

      findings.push({
        ruleId: rule.ruleId,
        severity: normalizeSeverity(rule.severity),
        message: rule.message,
        filePath,
        startLine: i + 1,
        endLine: i + 1,
        snippet: line.trim(),
      });
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

function findFieldLocation(
  content: string,
  field: string,
): { line: number; snippet: string } | null {
  const lines = content.split("\n");
  const columnPattern = new RegExp(`["\`']?${field}["\`']?\\s+`, "i");
  const propPattern = new RegExp(`(?:readonly\\s+)?["\`']?${field}["\`']?\\s*[?:]?\\s*[:=]`, "i");

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
  const tablePattern = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`']?${finding.entity}["\`']?`,
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

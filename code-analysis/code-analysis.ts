import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { git_integration } from "~encore/clients";
import { execSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { secret } from "encore.dev/config";

// ─── SonarQube Configuration (optional) ───
const SonarQubeUrl = secret("SonarQubeUrl");
const SonarQubeToken = secret("SonarQubeToken");

// Resolve opengrep binary path at module load
function findOpengrep(): string {
  const candidates = [
    "opengrep",
    join(process.env.HOME || "", ".local/bin/opengrep"),
    join(process.env.HOME || "", ".opengrep/cli/v1.16.5/opengrep"),
    "/usr/local/bin/opengrep",
  ];
  for (const bin of candidates) {
    try {
      const result = spawnSync(bin, ["--version"], { stdio: "pipe", timeout: 5000 });
      if (result.status === 0) return bin;
    } catch { /* try next */ }
  }
  return "opengrep"; // fallback, hope it's in PATH
}
const OPENGREP_BIN = findOpengrep();
console.log(`[code-analysis] Resolved opengrep binary: ${OPENGREP_BIN}`);

const db = new SQLDatabase("codeanalysis", { migrations: "./migrations" });

// Helper to handle double-encoded jsonb summary
function parseSummary(raw: any): ScanSummary {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return { totalFindings: 0, errors: 0, warnings: 0, infos: 0, filesScanned: 0, filesInRepo: 0 }; }
  }
  return raw ?? { totalFindings: 0, errors: 0, warnings: 0, infos: 0, filesScanned: 0, filesInRepo: 0 };
}

// ─── Custom Security Rules (complement Opengrep) ───

interface CustomRule {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  pattern: RegExp;
  extensions: string[];
}

const CUSTOM_RULES: CustomRule[] = [
  // SQL Injection
  { id: "custom.sql-injection.raw-query", severity: "error", message: "Potential SQL injection: raw query with variable interpolation", pattern: /\b(?:DB::raw|DB::select|DB::statement|DB::unprepared)\s*\([^)]*\$(?!this->)/gi, extensions: [".php"] },
  { id: "custom.sql-injection.query-concat", severity: "error", message: "SQL query built with string concatenation", pattern: /(?:->whereRaw|->havingRaw|->orderByRaw|->groupByRaw|->selectRaw)\s*\([^)]*[\$"'].*\.\s*\$/gi, extensions: [".php"] },
  { id: "custom.sql-injection.pdo-concat", severity: "error", message: "PDO query with concatenated variables", pattern: /->(?:query|exec|prepare)\s*\(\s*["'].*\.\s*\$/gi, extensions: [".php"] },
  // XSS
  { id: "custom.xss.unescaped-output", severity: "warning", message: "Unescaped output in Blade template — use {{ }} instead of {!! !!}", pattern: /\{!!\s*\$(?!__)/g, extensions: [".blade.php"] },
  { id: "custom.xss.echo-variable", severity: "warning", message: "Direct echo of variable without escaping", pattern: /\becho\s+\$(?:_(?:GET|POST|REQUEST|COOKIE|SERVER))\b/gi, extensions: [".php"] },
  { id: "custom.xss.v-html", severity: "warning", message: "v-html can lead to XSS if used with user input", pattern: /v-html\s*=\s*"/g, extensions: [".vue"] },
  { id: "custom.xss.dangerouslySetInnerHTML", severity: "warning", message: "dangerouslySetInnerHTML can lead to XSS", pattern: /dangerouslySetInnerHTML/g, extensions: [".jsx", ".tsx"] },
  // Authentication & Authorization
  { id: "custom.auth.hardcoded-secret", severity: "error", message: "Hardcoded secret or API key detected", pattern: /(?:secret|api_key|apikey|password|passwd|token|auth_token|private_key)\s*[:=]\s*['"][A-Za-z0-9+/=]{8,}['"]/gi, extensions: [".php", ".env", ".js", ".ts", ".py", ".rb", ".yaml", ".yml", ".json"] },
  { id: "custom.auth.no-csrf", severity: "warning", message: "Form without CSRF protection", pattern: /<form[^>]*method\s*=\s*["']post["'][^>]*>(?:(?!@csrf|csrf_token|_token).)*$/gis, extensions: [".blade.php", ".php", ".html"] },
  { id: "custom.auth.middleware-bypass", severity: "warning", message: "Route without auth middleware — verify intentional", pattern: /Route::(?:get|post|put|patch|delete)\s*\([^)]+\)\s*(?:->name\([^)]+\))?\s*;/g, extensions: [".php"] },
  // File & Path
  { id: "custom.file.path-traversal", severity: "error", message: "Potential path traversal vulnerability", pattern: /(?:file_get_contents|file_put_contents|fopen|include|require|include_once|require_once|readfile)\s*\([^)]*\$(?:_GET|_POST|_REQUEST|input)/gi, extensions: [".php"] },
  { id: "custom.file.unrestricted-upload", severity: "warning", message: "File upload without extension validation", pattern: /->store\s*\(|move_uploaded_file\s*\(/g, extensions: [".php"] },
  // Command Injection
  { id: "custom.cmd.injection", severity: "error", message: "Potential command injection — user input in shell command", pattern: /(?:exec|system|passthru|shell_exec|popen|proc_open)\s*\([^)]*\$(?:_GET|_POST|_REQUEST|input)/gi, extensions: [".php"] },
  { id: "custom.cmd.backtick", severity: "warning", message: "Backtick operator can execute shell commands", pattern: /`[^`]*\$[^`]+`/g, extensions: [".php"] },
  // Deserialization
  { id: "custom.deser.unserialize", severity: "error", message: "unserialize() with user input can lead to RCE", pattern: /\bunserialize\s*\(\s*\$(?:_GET|_POST|_REQUEST|input)/gi, extensions: [".php"] },
  { id: "custom.deser.yaml-unsafe", severity: "warning", message: "Unsafe YAML parsing — use safe_load instead", pattern: /yaml\.load\s*\(/g, extensions: [".py"] },
  // Information Disclosure
  { id: "custom.info.debug-enabled", severity: "warning", message: "Debug mode enabled — disable in production", pattern: /['"]APP_DEBUG['"]\s*(?:=>|=)\s*(?:true|['"]true['"])/gi, extensions: [".php", ".env"] },
  { id: "custom.info.error-display", severity: "warning", message: "Error display enabled — can leak sensitive info", pattern: /(?:display_errors|display_startup_errors)\s*(?:=|,)\s*(?:1|true|on|['"]1['"])/gi, extensions: [".php", ".ini"] },
  { id: "custom.info.phpinfo", severity: "info", message: "phpinfo() exposes server configuration details", pattern: /\bphpinfo\s*\(\s*\)/g, extensions: [".php"] },
  { id: "custom.info.var-dump-die", severity: "info", message: "Debug output left in code (dd/dump/var_dump)", pattern: /\b(?:dd|dump|var_dump|print_r)\s*\(/g, extensions: [".php"] },
  // Cryptography
  { id: "custom.crypto.weak-hash", severity: "warning", message: "Weak hashing algorithm — use bcrypt/argon2 for passwords", pattern: /\b(?:md5|sha1)\s*\(/g, extensions: [".php", ".py", ".js", ".ts"] },
  { id: "custom.crypto.weak-random", severity: "warning", message: "Weak random number generator — use cryptographic random", pattern: /\b(?:rand|mt_rand|array_rand)\s*\(/g, extensions: [".php"] },
  { id: "custom.crypto.ecb-mode", severity: "error", message: "ECB mode is insecure — use CBC or GCM", pattern: /MCRYPT_MODE_ECB|AES-128-ECB|AES-256-ECB|['"]ecb['"]/gi, extensions: [".php", ".py", ".js", ".ts"] },
  // Laravel-specific
  { id: "custom.laravel.mass-assignment", severity: "warning", message: "Model without $fillable or $guarded — vulnerable to mass assignment", pattern: /class\s+\w+\s+extends\s+Model\s*\{(?:(?!\$fillable|\$guarded).)*\}/gs, extensions: [".php"] },
  { id: "custom.laravel.env-in-code", severity: "info", message: "Direct env() call outside config — use config() instead", pattern: /\benv\s*\(\s*['"][^'"]+['"]/g, extensions: [".php"] },
  { id: "custom.laravel.raw-request", severity: "warning", message: "Using raw request input without validation", pattern: /\$request->(?:input|get|query|post)\s*\(\s*['"][^'"]+['"]\s*\)(?!\s*(?:,|\)))/g, extensions: [".php"] },
  // JavaScript / Node.js
  { id: "custom.js.eval", severity: "error", message: "eval() is dangerous — can execute arbitrary code", pattern: /\beval\s*\(/g, extensions: [".js", ".ts", ".jsx", ".tsx"] },
  { id: "custom.js.innerhtml", severity: "warning", message: "innerHTML assignment can lead to XSS", pattern: /\.innerHTML\s*=/g, extensions: [".js", ".ts", ".jsx", ".tsx"] },
  { id: "custom.js.no-helmet", severity: "info", message: "Express app without helmet — missing security headers", pattern: /express\s*\(\s*\)(?:(?!helmet).)*listen/gs, extensions: [".js", ".ts"] },
  // Python
  { id: "custom.py.pickle-load", severity: "error", message: "pickle.load with untrusted data can lead to RCE", pattern: /pickle\.(?:load|loads)\s*\(/g, extensions: [".py"] },
  { id: "custom.py.subprocess-shell", severity: "warning", message: "subprocess with shell=True can lead to command injection", pattern: /subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True/g, extensions: [".py"] },
  // Generic
  { id: "custom.generic.todo-security", severity: "info", message: "Security-related TODO/FIXME found", pattern: /(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*(?:security|auth|vuln|inject|xss|csrf|sanitiz)/gi, extensions: [".php", ".js", ".ts", ".py", ".rb", ".java", ".go", ".jsx", ".tsx", ".vue"] },
  { id: "custom.generic.cors-wildcard", severity: "warning", message: "CORS allows all origins — restrict in production", pattern: /(?:Access-Control-Allow-Origin|allowedOrigins|cors)\s*(?:=>|:|\()\s*['"\[]*\*/gi, extensions: [".php", ".js", ".ts", ".py", ".json", ".yaml", ".yml"] },
  { id: "custom.generic.http-no-tls", severity: "info", message: "HTTP URL without TLS — consider using HTTPS", pattern: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/g, extensions: [".php", ".js", ".ts", ".py", ".rb", ".java", ".go", ".env", ".yaml", ".yml", ".json"] },
];

const SCANNABLE_EXT = new Set([
  ".php", ".blade.php", ".js", ".ts", ".jsx", ".tsx", ".vue", ".py",
  ".rb", ".java", ".go", ".rs", ".cs", ".env", ".ini", ".yaml", ".yml",
  ".json", ".xml", ".html", ".htm", ".twig", ".sql",
]);

function walkFiles(dir: string, base: string = ""): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "vendor") continue;
      if (entry.isDirectory()) {
        results.push(...walkFiles(join(dir, entry.name), rel));
      } else if (entry.isFile()) {
        const lower = rel.toLowerCase();
        if ([...SCANNABLE_EXT].some(ext => lower.endsWith(ext))) {
          results.push(rel);
        }
      }
    }
  } catch { /* permission errors etc */ }
  return results;
}

interface CustomFinding {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

function runCustomRules(repoDir: string, files: string[]): CustomFinding[] {
  const findings: CustomFinding[] = [];
  for (const relPath of files) {
    const absPath = join(repoDir, relPath);
    let content: string;
    try {
      const stat = statSync(absPath);
      if (stat.size > 512_000) continue; // skip files > 512KB
      content = readFileSync(absPath, "utf-8");
    } catch { continue; }

    const lower = relPath.toLowerCase();
    for (const rule of CUSTOM_RULES) {
      if (!rule.extensions.some(ext => lower.endsWith(ext))) continue;
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split("\n").length;
        const lineContent = content.split("\n")[lineNum - 1] || "";
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.message,
          filePath: relPath,
          startLine: lineNum,
          endLine: lineNum,
          snippet: lineContent.trim().slice(0, 200),
        });
        // Avoid infinite loops on zero-length matches
        if (match[0].length === 0) regex.lastIndex++;
      }
    }
  }
  return findings;
}

// ─── Interfaces ───

interface Finding {
  id: string;
  scanId: string;
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  createdAt: string;
}

interface ScanSummary {
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  filesScanned: number;
  filesInRepo: number;
}

interface Scan {
  id: string;
  userId: string;
  projectId: string;
  connectionId: string;
  repo: string;
  branch: string;
  status: "pending" | "running" | "completed" | "failed";
  summary: ScanSummary;
  createdAt: string;
  updatedAt: string;
}

// ─── Create Scan ───

export const createScan = api(
  { method: "POST", path: "/code-analysis/scans", auth: true },
  async (params: {
    projectId: string;
    connectionId: string;
    repo: string;
    branch: string;
  }): Promise<Scan> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const summary: ScanSummary = { totalFindings: 0, errors: 0, warnings: 0, infos: 0, filesScanned: 0, filesInRepo: 0 };

    await db.exec`
      INSERT INTO scans (id, user_id, project_id, connection_id, repo, branch, status, summary, created_at, updated_at)
      VALUES (${id}, ${authData.userID}, ${params.projectId}, ${params.connectionId},
              ${params.repo}, ${params.branch}, 'pending', ${JSON.stringify(summary)}::jsonb, NOW(), NOW())`;

    return {
      id, userId: authData.userID, projectId: params.projectId,
      connectionId: params.connectionId, repo: params.repo, branch: params.branch,
      status: "pending", summary, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

// ─── List Scans ───

export const listScans = api(
  { method: "GET", path: "/code-analysis/scans", auth: true },
  async (params: { projectId?: string; branch?: string }): Promise<{ scans: Scan[] }> => {
    const authData = getAuthData()!;

    const rows = params.projectId && params.branch
      ? db.query<{
          id: string; user_id: string; project_id: string; connection_id: string;
          repo: string; branch: string; status: string; summary: ScanSummary;
          created_at: Date; updated_at: Date;
        }>`SELECT id, user_id, project_id, connection_id, repo, branch, status, summary, created_at, updated_at
           FROM scans WHERE user_id = ${authData.userID} AND project_id = ${params.projectId} AND branch = ${params.branch}
           ORDER BY created_at DESC LIMIT 50`
      : params.projectId
      ? db.query<{
          id: string; user_id: string; project_id: string; connection_id: string;
          repo: string; branch: string; status: string; summary: ScanSummary;
          created_at: Date; updated_at: Date;
        }>`SELECT id, user_id, project_id, connection_id, repo, branch, status, summary, created_at, updated_at
           FROM scans WHERE user_id = ${authData.userID} AND project_id = ${params.projectId}
           ORDER BY created_at DESC LIMIT 50`
      : db.query<{
          id: string; user_id: string; project_id: string; connection_id: string;
          repo: string; branch: string; status: string; summary: ScanSummary;
          created_at: Date; updated_at: Date;
        }>`SELECT id, user_id, project_id, connection_id, repo, branch, status, summary, created_at, updated_at
           FROM scans WHERE user_id = ${authData.userID}
           ORDER BY created_at DESC LIMIT 50`;

    const scans: Scan[] = [];
    for await (const row of rows) {
      scans.push({
        id: row.id, userId: row.user_id, projectId: row.project_id,
        connectionId: row.connection_id, repo: row.repo, branch: row.branch,
        status: row.status as Scan["status"], summary: parseSummary(row.summary),
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      });
    }
    return { scans };
  }
);

// ─── Get Scan ───

export const getScan = api(
  { method: "GET", path: "/code-analysis/scans/:scanId", auth: true },
  async (params: { scanId: string }): Promise<Scan> => {
    const row = await db.queryRow<{
      id: string; user_id: string; project_id: string; connection_id: string;
      repo: string; branch: string; status: string; summary: ScanSummary;
      created_at: Date; updated_at: Date;
    }>`SELECT id, user_id, project_id, connection_id, repo, branch, status, summary, created_at, updated_at
       FROM scans WHERE id = ${params.scanId}`;

    if (!row) throw APIError.notFound("Scan not found");

    return {
      id: row.id, userId: row.user_id, projectId: row.project_id,
      connectionId: row.connection_id, repo: row.repo, branch: row.branch,
      status: row.status as Scan["status"], summary: parseSummary(row.summary),
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  }
);

// ─── Get Findings for a Scan ───

export const listFindings = api(
  { method: "GET", path: "/code-analysis/scans/:scanId/findings", auth: true },
  async (params: { scanId: string; severity?: string }): Promise<{ findings: Finding[] }> => {
    const rows = params.severity
      ? db.query<{
          id: string; scan_id: string; rule_id: string; severity: string;
          message: string; file_path: string; start_line: number; end_line: number;
          snippet: string; created_at: Date;
        }>`SELECT id, scan_id, rule_id, severity, message, file_path, start_line, end_line, snippet, created_at
           FROM findings WHERE scan_id = ${params.scanId} AND severity = ${params.severity}
           ORDER BY severity, file_path, start_line`
      : db.query<{
          id: string; scan_id: string; rule_id: string; severity: string;
          message: string; file_path: string; start_line: number; end_line: number;
          snippet: string; created_at: Date;
        }>`SELECT id, scan_id, rule_id, severity, message, file_path, start_line, end_line, snippet, created_at
           FROM findings WHERE scan_id = ${params.scanId}
           ORDER BY severity, file_path, start_line`;

    const findings: Finding[] = [];
    for await (const row of rows) {
      findings.push({
        id: row.id, scanId: row.scan_id, ruleId: row.rule_id,
        severity: row.severity as Finding["severity"], message: row.message,
        filePath: row.file_path, startLine: row.start_line, endLine: row.end_line,
        snippet: row.snippet, createdAt: row.created_at.toISOString(),
      });
    }
    return { findings };
  }
);

// ─── Delete Scan ───

export const deleteScan = api(
  { method: "DELETE", path: "/code-analysis/scans/:scanId", auth: true },
  async (params: { scanId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM scans WHERE id = ${params.scanId}`;
    return { success: true };
  }
);

// ─── Run Scan (real Opengrep CLI) ───

interface ScanProgress {
  phase: "cloning" | "scanning" | "persisting" | "done";
  currentFile?: string;
  filesScanned: number;
  filesInRepo: number;
  findingsCount: number;
}

export const runScan = api(
  { method: "POST", path: "/code-analysis/scans/:scanId/run", auth: true },
  async (params: { scanId: string }): Promise<Scan> => {
    const scan = await db.queryRow<{
      id: string; user_id: string; project_id: string; connection_id: string;
      repo: string; branch: string; status: string; summary: ScanSummary;
      created_at: Date; updated_at: Date;
    }>`SELECT * FROM scans WHERE id = ${params.scanId}`;

    if (!scan) throw APIError.notFound("Scan not found");
    if (scan.status === "running") throw APIError.failedPrecondition("Scan is already running");

    // Set running immediately with progress info
    const initialProgress: ScanProgress = { phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 };
    await db.exec`UPDATE scans SET status = 'running', summary = ${JSON.stringify({ ...emptySummary(), progress: initialProgress })}::jsonb, updated_at = NOW() WHERE id = ${params.scanId}`;
    await db.exec`DELETE FROM findings WHERE scan_id = ${params.scanId}`;

    // Fire off the scan asynchronously — don't await
    doScan(params.scanId, scan).catch((e) => {
      console.error(`Scan ${params.scanId} failed:`, e);
    });

    return {
      id: scan.id, userId: scan.user_id, projectId: scan.project_id,
      connectionId: scan.connection_id, repo: scan.repo, branch: scan.branch,
      status: "running", summary: { ...emptySummary() },
      createdAt: scan.created_at.toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

function emptySummary(): ScanSummary {
  return { totalFindings: 0, errors: 0, warnings: 0, infos: 0, filesScanned: 0, filesInRepo: 0 };
}

async function updateProgress(scanId: string, progress: ScanProgress) {
  const summary = {
    totalFindings: progress.findingsCount,
    errors: 0, warnings: 0, infos: 0,
    filesScanned: progress.filesScanned,
    filesInRepo: progress.filesInRepo,
    progress,
  };
  await db.exec`UPDATE scans SET summary = ${JSON.stringify(summary)}::jsonb, updated_at = NOW() WHERE id = ${scanId}`;
}

// ─── SonarQube Scanner Integration ───

interface SonarIssue {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

function mapSonarSeverity(s: string): "error" | "warning" | "info" {
  switch (s) {
    case "BLOCKER":
    case "CRITICAL": return "error";
    case "MAJOR": return "warning";
    case "MINOR":
    case "INFO":
    default: return "info";
  }
}

function findSonarScanner(): string | null {
  const candidates = [
    "sonar-scanner",
    join(process.env.HOME || "", ".sonar/native-sonar-scanner/sonar-scanner"),
    "/usr/local/bin/sonar-scanner",
    "/opt/sonar-scanner/bin/sonar-scanner",
  ];
  for (const bin of candidates) {
    try {
      const result = spawnSync(bin, ["--version"], { stdio: "pipe", timeout: 5000 });
      if (result.status === 0) return bin;
    } catch { /* try next */ }
  }
  return null;
}

async function sonarFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const baseUrl = SonarQubeUrl();
  const token = SonarQubeToken();
  if (!baseUrl || !token) throw new Error("SonarQube URL or token not configured");

  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`SonarQube API ${path} returned ${res.status}: ${await res.text()}`);
  return res.json();
}

async function waitForSonarAnalysis(taskId: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await sonarFetch("/api/ce/task", { id: taskId });
    const status = data.task?.status;
    if (status === "SUCCESS") return;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`SonarQube analysis ${status}: ${data.task?.errorMessage || "unknown error"}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("SonarQube analysis timed out");
}

async function runSonarScanner(repoDir: string, projectKey: string): Promise<SonarIssue[]> {
  const baseUrl = SonarQubeUrl();
  const token = SonarQubeToken();
  if (!baseUrl || !token) {
    console.log("[sonar] SonarQube not configured, skipping");
    return [];
  }

  const scannerBin = findSonarScanner();
  if (!scannerBin) {
    console.log("[sonar] sonar-scanner binary not found, skipping");
    return [];
  }

  console.log(`[sonar] Running sonar-scanner for project ${projectKey}...`);

  // Write sonar-project.properties
  const props = [
    `sonar.projectKey=${projectKey}`,
    `sonar.sources=.`,
    `sonar.host.url=${baseUrl}`,
    `sonar.token=${token}`,
    `sonar.sourceEncoding=UTF-8`,
    `sonar.scm.disabled=true`,
  ].join("\n");
  writeFileSync(join(repoDir, "sonar-project.properties"), props);

  // Run scanner
  try {
    execSync(`${JSON.stringify(scannerBin)}`, {
      cwd: repoDir,
      timeout: 300_000,
      stdio: "pipe",
      env: { ...process.env },
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    console.error(`[sonar] Scanner failed: ${stderr || err.message}`);
    // Try to continue — scanner may have uploaded partial results
  }

  // Read the task ID from .scannerwork/report-task.txt
  const reportTaskPath = join(repoDir, ".scannerwork", "report-task.txt");
  if (!existsSync(reportTaskPath)) {
    console.log("[sonar] No report-task.txt found, scanner may have failed");
    return [];
  }

  const reportContent = readFileSync(reportTaskPath, "utf-8");
  const ceTaskIdMatch = reportContent.match(/ceTaskId=(.+)/);
  if (!ceTaskIdMatch) {
    console.log("[sonar] Could not find ceTaskId in report-task.txt");
    return [];
  }

  // Wait for server to process
  console.log(`[sonar] Waiting for analysis task ${ceTaskIdMatch[1]}...`);
  await waitForSonarAnalysis(ceTaskIdMatch[1]);

  // Pull issues from API
  console.log("[sonar] Fetching issues...");
  const issues: SonarIssue[] = [];
  let page = 1;
  const pageSize = 500;

  while (true) {
    const data = await sonarFetch("/api/issues/search", {
      componentKeys: projectKey,
      resolved: "false",
      ps: String(pageSize),
      p: String(page),
    });

    for (const issue of data.issues || []) {
      // Extract file path from component key (format: projectKey:path/to/file.ts)
      const component = issue.component || "";
      const filePath = component.includes(":") ? component.split(":").slice(1).join(":") : component;

      issues.push({
        ruleId: `sonar.${issue.rule || "unknown"}`,
        severity: mapSonarSeverity(issue.severity || "INFO"),
        message: issue.message || "SonarQube issue",
        filePath,
        startLine: issue.line || issue.textRange?.startLine || 1,
        endLine: issue.textRange?.endLine || issue.line || 1,
        snippet: (issue.message || "").slice(0, 200),
      });
    }

    const total = data.paging?.total || 0;
    if (page * pageSize >= total) break;
    page++;
  }

  console.log(`[sonar] Found ${issues.length} issues`);
  return issues;
}

async function doScan(scanId: string, scan: { connection_id: string; repo: string; branch: string; id: string; user_id: string; project_id: string; created_at: Date }) {
  console.log(`[doScan] Starting scan ${scanId} for ${scan.repo}@${scan.branch}, opengrep binary: ${OPENGREP_BIN}`);
  const tmpDir = mkdtempSync(join(tmpdir(), "opengrep-scan-"));

  try {
    // 1. Clone
    const conn = await git_integration.getConnectionForScan({ connectionId: scan.connection_id });
    const branch = scan.branch || "main";

    let cloneUrl: string;
    if (conn.provider === "github") {
      cloneUrl = `https://x-access-token:${conn.token}@github.com/${scan.repo}.git`;
    } else if (conn.provider === "gitlab" || conn.provider === "gitlab_self_hosted") {
      const endpoint = conn.endpoint || "https://gitlab.com";
      const host = new URL(endpoint).host;
      cloneUrl = `https://oauth2:${conn.token}@${host}/${scan.repo}.git`;
    } else if (conn.provider === "bitbucket") {
      cloneUrl = `https://x-token-auth:${conn.token}@bitbucket.org/${scan.repo}.git`;
    } else {
      throw new Error(`Unsupported provider: ${conn.provider}`);
    }

    execSync(
      `git clone --depth 1 --branch ${JSON.stringify(branch)} ${JSON.stringify(cloneUrl)} repo`,
      { cwd: tmpDir, timeout: 120_000, stdio: "pipe", env: { ...process.env } }
    );

    const repoDir = join(tmpDir, "repo");

    // Count files
    let filesInRepo = 0;
    try {
      const countOutput = execSync("find . -type f -not -path './.git/*' | wc -l", { cwd: repoDir, stdio: "pipe", env: { ...process.env } }).toString().trim();
      filesInRepo = parseInt(countOutput, 10) || 0;
    } catch { /* ignore */ }

    await updateProgress(scanId, { phase: "scanning", filesScanned: 0, filesInRepo, findingsCount: 0 });

    // 2. Run Opengrep
    const outputFile = join(tmpDir, "results.json");
    let openGrepOutput: string;

    console.log(`[doScan] Running opengrep: ${OPENGREP_BIN} in ${repoDir}`);
    try {
      execSync(
        `${JSON.stringify(OPENGREP_BIN)} scan --config auto --json --quiet --json-output=${JSON.stringify(outputFile)} .`,
        { cwd: repoDir, timeout: 300_000, stdio: "pipe", env: { ...process.env, OPENGREP_ENABLE_VERSION_CHECK: "0", HOME: process.env.HOME || "" } }
      );
      openGrepOutput = readFileSync(outputFile, "utf-8");
      console.log(`[doScan] Opengrep completed, output size: ${openGrepOutput.length} bytes`);
    } catch (execErr: any) {
      console.error(`[doScan] Opengrep exec error: ${execErr.message}`);
      console.error(`[doScan] Opengrep stderr: ${execErr.stderr?.toString()?.slice(0, 500) || "(none)"}`);
      if (existsSync(outputFile)) {
        openGrepOutput = readFileSync(outputFile, "utf-8");
        console.log(`[doScan] Opengrep partial output size: ${openGrepOutput.length} bytes`);
      } else {
        const stderr = execErr.stderr?.toString() || "";
        const stdout = execErr.stdout?.toString() || "";
        console.error(`[doScan] No output file, failing. stderr: ${stderr.slice(0, 500)}`);
        throw new Error(`Opengrep failed (bin: ${OPENGREP_BIN}): ${stderr || stdout || execErr.message}`);
      }
    }

    // 3. Parse results
    const parsed = JSON.parse(openGrepOutput) as {
      results?: Array<{
        check_id: string;
        path: string;
        start: { line: number; col: number };
        end: { line: number; col: number };
        extra: { message: string; severity: string; lines: string; metadata?: Record<string, any> };
      }>;
      paths?: { scanned?: string[] };
    };

    const results = parsed.results || [];
    const scannedPaths = parsed.paths?.scanned || [];
    const filesScanned = scannedPaths.length;
    console.log(`[doScan] Opengrep found ${results.length} findings across ${filesScanned} files`);

    const mapSeverity = (s: string): "error" | "warning" | "info" => {
      const upper = s.toUpperCase();
      if (upper === "ERROR") return "error";
      if (upper === "WARNING") return "warning";
      return "info";
    };

    // Group findings by file for progressive insertion
    const findingsByFile = new Map<string, Array<{ ruleId: string; severity: "error" | "warning" | "info"; message: string; filePath: string; startLine: number; endLine: number; snippet: string }>>();
    for (const r of results) {
      const arr = findingsByFile.get(r.path) || [];
      arr.push({
        ruleId: r.check_id,
        severity: mapSeverity(r.extra.severity),
        message: r.extra.message,
        filePath: r.path,
        startLine: r.start.line,
        endLine: r.end.line,
        snippet: (r.extra.lines || "").trim().slice(0, 200),
      });
      findingsByFile.set(r.path, arr);
    }

    // 3b. Run custom regex-based rules on the cloned repo
    console.log(`[doScan] Running custom rules on ${scanId}...`);
    const allFiles = walkFiles(repoDir);
    const customFindings = runCustomRules(repoDir, allFiles);
    console.log(`[doScan] Custom rules found ${customFindings.length} findings in ${allFiles.length} files`);

    // Merge custom findings into the map
    for (const cf of customFindings) {
      const arr = findingsByFile.get(cf.filePath) || [];
      arr.push(cf);
      findingsByFile.set(cf.filePath, arr);
    }

    // 3c. Run SonarQube scanner (if configured)
    let sonarFindings: SonarIssue[] = [];
    try {
      const sonarProjectKey = `scan-${scanId}`;
      sonarFindings = await runSonarScanner(repoDir, sonarProjectKey);
      console.log(`[doScan] SonarQube found ${sonarFindings.length} issues`);
    } catch (sonarErr: any) {
      console.log(`[doScan] SonarQube scan skipped or failed: ${sonarErr.message}`);
    }

    // Merge sonar findings into the map
    for (const sf of sonarFindings) {
      const arr = findingsByFile.get(sf.filePath) || [];
      arr.push(sf);
      findingsByFile.set(sf.filePath, arr);
    }

    // 4. Persist findings file-by-file, updating progress after each file
    await updateProgress(scanId, { phase: "persisting", filesScanned, filesInRepo, findingsCount: 0, currentFile: "" });

    let totalInserted = 0;

    for (const [filePath, fileFindings] of findingsByFile) {

      const batch = fileFindings.map((f) => ({
        id: uuidv4(),
        scanId,
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
        filePath: f.filePath,
        startLine: f.startLine,
        endLine: f.endLine,
        snippet: f.snippet,
      }));

      await Promise.all(batch.map((f) =>
        db.exec`INSERT INTO findings (id, scan_id, rule_id, severity, message, file_path, start_line, end_line, snippet, created_at)
          VALUES (${f.id}, ${f.scanId}, ${f.ruleId}, ${f.severity}, ${f.message}, ${f.filePath}, ${f.startLine}, ${f.endLine}, ${f.snippet}, NOW())`
      ));

      totalInserted += batch.length;

      // Update progress every file so frontend can poll
      await updateProgress(scanId, {
        phase: "persisting",
        currentFile: filePath,
        filesScanned,
        filesInRepo,
        findingsCount: totalInserted,
      });
    }

    // 5. Compute final summary
    const allSeverities = [
      ...results.map((r) => mapSeverity(r.extra.severity)),
      ...customFindings.map((f) => f.severity),
      ...sonarFindings.map((f) => f.severity),
    ];
    const summary: ScanSummary = {
      totalFindings: totalInserted,
      errors: allSeverities.filter((s) => s === "error").length,
      warnings: allSeverities.filter((s) => s === "warning").length,
      infos: allSeverities.filter((s) => s === "info").length,
      filesScanned,
      filesInRepo,
    };

    await db.exec`UPDATE scans SET status = 'completed', summary = ${JSON.stringify(summary)}::jsonb, updated_at = NOW() WHERE id = ${scanId}`;
  } catch (e: any) {
    console.error(`Scan ${scanId} error:`, e);
    await db.exec`UPDATE scans SET status = 'failed', summary = ${JSON.stringify({ ...emptySummary(), error: String(e?.message || e) })}::jsonb, updated_at = NOW() WHERE id = ${scanId}`;
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { git_integration } from "~encore/clients";
import { execSync, spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { secret } from "encore.dev/config";
import { db, initDb } from "../lib/db";

const DatabaseUrl = secret("DatabaseUrl");

initDb(DatabaseUrl());

// Resolve semgrep binary path at module load
function findSemgrep(): string | null {
  const candidates = [
    "semgrep",
    join(process.env.HOME || "", ".local/bin/semgrep"),
    "/usr/local/bin/semgrep",
    "/opt/homebrew/bin/semgrep",
    // pip install locations
    join(process.env.HOME || "", ".local/pipx/venvs/semgrep/bin/semgrep"),
    "/usr/bin/semgrep",
  ];
  for (const bin of candidates) {
    try {
      const result = spawnSync(bin, ["--version"], { stdio: "pipe", timeout: 5000 });
      if (result.status === 0) return bin;
    } catch { /* try next */ }
  }
  // Last resort: use `which` to find it anywhere in PATH
  try {
    const which = spawnSync("which", ["semgrep"], { stdio: "pipe", timeout: 5000 });
    if (which.status === 0) {
      const path = which.stdout.toString().trim();
      if (path) return path;
    }
  } catch { /* ignore */ }
  return null;
}
const SEMGREP_BIN = findSemgrep();
console.log(`[code-analysis] Semgrep binary: ${SEMGREP_BIN || "NOT FOUND (scans will skip semgrep)"}`);

// Helper to handle double-encoded jsonb summary
function parseSummary(raw: any): ScanSummary {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return { totalFindings: 0, errors: 0, warnings: 0, infos: 0, filesScanned: 0, filesInRepo: 0 }; }
  }
  return raw ?? { totalFindings: 0, errors: 0, warnings: 0, infos: 0, filesScanned: 0, filesInRepo: 0 };
}

// ─── Custom Security Rules (complement Semgrep) ───

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

// Seed default custom rules on startup
(async () => {
  try {
    const count = await db.queryRow<{ n: number }>`SELECT COUNT(*)::int AS n FROM custom_rules WHERE app_id = ''`;
    if (count && count.n > 0) return;
    for (const rule of CUSTOM_RULES) {
      const id = `seed-${rule.id}`;
      await db.exec`INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions)
        VALUES (${id}, '', ${rule.id}, ${rule.severity}, ${rule.message}, ${rule.pattern.source}, ${rule.extensions})
        ON CONFLICT (id) DO NOTHING`;
    }
    console.log(`[code-analysis] Seeded ${CUSTOM_RULES.length} default custom rules`);
  } catch (e: any) {
    console.error("[code-analysis] Failed to seed custom rules:", e.message);
  }
})();

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

// Load custom rules from DB (system defaults + tenant rules)
async function loadCustomRules(appId: string): Promise<CustomRule[]> {
  const rows = db.query<{
    rule_id: string; severity: string; message: string; pattern: string; extensions: string[];
  }>`SELECT rule_id, severity, message, pattern, extensions FROM custom_rules
     WHERE (app_id = '' OR app_id = ${appId}) AND enabled = true
     ORDER BY rule_id`;
  const rules: CustomRule[] = [];
  for await (const row of rows) {
    try {
      rules.push({
        id: row.rule_id,
        severity: row.severity as "error" | "warning" | "info",
        message: row.message,
        pattern: new RegExp(row.pattern, "gi"),
        extensions: row.extensions,
      });
    } catch { /* skip invalid regex */ }
  }
  return rules;
}

function runCustomRules(repoDir: string, files: string[], rules: CustomRule[]): CustomFinding[] {
  const findings: CustomFinding[] = [];
  for (const relPath of files) {
    const absPath = join(repoDir, relPath);
    let content: string;
    try {
      const stat = statSync(absPath);
      if (stat.size > 512_000) continue;
      content = readFileSync(absPath, "utf-8");
    } catch { continue; }

    const lower = relPath.toLowerCase();
    for (const rule of rules) {
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
  projectId: string;
  connectionId: string;
  repo: string;
  branch: string;
  status: "pending" | "running" | "completed" | "failed";
  summary: ScanSummary;
  commitSha: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Create Scan ───

export const createScan = api(
  { expose: true, method: "POST", path: "/code-analysis/scans", auth: true },
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
      INSERT INTO scans (id, app_id, project_id, connection_id, repo, branch, status, summary, created_at, updated_at)
      VALUES (${id}, ${authData.appId}, ${params.projectId}, ${params.connectionId},
              ${params.repo}, ${params.branch}, 'pending', ${JSON.stringify(summary)}::jsonb, NOW(), NOW())`;

    return {
      id, projectId: params.projectId,
      connectionId: params.connectionId, repo: params.repo, branch: params.branch,
      status: "pending", summary, commitSha: "", commitMessage: "", commitAuthor: "", commitDate: "",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

// ─── List Scans ───

export const listScans = api(
  { expose: true, method: "GET", path: "/code-analysis/scans", auth: true },
  async (params: { projectId?: string; branch?: string }): Promise<{ scans: Scan[] }> => {
    const authData = getAuthData()!;

    const rows = params.projectId && params.branch
      ? db.query<{
          id: string; project_id: string; connection_id: string;
          repo: string; branch: string; status: string; summary: ScanSummary;
          commit_sha: string; commit_message: string; commit_author: string; commit_date: Date | null;
          created_at: Date; updated_at: Date;
        }>`SELECT id, project_id, connection_id, repo, branch, status, summary, commit_sha, commit_message, commit_author, commit_date, created_at, updated_at
           FROM scans WHERE app_id = ${authData.appId} AND project_id = ${params.projectId} AND branch = ${params.branch}
           ORDER BY created_at DESC LIMIT 50`
      : params.projectId
      ? db.query<{
          id: string; project_id: string; connection_id: string;
          repo: string; branch: string; status: string; summary: ScanSummary;
          commit_sha: string; commit_message: string; commit_author: string; commit_date: Date | null;
          created_at: Date; updated_at: Date;
        }>`SELECT id, project_id, connection_id, repo, branch, status, summary, commit_sha, commit_message, commit_author, commit_date, created_at, updated_at
           FROM scans WHERE app_id = ${authData.appId} AND project_id = ${params.projectId}
           ORDER BY created_at DESC LIMIT 50`
      : db.query<{
          id: string; project_id: string; connection_id: string;
          repo: string; branch: string; status: string; summary: ScanSummary;
          commit_sha: string; commit_message: string; commit_author: string; commit_date: Date | null;
          created_at: Date; updated_at: Date;
        }>`SELECT id, project_id, connection_id, repo, branch, status, summary, commit_sha, commit_message, commit_author, commit_date, created_at, updated_at
           FROM scans WHERE app_id = ${authData.appId}
           ORDER BY created_at DESC LIMIT 50`;

    const scans: Scan[] = [];
    for await (const row of rows) {
      scans.push({
        id: row.id, projectId: row.project_id,
        connectionId: row.connection_id, repo: row.repo, branch: row.branch,
        status: row.status as Scan["status"], summary: parseSummary(row.summary),
        commitSha: row.commit_sha || "", commitMessage: row.commit_message || "",
        commitAuthor: row.commit_author || "", commitDate: row.commit_date?.toISOString() || "",
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      });
    }
    return { scans };
  }
);

// ─── Get Scan ───

export const getScan = api(
  { expose: true, method: "GET", path: "/code-analysis/scans/:scanId", auth: true },
  async (params: { scanId: string }): Promise<Scan> => {
    const row = await db.queryRow<{
      id: string; project_id: string; connection_id: string;
      repo: string; branch: string; status: string; summary: ScanSummary;
      commit_sha: string; commit_message: string; commit_author: string; commit_date: Date | null;
      created_at: Date; updated_at: Date;
    }>`SELECT id, project_id, connection_id, repo, branch, status, summary, commit_sha, commit_message, commit_author, commit_date, created_at, updated_at
       FROM scans WHERE id = ${params.scanId}`;

    if (!row) throw APIError.notFound("Scan not found");

    return {
      id: row.id, projectId: row.project_id,
      connectionId: row.connection_id, repo: row.repo, branch: row.branch,
      status: row.status as Scan["status"], summary: parseSummary(row.summary),
      commitSha: row.commit_sha || "", commitMessage: row.commit_message || "",
      commitAuthor: row.commit_author || "", commitDate: row.commit_date?.toISOString() || "",
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  }
);

// ─── Get Findings for a Scan ───

export const listFindings = api(
  { expose: true, method: "GET", path: "/code-analysis/scans/:scanId/findings", auth: true },
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
  { expose: true, method: "DELETE", path: "/code-analysis/scans/:scanId", auth: true },
  async (params: { scanId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM scans WHERE id = ${params.scanId}`;
    return { success: true };
  }
);

// ─── Run Scan (real Semgrep CLI) ───

interface ScanProgress {
  phase: "cloning" | "scanning" | "persisting" | "done";
  currentFile?: string;
  filesScanned: number;
  filesInRepo: number;
  findingsCount: number;
}

export const runScan = api(
  { expose: true, method: "POST", path: "/code-analysis/scans/:scanId/run", auth: true },
  async (params: { scanId: string; enableSemgrep?: boolean; enableCustomRules?: boolean }): Promise<Scan> => {
    const scan = await db.queryRow<{
      id: string; app_id: string; project_id: string; connection_id: string;
      repo: string; branch: string; status: string; summary: ScanSummary;
      created_at: Date; updated_at: Date;
    }>`SELECT * FROM scans WHERE id = ${params.scanId}`;

    if (!scan) throw APIError.notFound("Scan not found");
    if (scan.status === "running") throw APIError.failedPrecondition("Scan is already running");

    const initialProgress: ScanProgress = { phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 };
    await db.exec`UPDATE scans SET status = 'running', summary = ${JSON.stringify({ ...emptySummary(), progress: initialProgress })}::jsonb, updated_at = NOW() WHERE id = ${params.scanId}`;
    await db.exec`DELETE FROM findings WHERE scan_id = ${params.scanId}`;

    const tools = {
      semgrep: params.enableSemgrep !== false,
      customRules: params.enableCustomRules !== false,
    };

    doScan(params.scanId, scan, tools).catch((e) => {
      console.error(`Scan ${params.scanId} failed:`, e);
    });

    return {
      id: scan.id, projectId: scan.project_id,
      connectionId: scan.connection_id, repo: scan.repo, branch: scan.branch,
      status: "running", summary: { ...emptySummary() },
      commitSha: "", commitMessage: "", commitAuthor: "", commitDate: "",
      createdAt: scan.created_at.toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

// ─── Custom Rules CRUD ───

interface CustomRuleResponse {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  pattern: string;
  extensions: string[];
  enabled: boolean;
  isSystem: boolean;
  type: string;
  yamlContent: string;
  createdAt: string;
}

export const listCustomRules = api(
  { expose: true, method: "GET", path: "/code-analysis/custom-rules", auth: true },
  async (params: { type?: string }): Promise<{ rules: CustomRuleResponse[] }> => {
    const authData = getAuthData()!;
    const typeFilter = params.type || "custom";
    const rows = db.query<{
      id: string; app_id: string; rule_id: string; severity: string; message: string;
      pattern: string; extensions: string[]; enabled: boolean; type: string; yaml_content: string; created_at: Date;
    }>`SELECT id, app_id, rule_id, severity, message, pattern, extensions, enabled, type, yaml_content, created_at
       FROM custom_rules WHERE (app_id = '' OR app_id = ${authData.appId}) AND type = ${typeFilter}
       ORDER BY rule_id`;
    const rules: CustomRuleResponse[] = [];
    for await (const r of rows) {
      rules.push({
        id: r.id, ruleId: r.rule_id, severity: r.severity, message: r.message,
        pattern: r.pattern, extensions: r.extensions, enabled: r.enabled,
        isSystem: r.app_id === "", type: r.type, yamlContent: r.yaml_content || "",
        createdAt: r.created_at.toISOString(),
      });
    }
    return { rules };
  }
);

export const createCustomRule = api(
  { expose: true, method: "POST", path: "/code-analysis/custom-rules", auth: true },
  async (params: {
    ruleId: string; severity: string; message: string; pattern: string; extensions: string[];
    type?: string; yamlContent?: string;
  }): Promise<CustomRuleResponse> => {
    const authData = getAuthData()!;
    const ruleType = params.type || "custom";
    if (ruleType === "custom") {
      try { new RegExp(params.pattern); } catch { throw APIError.invalidArgument("Invalid regex pattern"); }
    }
    const id = uuidv4();
    await db.exec`INSERT INTO custom_rules (id, app_id, rule_id, severity, message, pattern, extensions, type, yaml_content)
      VALUES (${id}, ${authData.appId}, ${params.ruleId}, ${params.severity}, ${params.message}, ${params.pattern || ""}, ${params.extensions || []}, ${ruleType}, ${params.yamlContent || ""})`;
    return {
      id, ruleId: params.ruleId, severity: params.severity, message: params.message,
      pattern: params.pattern || "", extensions: params.extensions || [], enabled: true,
      isSystem: false, type: ruleType, yamlContent: params.yamlContent || "",
      createdAt: new Date().toISOString(),
    };
  }
);

export const updateCustomRule = api(
  { expose: true, method: "PUT", path: "/code-analysis/custom-rules/:ruleDbId", auth: true },
  async (params: {
    ruleDbId: string; ruleId?: string; severity?: string; message?: string;
    pattern?: string; extensions?: string[]; enabled?: boolean; yamlContent?: string;
  }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    const row = await db.queryRow<{ app_id: string; type: string }>`SELECT app_id, type FROM custom_rules WHERE id = ${params.ruleDbId}`;
    if (!row) throw APIError.notFound("Rule not found");
    if (row.app_id !== "" && row.app_id !== authData.appId) throw APIError.permissionDenied("Not your rule");
    if (params.pattern && row.type === "custom") { try { new RegExp(params.pattern); } catch { throw APIError.invalidArgument("Invalid regex pattern"); } }
    if (row.app_id === "" && params.enabled === undefined) {
      // System rule: allow editing fields but not deletion
      await db.exec`UPDATE custom_rules SET
        rule_id = COALESCE(${params.ruleId ?? null}, rule_id),
        severity = COALESCE(${params.severity ?? null}, severity),
        message = COALESCE(${params.message ?? null}, message),
        pattern = COALESCE(${params.pattern ?? null}, pattern),
        extensions = COALESCE(${params.extensions ?? null}, extensions),
        enabled = COALESCE(${params.enabled ?? null}, enabled),
        yaml_content = COALESCE(${params.yamlContent ?? null}, yaml_content)
        WHERE id = ${params.ruleDbId}`;
    } else if (row.app_id === "") {
      await db.exec`UPDATE custom_rules SET enabled = ${params.enabled ?? true} WHERE id = ${params.ruleDbId}`;
    } else {
      await db.exec`UPDATE custom_rules SET
        rule_id = COALESCE(${params.ruleId ?? null}, rule_id),
        severity = COALESCE(${params.severity ?? null}, severity),
        message = COALESCE(${params.message ?? null}, message),
        pattern = COALESCE(${params.pattern ?? null}, pattern),
        extensions = COALESCE(${params.extensions ?? null}, extensions),
        enabled = COALESCE(${params.enabled ?? null}, enabled),
        yaml_content = COALESCE(${params.yamlContent ?? null}, yaml_content)
        WHERE id = ${params.ruleDbId}`;
    }
    return { success: true };
  }
);

export const deleteCustomRule = api(
  { expose: true, method: "DELETE", path: "/code-analysis/custom-rules/:ruleDbId", auth: true },
  async (params: { ruleDbId: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    const row = await db.queryRow<{ app_id: string }>`SELECT app_id FROM custom_rules WHERE id = ${params.ruleDbId}`;
    if (!row) throw APIError.notFound("Rule not found");
    if (row.app_id === "") throw APIError.permissionDenied("Cannot delete system rules");
    if (row.app_id !== authData.appId) throw APIError.permissionDenied("Not your rule");
    await db.exec`DELETE FROM custom_rules WHERE id = ${params.ruleDbId}`;
    return { success: true };
  }
);

// ─── Semgrep Rules ───

interface OGRule {
  id: string;
  name: string;
  lang: string;
  path: string;
  severity: string;
  category: string;
  message: string;
}

let _ogRulesCache: OGRule[] | null = null;

export const listSemgrepRules = api(
  { expose: true, method: "GET", path: "/code-analysis/semgrep-rules", auth: true },
  async (): Promise<{ rules: OGRule[]; languages: string[] }> => {
    if (_ogRulesCache) {
      const langs = [...new Set(_ogRulesCache.map(r => r.lang))].sort();
      return { rules: _ogRulesCache, languages: langs };
    }

    const rules: OGRule[] = [];
    const rows = db.query<{
      id: string; rule_id: string; name: string; lang: string; severity: string; category: string; message: string;
    }>`SELECT id, rule_id, name, lang, severity, category, message FROM semgrep_rules ORDER BY lang, rule_id`;
    for await (const r of rows) {
      rules.push({
        id: r.rule_id,
        name: r.name,
        lang: r.lang,
        path: r.rule_id, // use rule_id as path key for DB rules
        severity: r.severity,
        category: r.category,
        message: r.message,
      });
    }

    _ogRulesCache = rules;
    const langs = [...new Set(rules.map(r => r.lang))].sort();
    return { rules, languages: langs };
  }
);

export const getSemgrepRuleContent = api(
  { expose: true, method: "GET", path: "/code-analysis/semgrep-rules/content", auth: true },
  async (params: { path: string }): Promise<{ content: string }> => {
    const row = await db.queryRow<{ yaml_content: string }>`SELECT yaml_content FROM semgrep_rules WHERE rule_id = ${params.path}`;
    if (!row) throw APIError.notFound("Rule not found");
    return { content: row.yaml_content };
  }
);

export const updateSemgrepRuleContent = api(
  { expose: true, method: "PUT", path: "/code-analysis/semgrep-rules/content", auth: true },
  async (params: { path: string; content: string }): Promise<{ success: boolean }> => {
    // Update YAML content and re-parse severity/message
    let severity = "info";
    let message = "";
    const sevMatch = params.content.match(/^\s+severity:\s*(\S+)/m);
    if (sevMatch) {
      const s = sevMatch[1].toUpperCase();
      severity = s === "ERROR" ? "error" : s === "WARNING" ? "warning" : "info";
    }
    const msgMatch = params.content.match(/^\s+message:\s*>-?\s*\n([\s\S]*?)(?=\n\s+\w+:|\n\s+-\s)/m);
    if (msgMatch) {
      message = msgMatch[1].replace(/\n\s+/g, " ").trim();
    } else {
      const inlineMatch = params.content.match(/^\s+message:\s*(.+)$/m);
      if (inlineMatch) message = inlineMatch[1].replace(/^['">-]+\s*/, "").replace(/['"]$/, "").trim();
    }

    await db.exec`UPDATE semgrep_rules SET yaml_content = ${params.content}, severity = ${severity}, message = ${message} WHERE rule_id = ${params.path}`;
    _ogRulesCache = null; // invalidate cache
    return { success: true };
  }
);

// ─── Global Rule Overrides (Semgrep) ───

export const listRuleOverrides = api(
  { expose: true, method: "GET", path: "/code-analysis/rule-overrides", auth: true },
  async (params: { tool: string }): Promise<{ overrides: Array<{ id: string; ruleId: string; enabled: boolean }> }> => {
    const overrides: Array<{ id: string; ruleId: string; enabled: boolean }> = [];
    const rows = db.query<{ id: string; rule_id: string; enabled: boolean }>`
      SELECT id, rule_id, enabled FROM opengrep_rules`;
    for await (const r of rows) overrides.push({ id: r.id, ruleId: r.rule_id, enabled: r.enabled });
    return { overrides };
  }
);

export const toggleRule = api(
  { expose: true, method: "POST", path: "/code-analysis/rule-overrides", auth: true },
  async (params: { tool: string; ruleId: string; enabled: boolean }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    await db.exec`INSERT INTO opengrep_rules (id, app_id, rule_id, enabled)
      VALUES (${id}, ${authData.appId}, ${params.ruleId}, ${params.enabled})
      ON CONFLICT (rule_id) DO UPDATE SET enabled = ${params.enabled}`;
    return { success: true };
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

async function doScan(scanId: string, scan: { connection_id: string; repo: string; branch: string; id: string; app_id: string; project_id: string; created_at: Date }, tools: { semgrep: boolean; customRules: boolean } = { semgrep: true, customRules: true }) {
  console.log(`[doScan] Starting scan ${scanId} for ${scan.repo}@${scan.branch}, tools: semgrep=${tools.semgrep} customRules=${tools.customRules}`);
  const tmpDir = mkdtempSync(join(tmpdir(), "semgrep-scan-"));

  try {
    // 1. Clone
    const conn = await git_integration.getConnectionForScan({ connectionId: scan.connection_id });
    const branch = scan.branch || "main";

    let cloneUrl: string;
    if (conn.provider === "github") {
      cloneUrl = `https://x-access-token:${conn.token}@github.com/${scan.repo}.git`;
    } else if (conn.provider === "gitlab" || conn.provider === "gitlabSelfHosted") {
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

    // Capture commit info from the cloned repo
    let commitSha = "";
    let commitMessage = "";
    let commitAuthor = "";
    let commitDate = "";
    try {
      commitSha = execSync("git rev-parse HEAD", { cwd: repoDir, stdio: "pipe" }).toString().trim();
      commitMessage = execSync("git log -1 --format=%s", { cwd: repoDir, stdio: "pipe" }).toString().trim();
      commitAuthor = execSync("git log -1 --format=%an <%ae>", { cwd: repoDir, stdio: "pipe" }).toString().trim();
      commitDate = execSync("git log -1 --format=%aI", { cwd: repoDir, stdio: "pipe" }).toString().trim();
    } catch { /* ignore — commit info is best-effort */ }

    // Persist commit info on the scan record
    if (commitSha) {
      await db.exec`UPDATE scans SET commit_sha = ${commitSha}, commit_message = ${commitMessage}, commit_author = ${commitAuthor}, commit_date = ${commitDate || null} WHERE id = ${scanId}`;
    }

    // Count files
    let filesInRepo = 0;
    try {
      const countOutput = execSync("find . -type f -not -path './.git/*' | wc -l", { cwd: repoDir, stdio: "pipe", env: { ...process.env } }).toString().trim();
      filesInRepo = parseInt(countOutput, 10) || 0;
    } catch { /* ignore */ }

    await updateProgress(scanId, { phase: "scanning", filesScanned: 0, filesInRepo, findingsCount: 0, currentFile: "Loading disabled rules…" });

    // Load globally disabled rule IDs
    const disabledSemgrep = new Set<string>();
    {
      const ogRows = db.query<{ rule_id: string }>`SELECT rule_id FROM opengrep_rules WHERE enabled = false`;
      for await (const r of ogRows) disabledSemgrep.add(r.rule_id);
    }

    // 2. Run Semgrep (if enabled)
    const outputFile = join(tmpDir, "results.json");
    let semgrepOutput = '{"results":[],"paths":{"scanned":[]}}';

    const mapSeverity = (s: string): "error" | "warning" | "info" => {
      const upper = s.toUpperCase();
      if (upper === "ERROR") return "error";
      if (upper === "WARNING") return "warning";
      return "info";
    };

    const findingsByFile = new Map<string, Array<{ ruleId: string; severity: "error" | "warning" | "info"; message: string; filePath: string; startLine: number; endLine: number; snippet: string }>>();
    let filesScanned = 0;

    if (tools.semgrep) {
      if (!SEMGREP_BIN) {
        console.log("[doScan] Semgrep not installed, skipping");
      } else {
      await updateProgress(scanId, { phase: "scanning", filesScanned: 0, filesInRepo, findingsCount: 0, currentFile: "Running Semgrep scanner…" });
      console.log(`[doScan] Running semgrep: ${SEMGREP_BIN} in ${repoDir}`);

      // Write enabled semgrep rules from DB to a temp directory for the CLI
      const rulesDir = join(tmpDir, "semgrep-rules");
      mkdirSync(rulesDir, { recursive: true });
      let ruleCount = 0;
      const enabledRows = db.query<{ rule_id: string; yaml_content: string }>`
        SELECT rule_id, yaml_content FROM semgrep_rules WHERE enabled = true AND yaml_content != ''`;
      for await (const r of enabledRows) {
        if (disabledSemgrep.has(r.rule_id)) continue;
        const ruleFile = join(rulesDir, r.rule_id.replace(/\./g, "_") + ".yaml");
        writeFileSync(ruleFile, r.yaml_content, "utf-8");
        ruleCount++;
      }
      // Also write user-created semgrep rules from custom_rules table
      const userSemgrepRows = db.query<{ rule_id: string; yaml_content: string }>`
        SELECT rule_id, yaml_content FROM custom_rules WHERE type = 'semgrep' AND enabled = true AND yaml_content != ''`;
      for await (const r of userSemgrepRows) {
        const ruleFile = join(rulesDir, "user_" + r.rule_id.replace(/\./g, "_") + ".yaml");
        writeFileSync(ruleFile, r.yaml_content, "utf-8");
        ruleCount++;
      }
      console.log(`[doScan] Wrote ${ruleCount} semgrep rules to temp dir`);

      const configFlag = ruleCount > 0 ? `--config ${JSON.stringify(rulesDir)}` : "--config auto";
      try {
        execSync(
          `${JSON.stringify(SEMGREP_BIN)} scan ${configFlag} --json --quiet --json-output=${JSON.stringify(outputFile)} .`,
          { cwd: repoDir, timeout: 300_000, stdio: "pipe", env: { ...process.env, SEMGREP_ENABLE_VERSION_CHECK: "0", HOME: process.env.HOME || "" } }
        );
        semgrepOutput = readFileSync(outputFile, "utf-8");
        console.log(`[doScan] Semgrep completed, output size: ${semgrepOutput.length} bytes`);
      } catch (execErr: any) {
        console.error(`[doScan] Semgrep exec error: ${execErr.message}`);
        if (existsSync(outputFile)) {
          semgrepOutput = readFileSync(outputFile, "utf-8");
        } else {
          const stderr = execErr.stderr?.toString() || "";
          throw new Error(`Semgrep failed: ${stderr || execErr.message}`);
        }
      }

      const parsed = JSON.parse(semgrepOutput) as {
        results?: Array<{ check_id: string; path: string; start: { line: number }; end: { line: number }; extra: { message: string; severity: string; lines: string } }>;
        paths?: { scanned?: string[] };
      };
      const results = parsed.results || [];
      filesScanned = parsed.paths?.scanned?.length || 0;
      console.log(`[doScan] Semgrep found ${results.length} findings across ${filesScanned} files`);

      for (const r of results) {
        if (disabledSemgrep.has(r.check_id)) continue;
        const arr = findingsByFile.get(r.path) || [];
        arr.push({ ruleId: r.check_id, severity: mapSeverity(r.extra.severity), message: r.extra.message, filePath: r.path, startLine: r.start.line, endLine: r.end.line, snippet: (r.extra.lines || "").trim().slice(0, 200) });
        findingsByFile.set(r.path, arr);
      }
      }
    } else {
      console.log("[doScan] Semgrep disabled, skipping");
    }

    // 3b. Run custom regex-based rules (if enabled)
    if (tools.customRules) {
      await updateProgress(scanId, { phase: "scanning", filesScanned, filesInRepo, findingsCount: findingsByFile.size, currentFile: "Running custom rules…" });
      console.log(`[doScan] Running custom rules on ${scanId}...`);
      const allFiles = walkFiles(repoDir);
      const dbRules = await loadCustomRules(scan.app_id);
      const customFindings = runCustomRules(repoDir, allFiles, dbRules);
      console.log(`[doScan] Custom rules found ${customFindings.length} findings in ${allFiles.length} files (${dbRules.length} rules loaded)`);
      for (const cf of customFindings) {
        const arr = findingsByFile.get(cf.filePath) || [];
        arr.push(cf);
        findingsByFile.set(cf.filePath, arr);
      }
    } else {
      console.log("[doScan] Custom rules disabled, skipping");
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
        db.exec`INSERT INTO findings (id, scan_id, rule_id, severity, message, file_path, start_line, end_line, snippet, created_at, app_id)
          VALUES (${f.id}, ${f.scanId}, ${f.ruleId}, ${f.severity}, ${f.message}, ${f.filePath}, ${f.startLine}, ${f.endLine}, ${f.snippet}, NOW(), ${scan.app_id})`
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

    // 5. Compute final summary from all persisted findings
    const allFindings = [...findingsByFile.values()].flat();
    const summary: ScanSummary = {
      totalFindings: totalInserted,
      errors: allFindings.filter((f) => f.severity === "error").length,
      warnings: allFindings.filter((f) => f.severity === "warning").length,
      infos: allFindings.filter((f) => f.severity === "info").length,
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


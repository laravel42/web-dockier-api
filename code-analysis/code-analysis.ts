import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { git_integration } from "~encore/clients";
import { execSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { secret } from "encore.dev/config";
import { db, initDb } from "../lib/db";

const RULES_DIR = join(process.cwd(), "code-analysis", "rules", "opengrep");

// ─── SonarQube Configuration (optional) ───
const DatabaseUrl = secret("DatabaseUrl");
const SonarQubeUrl = secret("SonarQubeUrl");
const SonarQubeToken = secret("SonarQubeToken");

initDb(DatabaseUrl());

// Resolve semgrep binary path at module load
function findSemgrep(): string {
  const candidates = [
    "semgrep",
    join(process.env.HOME || "", ".local/bin/semgrep"),
    "/usr/local/bin/semgrep",
  ];
  for (const bin of candidates) {
    try {
      const result = spawnSync(bin, ["--version"], { stdio: "pipe", timeout: 5000 });
      if (result.status === 0) return bin;
    } catch { /* try next */ }
  }
  return "semgrep"; // fallback, hope it's in PATH
}
const SEMGREP_BIN = findSemgrep();
console.log(`[code-analysis] Resolved semgrep binary: ${SEMGREP_BIN}`);

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
  { method: "GET", path: "/code-analysis/scans", auth: true },
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
  { method: "GET", path: "/code-analysis/scans/:scanId", auth: true },
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

// ─── Run Scan (real Semgrep CLI) ───

interface ScanProgress {
  phase: "cloning" | "scanning" | "persisting" | "done";
  currentFile?: string;
  filesScanned: number;
  filesInRepo: number;
  findingsCount: number;
}

export const runScan = api(
  { method: "POST", path: "/code-analysis/scans/:scanId/run", auth: true },
  async (params: { scanId: string; enableSemgrep?: boolean; enableSonarqube?: boolean; enableCustomRules?: boolean }): Promise<Scan> => {
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
      sonarqube: params.enableSonarqube !== false,
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
  { method: "GET", path: "/code-analysis/custom-rules", auth: true },
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
  { method: "POST", path: "/code-analysis/custom-rules", auth: true },
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
  { method: "PUT", path: "/code-analysis/custom-rules/:ruleDbId", auth: true },
  async (params: {
    ruleDbId: string; ruleId?: string; severity?: string; message?: string;
    pattern?: string; extensions?: string[]; enabled?: boolean; yamlContent?: string;
  }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    const row = await db.queryRow<{ app_id: string; type: string }>`SELECT app_id, type FROM custom_rules WHERE id = ${params.ruleDbId}`;
    if (!row) throw APIError.notFound("Rule not found");
    if (row.app_id === "" && params.enabled === undefined) throw APIError.permissionDenied("Cannot edit system rules");
    if (row.app_id !== "" && row.app_id !== authData.appId) throw APIError.permissionDenied("Not your rule");
    if (params.pattern && row.type === "custom") { try { new RegExp(params.pattern); } catch { throw APIError.invalidArgument("Invalid regex pattern"); } }
    if (row.app_id === "") {
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
  { method: "DELETE", path: "/code-analysis/custom-rules/:ruleDbId", auth: true },
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
  { method: "GET", path: "/code-analysis/semgrep-rules", auth: true },
  async (): Promise<{ rules: OGRule[]; languages: string[] }> => {
    if (_ogRulesCache) {
      const langs = [...new Set(_ogRulesCache.map(r => r.lang))].sort();
      return { rules: _ogRulesCache, languages: langs };
    }

    if (!existsSync(RULES_DIR)) throw APIError.failedPrecondition("Semgrep rules not found. Clone rules into code-analysis/rules/opengrep");

    const langDirs = new Set([
      "java", "javascript", "python", "php", "go", "ruby", "rust", "typescript",
      "c", "csharp", "kotlin", "swift", "scala", "bash", "dockerfile", "terraform",
      "html", "json", "yaml", "elixir", "ocaml", "solidity", "clojure", "apex",
      "generic", "ai",
    ]);

    const rules: OGRule[] = [];
    const walkYaml = (dir: string, base: string) => {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            walkYaml(join(dir, entry.name), rel);
          } else if (entry.isFile() && entry.name.endsWith(".yaml") && !entry.name.startsWith(".")) {
            const parts = rel.split("/");
            const lang = parts[0];
            if (!langDirs.has(lang)) return;
            const fileName = parts[parts.length - 1].replace(".yaml", "");
            const category = parts.length > 2 ? parts[1] : "general";
            // Read severity + message from YAML
            let severity = "info";
            let message = "";
            try {
              const raw = readFileSync(join(dir, entry.name), "utf-8");
              // Extract severity
              const sevMatch = raw.match(/^\s+severity:\s*(\S+)/m);
              if (sevMatch) {
                const s = sevMatch[1].toUpperCase();
                severity = s === "ERROR" ? "error" : s === "WARNING" ? "warning" : "info";
              }
              // Extract message
              const msgMatch = raw.match(/^\s+message:\s*>-?\s*\n([\s\S]*?)(?=\n\s+\w+:|\n\s+-\s)/m);
              if (msgMatch) {
                message = msgMatch[1].replace(/\n\s+/g, " ").trim();
              } else {
                const inlineMatch = raw.match(/^\s+message:\s*(.+)$/m);
                if (inlineMatch) message = inlineMatch[1].replace(/^['">-]+\s*/, "").replace(/['"]$/, "").trim();
              }
            } catch { /* ignore */ }
            rules.push({
              id: rel.replace(/\.yaml$/, "").replace(/\//g, "."),
              name: fileName.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              lang, path: rel, severity, category, message,
            });
          }
        }
      } catch { /* permission errors */ }
    };
    walkYaml(RULES_DIR, "");

    _ogRulesCache = rules;
    const langs = [...new Set(rules.map(r => r.lang))].sort();
    return { rules, languages: langs };
  }
);

export const getSemgrepRuleContent = api(
  { method: "GET", path: "/code-analysis/semgrep-rules/content", auth: true },
  async (params: { path: string }): Promise<{ content: string }> => {
    const filePath = join(RULES_DIR, params.path);
    if (!filePath.startsWith(RULES_DIR) || !existsSync(filePath)) throw APIError.notFound("Rule file not found");
    return { content: readFileSync(filePath, "utf-8") };
  }
);

export const updateSemgrepRuleContent = api(
  { method: "PUT", path: "/code-analysis/semgrep-rules/content", auth: true },
  async (params: { path: string; content: string }): Promise<{ success: boolean }> => {
    const filePath = join(RULES_DIR, params.path);
    if (!filePath.startsWith(RULES_DIR)) throw APIError.invalidArgument("Invalid path");
    writeFileSync(filePath, params.content, "utf-8");
    _ogRulesCache = null; // invalidate cache
    return { success: true };
  }
);

// ─── SonarQube Rule Management ───

interface SQProfile {
  key: string;
  name: string;
  language: string;
  languageName: string;
  isDefault: boolean;
  activeRuleCount: number;
}

interface SQRule {
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

export const listSonarProfiles = api(
  { method: "GET", path: "/code-analysis/sonar/profiles", auth: true },
  async (): Promise<{ profiles: SQProfile[] }> => {
    const data = await sonarFetch("/api/qualityprofiles/search");
    const profiles: SQProfile[] = (data.profiles || []).map((p: any) => ({
      key: p.key, name: p.name, language: p.language, languageName: p.languageName,
      isDefault: p.isDefault, activeRuleCount: p.activeRuleCount || 0,
    }));
    return { profiles };
  }
);

export const listSonarRules = api(
  { method: "GET", path: "/code-analysis/sonar/rules", auth: true },
  async (params: { profileKey: string; page?: number; query?: string }): Promise<{ rules: SQRule[]; total: number }> => {
    // Get active rule keys for this profile
    const activeData = await sonarFetch("/api/rules/search", {
      activation: "true",
      qprofile: params.profileKey,
      ps: "500",
      p: String(params.page || 1),
      f: "name,severity,lang,langName,status,cleanCodeAttribute",
      ...(params.query ? { q: params.query } : {}),
    });
    const activeKeys = new Set((activeData.rules || []).map((r: any) => r.key));
    const activeRules: SQRule[] = (activeData.rules || []).map((r: any) => ({
      key: r.key, name: r.name, severity: r.severity, lang: r.lang,
      langName: r.langName, type: r.type, status: r.status, isActive: true,
      cleanCodeAttribute: r.cleanCodeAttribute || "",
      impacts: (r.impacts || []).map((i: any) => ({ softwareQuality: i.softwareQuality, severity: i.severity })),
    }));

    if (params.query) {
      const inactiveData = await sonarFetch("/api/rules/search", {
        activation: "false",
        qprofile: params.profileKey,
        ps: "500",
        p: String(params.page || 1),
        f: "name,severity,lang,langName,status,cleanCodeAttribute",
        q: params.query,
      });
      for (const r of inactiveData.rules || []) {
        if (!activeKeys.has(r.key)) {
          activeRules.push({
            key: r.key, name: r.name, severity: r.severity, lang: r.lang,
            langName: r.langName, type: r.type, status: r.status, isActive: false,
            cleanCodeAttribute: r.cleanCodeAttribute || "",
            impacts: (r.impacts || []).map((i: any) => ({ softwareQuality: i.softwareQuality, severity: i.severity })),
          });
        }
      }
    }

    return { rules: activeRules, total: activeData.total || activeRules.length };
  }
);

export const toggleSonarRule = api(
  { method: "POST", path: "/code-analysis/sonar/rules/toggle", auth: true },
  async (params: { profileKey: string; ruleKey: string; activate: boolean }): Promise<{ success: boolean }> => {
    if (params.activate) {
      await sonarFetch("/api/qualityprofiles/activate_rule", {
        key: params.profileKey,
        rule: params.ruleKey,
      }, "POST");
    } else {
      await sonarFetch("/api/qualityprofiles/deactivate_rule", {
        key: params.profileKey,
        rule: params.ruleKey,
      }, "POST");
    }
    return { success: true };
  }
);

// ─── Global Rule Overrides (Semgrep & SonarQube) ───

export const listRuleOverrides = api(
  { method: "GET", path: "/code-analysis/rule-overrides", auth: true },
  async (params: { tool: "semgrep" | "sonarqube" }): Promise<{ overrides: Array<{ id: string; ruleId: string; enabled: boolean }> }> => {
    const overrides: Array<{ id: string; ruleId: string; enabled: boolean }> = [];
    if (params.tool === "semgrep") {
      const rows = db.query<{ id: string; rule_id: string; enabled: boolean }>`
        SELECT id, rule_id, enabled FROM opengrep_rules`;
      for await (const r of rows) overrides.push({ id: r.id, ruleId: r.rule_id, enabled: r.enabled });
    } else {
      const rows = db.query<{ id: string; rule_id: string; enabled: boolean }>`
        SELECT id, rule_id, enabled FROM sonarqube_rules`;
      for await (const r of rows) overrides.push({ id: r.id, ruleId: r.rule_id, enabled: r.enabled });
    }
    return { overrides };
  }
);

export const toggleRule = api(
  { method: "POST", path: "/code-analysis/rule-overrides", auth: true },
  async (params: { tool: "semgrep" | "sonarqube"; ruleId: string; enabled: boolean }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    if (params.tool === "semgrep") {
      await db.exec`INSERT INTO opengrep_rules (id, app_id, rule_id, enabled)
        VALUES (${id}, ${authData.appId}, ${params.ruleId}, ${params.enabled})
        ON CONFLICT (rule_id) DO UPDATE SET enabled = ${params.enabled}`;
    } else {
      await db.exec`INSERT INTO sonarqube_rules (id, app_id, rule_id, enabled)
        VALUES (${id}, ${authData.appId}, ${params.ruleId}, ${params.enabled})
        ON CONFLICT (rule_id) DO UPDATE SET enabled = ${params.enabled}`;
    }
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

async function sonarFetch(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<any> {
  const baseUrl = SonarQubeUrl();
  const token = SonarQubeToken();
  if (!baseUrl || !token) throw new Error("SonarQube URL or token not configured");

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  let res: Response;
  if (method === "POST") {
    const url = new URL(path, baseUrl);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    res = await fetch(url.toString(), { method: "POST", headers, body: new URLSearchParams(params).toString() });
  } else {
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    res = await fetch(url.toString(), { headers });
  }
  if (!res.ok) throw new Error(`SonarQube API ${path} returned ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
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

async function doScan(scanId: string, scan: { connection_id: string; repo: string; branch: string; id: string; app_id: string; project_id: string; created_at: Date }, tools: { semgrep: boolean; sonarqube: boolean; customRules: boolean } = { semgrep: true, sonarqube: true, customRules: true }) {
  console.log(`[doScan] Starting scan ${scanId} for ${scan.repo}@${scan.branch}, tools: semgrep=${tools.semgrep} sonarqube=${tools.sonarqube} customRules=${tools.customRules}`);
  const tmpDir = mkdtempSync(join(tmpdir(), "semgrep-scan-"));

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
    const disabledSonar = new Set<string>();
    {
      const ogRows = db.query<{ rule_id: string }>`SELECT rule_id FROM opengrep_rules WHERE enabled = false`;
      for await (const r of ogRows) disabledSemgrep.add(r.rule_id);
      const sqRows = db.query<{ rule_id: string }>`SELECT rule_id FROM sonarqube_rules WHERE enabled = false`;
      for await (const r of sqRows) disabledSonar.add(r.rule_id);
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
      await updateProgress(scanId, { phase: "scanning", filesScanned: 0, filesInRepo, findingsCount: 0, currentFile: "Running Semgrep scanner…" });
      console.log(`[doScan] Running semgrep: ${SEMGREP_BIN} in ${repoDir}`);
      const configFlag = existsSync(RULES_DIR) ? `--config ${JSON.stringify(RULES_DIR)}` : "--config auto";
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

    // 3c. Run SonarQube scanner (if enabled and configured)
    let sonarFindings: SonarIssue[] = [];
    if (tools.sonarqube) {
      await updateProgress(scanId, { phase: "scanning", filesScanned, filesInRepo, findingsCount: findingsByFile.size, currentFile: "Running SonarQube scanner…" });
      try {
        const sonarProjectKey = `scan-${scanId}`;
        sonarFindings = await runSonarScanner(repoDir, sonarProjectKey);
        console.log(`[doScan] SonarQube found ${sonarFindings.length} issues`);
      } catch (sonarErr: any) {
        console.log(`[doScan] SonarQube scan skipped or failed: ${sonarErr.message}`);
      }
    } else {
      console.log("[doScan] SonarQube disabled, skipping");
    }

    // Merge sonar findings into the map (skip disabled rules)
    for (const sf of sonarFindings) {
      if (disabledSonar.has(sf.ruleId)) continue;
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


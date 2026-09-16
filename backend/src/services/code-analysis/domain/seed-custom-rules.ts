import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import { CodeAnalysisError } from "./scans.js";

/** Stable UUID per rule_id — satisfies API schema (z.uuid()). */
export function systemRuleUuid(ruleId: string): string {
  const hash = createHash("sha256").update(`dockier:custom-rule:${ruleId}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export interface SystemCustomRuleSeed {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  pattern: string;
  extensions: string[];
}

/**
 * Built-in regex rules shipped with Dockier (organization_id = "" → isSystem).
 */
export const DEFAULT_SYSTEM_CUSTOM_RULES: SystemCustomRuleSeed[] = [
  // SQL Injection
  {
    ruleId: "custom.sql-injection.raw-query",
    severity: "error",
    message: "Potential SQL injection: raw query with variable interpolation",
    pattern: String.raw`\b(?:DB::raw|DB::select|DB::statement|DB::unprepared)\s*\([^)]*\$(?!this->)`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.sql-injection.query-concat",
    severity: "error",
    message: "SQL query built with string concatenation",
    pattern: String.raw`(?:->whereRaw|->havingRaw|->orderByRaw|->groupByRaw|->selectRaw)\s*\([^)]*[\$"'].*\.\s*\$`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.sql-injection.pdo-concat",
    severity: "error",
    message: "PDO query with concatenated variables",
    pattern: String.raw`->(?:query|exec|prepare)\s*\(\s*["'].*\.\s*\$`,
    extensions: [".php"],
  },
  // XSS
  {
    ruleId: "custom.xss.unescaped-output",
    severity: "warning",
    message: "Unescaped output in Blade template — use {{ }} instead of {!! !!}",
    pattern: String.raw`\{!!\s*\$(?!__)`,
    extensions: [".blade.php"],
  },
  {
    ruleId: "custom.xss.echo-variable",
    severity: "warning",
    message: "Direct echo of variable without escaping",
    pattern: String.raw`\becho\s+\$(?:_(?:GET|POST|REQUEST|COOKIE|SERVER))\b`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.xss.v-html",
    severity: "warning",
    message: "v-html can lead to XSS if used with user input",
    pattern: String.raw`v-html\s*=\s*"`,
    extensions: [".vue"],
  },
  {
    ruleId: "custom.xss.dangerouslySetInnerHTML",
    severity: "warning",
    message: "dangerouslySetInnerHTML can lead to XSS",
    pattern: "dangerouslySetInnerHTML",
    extensions: [".jsx", ".tsx"],
  },
  // Authentication & Authorization
  {
    ruleId: "custom.auth.hardcoded-secret",
    severity: "error",
    message: "Hardcoded secret or API key detected",
    pattern: String.raw`(?:secret|api_key|apikey|password|passwd|token|auth_token|private_key)\s*[:=]\s*['"][A-Za-z0-9+/=]{8,}['"]`,
    extensions: [".php", ".env", ".js", ".ts", ".py", ".rb", ".yaml", ".yml", ".json"],
  },
  {
    ruleId: "custom.auth.no-csrf",
    severity: "warning",
    message: "Form without CSRF protection",
    pattern: String.raw`<form[^>]*method\s*=\s*["']post["'][^>]*>(?:(?!@csrf|csrf_token|_token)[\s\S])*$`,
    extensions: [".blade.php", ".php", ".html"],
  },
  {
    ruleId: "custom.auth.middleware-bypass",
    severity: "warning",
    message: "Route without auth middleware — verify intentional",
    pattern: String.raw`Route::(?:get|post|put|patch|delete)\s*\([^)]+\)\s*(?:->name\([^)]+\))?\s*;`,
    extensions: [".php"],
  },
  // File & Path
  {
    ruleId: "custom.file.path-traversal",
    severity: "error",
    message: "Potential path traversal vulnerability",
    pattern: String.raw`(?:file_get_contents|file_put_contents|fopen|include|require|include_once|require_once|readfile)\s*\([^)]*\$(?:_GET|_POST|_REQUEST|input)`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.file.unrestricted-upload",
    severity: "warning",
    message: "File upload without extension validation",
    pattern: String.raw`->store\s*\(|move_uploaded_file\s*\(`,
    extensions: [".php"],
  },
  // Command Injection
  {
    ruleId: "custom.cmd.injection",
    severity: "error",
    message: "Potential command injection — user input in shell command",
    pattern: String.raw`(?:exec|system|passthru|shell_exec|popen|proc_open)\s*\([^)]*\$(?:_GET|_POST|_REQUEST|input)`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.cmd.backtick",
    severity: "warning",
    message: "Backtick operator can execute shell commands",
    pattern: "[^`]*\\$[^`]+`",
    extensions: [".php"],
  },
  // Deserialization
  {
    ruleId: "custom.deser.unserialize",
    severity: "error",
    message: "unserialize() with user input can lead to RCE",
    pattern: String.raw`\bunserialize\s*\(\s*\$(?:_GET|_POST|_REQUEST|input)`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.deser.yaml-unsafe",
    severity: "warning",
    message: "Unsafe YAML parsing — use safe_load instead",
    pattern: String.raw`yaml\.load\s*\(`,
    extensions: [".py"],
  },
  // Information Disclosure
  {
    ruleId: "custom.info.debug-enabled",
    severity: "warning",
    message: "Debug mode enabled — disable in production",
    pattern: String.raw`['"]APP_DEBUG['"]\s*(?:=>|=)\s*(?:true|['"]true['"])`,
    extensions: [".php", ".env"],
  },
  {
    ruleId: "custom.info.error-display",
    severity: "warning",
    message: "Error display enabled — can leak sensitive info",
    pattern: String.raw`(?:display_errors|display_startup_errors)\s*(?:=|,)\s*(?:1|true|on|['"]1['"])`,
    extensions: [".php", ".ini"],
  },
  {
    ruleId: "custom.info.phpinfo",
    severity: "info",
    message: "phpinfo() exposes server configuration details",
    pattern: String.raw`\bphpinfo\s*\(\s*\)`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.info.var-dump-die",
    severity: "info",
    message: "Debug output left in code (dd/dump/var_dump)",
    pattern: String.raw`\b(?:dd|dump|var_dump|print_r)\s*\(`,
    extensions: [".php"],
  },
  // Cryptography
  {
    ruleId: "custom.crypto.weak-hash",
    severity: "warning",
    message: "Weak hashing algorithm — use bcrypt/argon2 for passwords",
    pattern: String.raw`\b(?:md5|sha1)\s*\(`,
    extensions: [".php", ".py", ".js", ".ts"],
  },
  {
    ruleId: "custom.crypto.weak-random",
    severity: "warning",
    message: "Weak random number generator — use cryptographic random",
    pattern: String.raw`\b(?:rand|mt_rand|array_rand)\s*\(`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.crypto.ecb-mode",
    severity: "error",
    message: "ECB mode is insecure — use CBC or GCM",
    pattern: String.raw`MCRYPT_MODE_ECB|AES-128-ECB|AES-256-ECB|['"]ecb['"]`,
    extensions: [".php", ".py", ".js", ".ts"],
  },
  // Laravel-specific
  {
    ruleId: "custom.laravel.mass-assignment",
    severity: "warning",
    message: "Model without $fillable or $guarded — vulnerable to mass assignment",
    pattern: String.raw`class\s+\w+\s+extends\s+Model\s*\{(?:(?!\$fillable|\$guarded)[\s\S])*\}`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.laravel.env-in-code",
    severity: "info",
    message: "env() in application code — prefer config() (config/*.php is excluded)",
    pattern: String.raw`\benv\s*\(\s*['"][^'"]+['"]`,
    extensions: [".php"],
  },
  {
    ruleId: "custom.laravel.raw-request",
    severity: "warning",
    message: "Using raw request input without validation",
    pattern: String.raw`\$request->(?:input|get|query|post)\s*\(\s*['"][^'"]+['"]\s*\)(?!\s*(?:,|\)))`,
    extensions: [".php"],
  },
  // JavaScript / Node.js
  {
    ruleId: "custom.js.eval",
    severity: "error",
    message: "eval() is dangerous — can execute arbitrary code",
    pattern: String.raw`\beval\s*\(`,
    extensions: [".js", ".ts", ".jsx", ".tsx"],
  },
  {
    ruleId: "custom.js.innerhtml",
    severity: "warning",
    message: "innerHTML assignment can lead to XSS",
    pattern: String.raw`\.innerHTML\s*=`,
    extensions: [".js", ".ts", ".jsx", ".tsx"],
  },
  {
    ruleId: "custom.js.no-helmet",
    severity: "info",
    message: "Express app without helmet — missing security headers",
    pattern: String.raw`express\s*\(\s*\)(?:(?!helmet)[\s\S])*listen`,
    extensions: [".js", ".ts"],
  },
  // Python
  {
    ruleId: "custom.py.pickle-load",
    severity: "error",
    message: "pickle.load with untrusted data can lead to RCE",
    pattern: String.raw`pickle\.(?:load|loads)\s*\(`,
    extensions: [".py"],
  },
  {
    ruleId: "custom.py.subprocess-shell",
    severity: "warning",
    message: "subprocess with shell=True can lead to command injection",
    pattern: String.raw`subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True`,
    extensions: [".py"],
  },
  // Generic
  {
    ruleId: "custom.generic.todo-security",
    severity: "info",
    message: "Security-related TODO/FIXME found",
    pattern: String.raw`(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*(?:security|auth|vuln|inject|xss|csrf|sanitiz)`,
    extensions: [".php", ".js", ".ts", ".py", ".rb", ".java", ".go", ".jsx", ".tsx", ".vue"],
  },
  {
    ruleId: "custom.generic.cors-wildcard",
    severity: "warning",
    message: "CORS allows all origins — restrict in production",
    pattern: String.raw`(?:Access-Control-Allow-Origin|allowedOrigins|cors)\s*(?:=>|:|\()\s*['"\[]*\*`,
    extensions: [".php", ".js", ".ts", ".py", ".json", ".yaml", ".yml"],
  },
  {
    ruleId: "custom.generic.http-no-tls",
    severity: "info",
    message: "HTTP URL without TLS — consider using HTTPS",
    pattern: String.raw`['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)`,
    extensions: [".php", ".js", ".ts", ".py", ".rb", ".java", ".go", ".env", ".yaml", ".yml", ".json"],
  },
];

/** Remove legacy system rule rows with non-UUID ids. */
async function removeObsoleteSystemRules(): Promise<void> {
  const filters = [
    supabaseAdmin.from("custom_rules").delete().eq("organization_id", "").like("rule_id", "custom.security.%"),
    supabaseAdmin.from("custom_rules").delete().eq("organization_id", "").like("id", "c0000001-%"),
    supabaseAdmin.from("custom_rules").delete().eq("organization_id", "").like("id", "seed-%"),
  ];

  for (const query of filters) {
    const { error } = await query;
    throwOnError(error, CodeAnalysisError, {
      internalMsg: "Failed to remove obsolete system custom rules",
    });
  }
}

/**
 * Idempotently insert built-in custom rules (organization_id = "").
 * Safe to call on every server boot and before listing rules.
 */
export async function seedCustomRules(): Promise<void> {
  await removeObsoleteSystemRules();

  const now = nowIso();
  const rows = DEFAULT_SYSTEM_CUSTOM_RULES.map((rule) => ({
    id: systemRuleUuid(rule.ruleId),
    organization_id: "",
    rule_id: rule.ruleId,
    severity: rule.severity,
    message: rule.message,
    pattern: rule.pattern,
    extensions: rule.extensions,
    enabled: true,
    type: "custom",
    yaml_content: "",
    created_at: now,
  }));

  const { error } = await supabaseAdmin
    .from("custom_rules")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to seed system custom rules" });
}

/**
 * Nginx Configuration Generator
 *
 * Generates nginx server block configuration from security rules and redirect
 * rules stored in the database. The generated config includes:
 * - HTTP Basic Auth (auth_basic) for security rules
 * - Rewrite/redirect directives for redirect rules
 *
 * The generator is project-type agnostic — it produces standard nginx config
 * that works regardless of the backend framework (Laravel, Node, Django, etc.)
 * because nginx sits in front of the container as a reverse proxy.
 *
 * Architecture:
 *   NetworkRules (DB) → NginxGenerator → nginx config string → Applier (SSH/SSM)
 *
 * To add new rule types in the future, add a new section generator function
 * and call it from `generateNginxConfig()`.
 */

import type { SecurityRuleResponse, RedirectRuleResponse } from "./network.js";

// ─── Types ─────────────────────────────────────────────────────────

export interface NginxGeneratorInput {
  /** Application container name (used for file paths on the server) */
  appName: string;
  /** Port the container listens on (default: 8080) */
  containerPort?: number;
  /** Security rules with credentials */
  securityRules: SecurityRuleResponse[];
  /** Redirect rules */
  redirectRules: RedirectRuleResponse[];
}

export interface NginxGeneratorOutput {
  /** The full nginx server block config */
  serverConfig: string;
  /** htpasswd file contents (one per security rule, keyed by rule ID) */
  htpasswdFiles: Array<{ ruleId: string; path: string; content: string }>;
}

// ─── Generators ────────────────────────────────────────────────────

/**
 * Generate redirect directives for the nginx config.
 * Produces `rewrite` or `return` directives based on redirect type.
 */
function generateRedirectDirectives(rules: RedirectRuleResponse[]): string[] {
  if (rules.length === 0) return [];

  const lines: string[] = [];
  lines.push("    # ── Redirect Rules ──");
  for (const rule of rules) {
    const flag = rule.type === "permanent" ? "permanent" : "redirect";
    // Escape regex special characters to ensure exact path matching
    const from = rule.fromPath.replace(/[^a-zA-Z0-9/_-]/g, "\\$&");
    lines.push(`    rewrite ^${from}$ ${rule.toPath} ${flag};`);
  }
  lines.push("");
  return lines;
}

/**
 * Generate auth_basic location blocks for security rules.
 * Each rule that has credentials gets a protected location.
 * Rules without a path protect the entire site (location /).
 */
function generateSecurityLocations(
  rules: SecurityRuleResponse[],
  appName: string,
  containerPort: number,
): { locationBlocks: string[]; htpasswdFiles: Array<{ ruleId: string; path: string; content: string }> } {
  const locationBlocks: string[] = [];
  const htpasswdFiles: Array<{ ruleId: string; path: string; content: string }> = [];

  const rulesWithCreds = rules.filter((r) => r.credentials.length > 0);
  if (rulesWithCreds.length === 0) return { locationBlocks, htpasswdFiles };

  locationBlocks.push("    # ── Security Rules (HTTP Basic Auth) ──");

  for (const rule of rulesWithCreds) {
    const htpasswdPath = `/etc/nginx/.htpasswd-${appName}-${rule.id.slice(0, 8)}`;

    // htpasswd content uses the pre-hashed passwords from the DB
    // Note: credentials only have username (password_hash is in DB, not exposed to API)
    // We'll generate placeholder entries — the applier will use the actual hashes
    htpasswdFiles.push({
      ruleId: rule.id,
      path: htpasswdPath,
      content: "", // Will be populated by the applier with actual hashes
    });

    const locationPath = rule.path || "/";
    const isRoot = locationPath === "/";

    if (isRoot) {
      // For root protection, we add auth_basic to the main location
      locationBlocks.push(`    # Rule: ${rule.name}`);
      locationBlocks.push(`    auth_basic "${rule.name}";`);
      locationBlocks.push(`    auth_basic_user_file ${htpasswdPath};`);
      locationBlocks.push("");
    } else {
      // For path-specific protection, add a separate location block
      locationBlocks.push(`    # Rule: ${rule.name}`);
      locationBlocks.push(`    location ${locationPath} {`);
      locationBlocks.push(`        auth_basic "${rule.name}";`);
      locationBlocks.push(`        auth_basic_user_file ${htpasswdPath};`);
      locationBlocks.push(`        proxy_pass http://127.0.0.1:${containerPort};`);
      locationBlocks.push(`        proxy_set_header Host $host;`);
      locationBlocks.push(`        proxy_set_header X-Real-IP $remote_addr;`);
      locationBlocks.push(`        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`);
      locationBlocks.push(`        proxy_set_header X-Forwarded-Proto $scheme;`);
      locationBlocks.push(`        proxy_http_version 1.1;`);
      locationBlocks.push('        proxy_set_header Upgrade $http_upgrade;');
      locationBlocks.push('        proxy_set_header Connection "upgrade";');
      locationBlocks.push(`    }`);
      locationBlocks.push("");
    }
  }

  return { locationBlocks, htpasswdFiles };
}

// ─── Main Generator ────────────────────────────────────────────────

/**
 * Generate the full nginx server block and htpasswd files.
 *
 * This produces a complete nginx site config that can be written to
 * /etc/nginx/sites-available/<appName> on the server.
 */
export function generateNginxConfig(input: NginxGeneratorInput): NginxGeneratorOutput {
  const { appName, containerPort = 8080, securityRules, redirectRules } = input;

  const { locationBlocks, htpasswdFiles } = generateSecurityLocations(securityRules, appName, containerPort);
  const redirectLines = generateRedirectDirectives(redirectRules);

  // Determine if root location needs auth_basic
  const rootAuthLines = locationBlocks.filter((l) => l.includes("auth_basic"));
  const hasRootAuth = rootAuthLines.some((l) => !l.includes("location "));

  // Build the server block
  const lines: string[] = [
    "server {",
    "    listen 80 default_server;",
    "    server_name _;",
    "    client_max_body_size 100M;",
    "    large_client_header_buffers 4 32k;",
    "    client_header_buffer_size 16k;",
    "",
  ];

  // Add redirect rules first (processed before location blocks)
  if (redirectLines.length > 0) {
    lines.push(...redirectLines);
  }

  // Add path-specific auth locations (before the catch-all)
  const pathLocations = locationBlocks.filter((l) => l.includes("location "));
  if (pathLocations.length > 0) {
    // Extract full path-specific location blocks
    const pathBlocks = extractPathLocationBlocks(locationBlocks);
    lines.push(...pathBlocks);
  }

  // Main location block
  lines.push("    location / {");
  if (hasRootAuth) {
    // Add auth to main location
    const authLines = locationBlocks.filter(
      (l) => (l.includes("auth_basic") || l.includes("auth_basic_user_file")) && !l.includes("location "),
    );
    for (const al of authLines) {
      lines.push(`    ${al.trim()}`);
    }
  }
  lines.push(`        proxy_pass http://127.0.0.1:${containerPort};`);
  lines.push("        proxy_set_header Host $host;");
  lines.push("        proxy_set_header X-Real-IP $remote_addr;");
  lines.push("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;");
  lines.push("        proxy_set_header X-Forwarded-Proto $scheme;");
  lines.push("        proxy_http_version 1.1;");
  lines.push('        proxy_set_header Upgrade $http_upgrade;');
  lines.push('        proxy_set_header Connection "upgrade";');
  lines.push("    }");
  lines.push("}");

  return {
    serverConfig: lines.join("\n"),
    htpasswdFiles,
  };
}

/**
 * Extract complete path-specific location blocks from the generated lines.
 */
function extractPathLocationBlocks(lines: string[]): string[] {
  const result: string[] = [];
  let inBlock = false;
  let blockLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith("location ") && line.includes("{")) {
      inBlock = true;
      blockLines = [line];
    } else if (inBlock) {
      blockLines.push(line);
      if (line.trim() === "}") {
        result.push(...blockLines);
        result.push("");
        inBlock = false;
        blockLines = [];
      }
    } else if (line.includes("# Rule:") && !inBlock) {
      // Include comment before location blocks
      result.push(line);
    }
  }

  return result;
}

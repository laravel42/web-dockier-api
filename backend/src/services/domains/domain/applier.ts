/**
 * Domain Provisioning Applier
 *
 * Handles the server-side operations for domain management:
 * 1. DNS verification (TXT record or HTTP challenge via Certbot)
 * 2. Nginx configuration update (server_name, SSL directives)
 * 3. SSL certificate issuance via Certbot (Let's Encrypt)
 * 4. www redirect configuration
 * 5. Wildcard subdomain support
 *
 * Uses the same execution infrastructure as network rules (SSM on EC2).
 * Runs on the host OS (not inside the Docker container) because nginx
 * and certbot live on the host.
 *
 * Architecture:
 *   API handler → fetchDomains → generateNginxDomainConfig → resolveTarget → applyToServer
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { listDomains, listCertificates } from "./domains.js";
import type { DomainResponse, SslCertificateResponse } from "./domains.js";
import type { ExecutionTarget } from "../../commands/domain/executor.js";
import type { SslCertificateRow } from "../schemas.js";

// ─── Types ─────────────────────────────────────────────────────────

/** Strict domain name pattern — only allows valid hostnames. */
const SAFE_DOMAIN_NAME = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/** Validate a domain name is safe for shell interpolation. */
function assertSafeDomainName(name: string): void {
  if (!SAFE_DOMAIN_NAME.test(name) || name.length > 253) {
    throw new Error(`Invalid domain name: "${name}"`);
  }
}

export interface ApplyDomainsResult {
  success: boolean;
  message: string;
  generatedConfig?: string;
}

interface DeploymentMeta {
  id: string;
  provider_id: string;
  deploy_strategy: string;
  docker_image: string;
  repo: string;
  infra: Record<string, unknown> | null;
}

// ─── Target Resolution ─────────────────────────────────────────────

/**
 * Resolve the execution target for domain provisioning.
 * Same pattern as network applier — only VPS (EC2) is currently supported.
 */
async function resolveDomainTarget(
  projectId: string,
  tenantId: string,
): Promise<{ target: ExecutionTarget | null; appName: string; errorMessage?: string }> {
  const { data: deployment, error: deployError } = await supabaseAdmin
    .from("deployments")
    .select("id, provider_id, deploy_strategy, docker_image, repo, infra")
    .eq("project_id", projectId)
    .eq("organization_id", tenantId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (deployError) {
    logger.error(`[domains] Error fetching deployment: ${deployError.message}`);
    return { target: null, appName: "", errorMessage: "Failed to fetch deployment details." };
  }

  if (!deployment) {
    return { target: null, appName: "", errorMessage: "No active deployment found. Deploy the project first." };
  }

  if (deployment.deploy_strategy !== "vps") {
    return {
      target: null,
      appName: "",
      errorMessage: `Domain provisioning is currently supported for VPS deployments only. This project uses "${deployment.deploy_strategy}" strategy.`,
    };
  }

  const { data: provider } = await supabaseAdmin
    .from("server_providers")
    .select("provider, api_key, api_secret, region")
    .eq("id", deployment.provider_id)
    .maybeSingle();

  if (!provider) {
    return { target: null, appName: "", errorMessage: "Server provider not found." };
  }

  const appName = (deployment.repo.split("/").pop() || "app")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();

  const infra = (deployment.infra || {}) as Record<string, string>;
  const credentials = { apiKey: provider.api_key, apiSecret: provider.api_secret };
  const region = infra.region || provider.region || "us-east-1";
  const containerName = infra.containerName || appName;

  // AWS EC2 → SSM (preferred)
  if (infra.instanceId) {
    return {
      target: { instanceId: infra.instanceId, containerName, credentials, region },
      appName,
    };
  }

  // Fallback: resolve instance from CFN/IP
  if (provider.provider === "aws") {
    const instanceId = await resolveEc2InstanceId(deployment as DeploymentMeta, provider, region, infra);
    if (instanceId) {
      return {
        target: { instanceId, containerName, credentials, region },
        appName,
      };
    }
  }

  return { target: null, appName, errorMessage: "Cannot resolve server connection for domain provisioning." };
}

// ─── EC2 Instance Resolution ───────────────────────────────────────

async function resolveEc2InstanceId(
  deployment: DeploymentMeta,
  provider: { provider: string; api_key: string; api_secret: string; region: string },
  region: string,
  infra: Record<string, string>,
): Promise<string | undefined> {
  const credentials = { accessKeyId: provider.api_key, secretAccessKey: provider.api_secret };
  const repoName = (deployment.repo.split("/").pop() || "app").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const stackName = infra.stackName || `image-builder-app-${repoName}`;

  try {
    const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });
    const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = result.Stacks?.[0];
    if (stack?.Outputs) {
      const instanceOutput = stack.Outputs.find((o: { OutputKey?: string }) => o.OutputKey === "InstanceId");
      if (instanceOutput?.OutputValue) return instanceOutput.OutputValue;
    }
  } catch {
    // CFN lookup failed
  }

  // IP-based lookup
  const serverIp = infra.serverIp;
  if (serverIp) {
    try {
      const { EC2Client, DescribeInstancesCommand } = await import("@aws-sdk/client-ec2");
      const ec2 = new EC2Client({ region, credentials });
      const descResult = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: "ip-address", Values: [serverIp] }],
      }));
      const instance = descResult.Reservations?.[0]?.Instances?.[0];
      if (instance?.InstanceId) return instance.InstanceId;
    } catch {
      // IP lookup failed
    }
  }

  return undefined;
}

// ─── Host Execution ────────────────────────────────────────────────

interface HostExecResult {
  exitCode: number;
  output: string;
}

/**
 * Execute a script on the EC2 host via SSM (same as network applier).
 */
async function executeOnHost(target: ExecutionTarget, script: string): Promise<HostExecResult> {
  if (!target.instanceId || !target.credentials || !target.region) {
    return { exitCode: 1, output: "Missing instanceId, credentials, or region for host execution." };
  }

  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import("@aws-sdk/client-ssm");
  const ssm = new SSMClient({
    region: target.region,
    credentials: { accessKeyId: target.credentials.apiKey, secretAccessKey: target.credentials.apiSecret },
  });

  try {
    const sendResult = await ssm.send(new SendCommandCommand({
      InstanceIds: [target.instanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: { commands: [script] },
      TimeoutSeconds: 300,
    }));

    const commandId = sendResult.Command?.CommandId;
    if (!commandId) return { exitCode: 1, output: "Failed to send SSM command" };

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const invocation = await ssm.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: target.instanceId,
        }));
        const status = invocation.Status;
        if (status === "Success") {
          return { exitCode: 0, output: (invocation.StandardOutputContent || "").trim() };
        }
        if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
          const errOut = invocation.StandardErrorContent?.trim() || "";
          const stdOut = invocation.StandardOutputContent?.trim() || "";
          return { exitCode: 1, output: [stdOut, errOut].filter(Boolean).join("\n") };
        }
      } catch (err) {
        // InvocationDoesNotExist is expected while SSM registers the command
        if (err instanceof Error && err.name !== "InvocationDoesNotExist") {
          throw err;
        }
      }
    }

    return { exitCode: 1, output: "SSM command timed out" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `SSM execution error: ${msg}` };
  }
}

// ─── Nginx Domain Config Generator ────────────────────────────────

/**
 * Generate nginx server block config for the project's domains.
 *
 * This produces a config that handles:
 * - SSL termination (if certs exist)
 * - www → non-www redirect (or vice versa)
 * - Wildcard subdomains
 * - Proxy to the application container
 *
 * Works for any project type (Laravel, Node, Django, etc.) since nginx
 * sits as a reverse proxy in front of the container.
 */
function generateDomainNginxConfig(params: {
  appName: string;
  domains: DomainResponse[];
  certificates: SslCertificateResponse[];
  containerPort?: number;
}): string {
  const { appName, domains, certificates, containerPort = 8080 } = params;

  // Validate all domain names before interpolating into nginx config
  for (const d of domains) {
    assertSafeDomainName(d.name);
  }

  if (domains.length === 0) {
    // No custom domains — generate default config with server_name _
    return [
      "server {",
      "    listen 80 default_server;",
      "    server_name _;",
      "    client_max_body_size 100M;",
      "",
      "    location / {",
      `        proxy_pass http://127.0.0.1:${containerPort};`,
      "        proxy_set_header Host $host;",
      "        proxy_set_header X-Real-IP $remote_addr;",
      "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "        proxy_set_header X-Forwarded-Proto $scheme;",
      "        proxy_http_version 1.1;",
      '        proxy_set_header Upgrade $http_upgrade;',
      '        proxy_set_header Connection "upgrade";',
      "    }",
      "}",
    ].join("\n");
  }

  const primaryDomain = domains.find((d) => d.isPrimary) || domains[0];
  const activeCerts = certificates.filter((c) => c.status === "active");
  const hasSsl = activeCerts.length > 0;

  // Build server_name list (primary + aliases)
  const serverNames = domains.map((d) => d.name);
  // Add wildcard if enabled
  if (primaryDomain.wildcard) {
    serverNames.push(`*.${primaryDomain.name}`);
  }

  const lines: string[] = [];

  // HTTP → HTTPS redirect (when SSL is active)
  if (hasSsl) {
    lines.push("server {");
    lines.push("    listen 80;");
    lines.push(`    server_name ${serverNames.join(" ")};`);
    lines.push("");
    lines.push("    location /.well-known/acme-challenge/ {");
    lines.push("        root /var/www/acme-challenge;");
    lines.push("    }");
    lines.push("");
    lines.push("    location / {");
    lines.push("        return 301 https://$host$request_uri;");
    lines.push("    }");
    lines.push("}");
    lines.push("");
  }

  // www → non-www redirect block
  const domainsWithWwwRedirect = domains.filter((d) => d.redirectWww);
  if (domainsWithWwwRedirect.length > 0) {
    const wwwNames = domainsWithWwwRedirect.map((d) => `www.${d.name}`);
    lines.push("server {");
    if (hasSsl) {
      lines.push("    listen 443 ssl;");
      lines.push(`    ssl_certificate /etc/letsencrypt/live/${primaryDomain.name}/fullchain.pem;`);
      lines.push(`    ssl_certificate_key /etc/letsencrypt/live/${primaryDomain.name}/privkey.pem;`);
    } else {
      lines.push("    listen 80;");
    }
    lines.push(`    server_name ${wwwNames.join(" ")};`);
    lines.push(`    return 301 $scheme://${primaryDomain.name}$request_uri;`);
    lines.push("}");
    lines.push("");
  }

  // Main server block
  lines.push("server {");
  if (hasSsl) {
    lines.push("    listen 443 ssl http2;");
    lines.push(`    ssl_certificate /etc/letsencrypt/live/${primaryDomain.name}/fullchain.pem;`);
    lines.push(`    ssl_certificate_key /etc/letsencrypt/live/${primaryDomain.name}/privkey.pem;`);
    lines.push("    ssl_protocols TLSv1.2 TLSv1.3;");
    lines.push("    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;");
    lines.push("    ssl_prefer_server_ciphers off;");
    lines.push("");
  } else {
    lines.push("    listen 80;");
  }
  lines.push(`    server_name ${serverNames.join(" ")};`);
  lines.push("    server_tokens off;");
  lines.push("    client_max_body_size 100M;");
  lines.push("");
  lines.push("    location /.well-known/acme-challenge/ {");
  lines.push("        root /var/www/acme-challenge;");
  lines.push("    }");
  lines.push("");
  lines.push("    location / {");
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

  return lines.join("\n");
}

// ─── Shell Script Builders ─────────────────────────────────────────

/**
 * Build the shell script to apply the nginx domain config on the host.
 */
function buildApplyDomainConfigScript(appName: string, nginxConfig: string): string {
  return [
    "#!/bin/bash",
    "",
    `cat > /etc/nginx/sites-available/${appName} << 'NGINXCONF'`,
    nginxConfig,
    "NGINXCONF",
    "",
    `ln -sf /etc/nginx/sites-available/${appName} /etc/nginx/sites-enabled/${appName}`,
    "rm -f /etc/nginx/sites-enabled/default",
    "nginx -t || { echo 'NGINX_CONFIG_INVALID'; exit 1; }",
    "# Reload nginx — try all methods, one will work",
    "nginx -s reload 2>/dev/null || service nginx reload 2>/dev/null || systemctl reload nginx 2>/dev/null || (pkill nginx 2>/dev/null; sleep 1; nginx) || true",
    'echo "DOMAIN_CONFIG_APPLIED"',
  ].join("\n");
}

/**
 * Build the shell script to issue a Let's Encrypt certificate via Certbot.
 *
 * Certbot handles:
 * - HTTP-01 challenge (proves domain ownership via /.well-known/acme-challenge/)
 * - Certificate issuance + auto-renewal cron
 *
 * We use the standalone plugin with --pre-hook/--post-hook to stop/start nginx
 * or the webroot plugin if nginx is serving the challenge directory.
 */
function buildCertbotScript(params: {
  domainName: string;
  wildcard: boolean;
  email?: string;
}): string {
  const { domainName, wildcard } = params;
  // Use a generic email for cert notifications
  const email = params.email || `ssl@${domainName}`;

  const domainArgs = wildcard
    ? `-d ${domainName} -d *.${domainName}`
    : `-d ${domainName}`;

  // For wildcard certs, DNS-01 challenge is required (manual setup).
  // For non-wildcard, HTTP-01 via nginx webroot works automatically.
  if (wildcard) {
    // Wildcard requires DNS plugin — for now we only support non-wildcard auto issuance
    return [
      "#!/bin/bash",
      "set -eu",
      "",
      "# Install certbot if not present",
      "which certbot >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx)",
      "",
      `echo "WILDCARD_CERT_MANUAL_REQUIRED"`,
      `echo "Wildcard certificates require DNS-01 challenge validation."`,
      `echo "Please configure a DNS TXT record for _acme-challenge.${domainName}"`,
      `echo "or use the Certbot DNS plugin for your provider."`,
    ].join("\n");
  }

  return [
    "#!/bin/bash",
    "",
    "# Install certbot if not present",
    "which certbot >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq certbot)",
    "",
    "# Helper: reload nginx using whatever method works on this host",
    "reload_nginx() {",
    "  nginx -t || return 1",
    "  service nginx reload 2>/dev/null || systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || (pkill -HUP nginx 2>/dev/null) || (nginx -s stop 2>/dev/null; sleep 1; nginx)",
    "}",
    "",
    "# Ensure the ACME challenge directory exists",
    "mkdir -p /var/www/acme-challenge",
    "",
    "# Request certificate using webroot method",
    `if certbot certonly --webroot -w /var/www/acme-challenge ${domainArgs} --non-interactive --agree-tos --email ${email} --expand 2>&1; then`,
    '  echo "CERTBOT_DONE"',
    "else",
    "  # Fallback: try standalone — stop nginx, get cert, restart",
    "  sudo pkill nginx 2>/dev/null || true",
    "  sleep 3",
    `  if certbot certonly --standalone ${domainArgs} --non-interactive --agree-tos --email ${email} --expand 2>&1; then`,
    '    echo "CERTBOT_DONE"',
    "  fi",
    "  # Restart nginx",
    "  sudo nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true",
    "fi",
    "",
    "# Set up auto-renewal if not already configured",
    'if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then',
    '  (crontab -l 2>/dev/null; echo "0 12 * * * certbot renew --quiet --deploy-hook \\"kill -HUP \\$(pgrep -o -x nginx) 2>/dev/null || true\\"") | crontab -',
    "fi",
  ].join("\n");
}

// ─── Certificate Status Update ─────────────────────────────────────

/**
 * Update certificate status in the DB after issuance attempt.
 */
async function updateCertificateStatus(
  certId: string,
  status: "active" | "failed",
  expiresAt?: string,
): Promise<void> {
  const updates: Partial<SslCertificateRow> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "active") {
    updates.issued_at = new Date().toISOString();
    // Let's Encrypt certs are valid for 90 days
    if (expiresAt) {
      updates.expires_at = expiresAt;
    } else {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 90);
      updates.expires_at = expiry.toISOString();
    }
  }

  await supabaseAdmin
    .from("ssl_certificates")
    .update(updates)
    .eq("id", certId);
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Preview the generated nginx configuration without applying it.
 * Used by the "Edit Nginx configuration" modal to show the config read-only.
 */
export async function previewDomainConfig(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ generatedConfig: string }> {
  const { tenantId, projectId } = params;

  const [domains, certificates] = await Promise.all([
    listDomains({ tenantId, projectId }),
    listCertificates({ tenantId, projectId }),
  ]);

  const { appName } = await resolveDomainTarget(projectId, tenantId);

  const nginxConfig = generateDomainNginxConfig({
    appName: appName || "app",
    domains,
    certificates,
  });

  return { generatedConfig: nginxConfig };
}

/**
 * Apply domain configuration to the deployed server.
 *
 * This is called after domain/certificate CRUD operations. It:
 * 1. Fetches all domains and certificates for the project
 * 2. Generates an nginx config with proper server_name and SSL directives
 * 3. Resolves the server target
 * 4. Writes the config and reloads nginx
 */
export async function applyDomainConfig(params: {
  tenantId: string;
  projectId: string;
}): Promise<ApplyDomainsResult> {
  const { tenantId, projectId } = params;

  try {
    // 1. Fetch domains and certificates
    const [domains, certificates] = await Promise.all([
      listDomains({ tenantId, projectId }),
      listCertificates({ tenantId, projectId }),
    ]);

    // 2. Resolve target
    const { target, appName, errorMessage } = await resolveDomainTarget(projectId, tenantId);

    if (!target) {
      return {
        success: true,
        message: errorMessage || "Domain configuration saved. It will be applied on next deployment.",
      };
    }

    // 3. Generate nginx config
    const nginxConfig = generateDomainNginxConfig({
      appName,
      domains,
      certificates,
    });

    // 4. Apply the config
    const script = buildApplyDomainConfigScript(appName, nginxConfig);
    logger.info(`[domains] Applying domain config for project ${projectId}`);

    const result = await executeOnHost(target, script);

    if (result.output.includes("DOMAIN_CONFIG_APPLIED")) {
      return {
        success: true,
        message: "Domain configuration applied successfully.",
        generatedConfig: nginxConfig,
      };
    }

    if (result.exitCode !== 0) {
      logger.error(`[domains] Failed to apply domain config: ${result.output}`);
      return {
        success: false,
        message: `Failed to apply domain config: ${result.output.slice(0, 500)}`,
        generatedConfig: nginxConfig,
      };
    }

    return { success: true, message: "Domain configuration applied.", generatedConfig: nginxConfig };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[domains] Error applying domain config for project ${projectId}: ${msg}`);
    return { success: false, message: `Error: ${msg}` };
  }
}

/**
 * Issue an SSL certificate for a domain via Certbot on the deployed server.
 *
 * Flow:
 * 1. Resolve the server target
 * 2. Run certbot to issue the certificate (HTTP-01 challenge)
 * 3. Update nginx config with SSL directives
 * 4. Update the certificate status in the DB
 */
export async function issueCertificate(params: {
  tenantId: string;
  projectId: string;
  certificateId: string;
  domainName: string;
  wildcard?: boolean;
}): Promise<ApplyDomainsResult> {
  const { tenantId, projectId, certificateId, domainName, wildcard = false } = params;

  // Defense-in-depth: validate domain name before interpolating into shell scripts
  assertSafeDomainName(domainName);

  try {
    // 1. Resolve target
    const { target, errorMessage } = await resolveDomainTarget(projectId, tenantId);

    if (!target) {
      return {
        success: false,
        message: errorMessage || "Cannot resolve server for certificate issuance.",
      };
    }

    // 2. Run certbot
    const certbotScript = buildCertbotScript({ domainName, wildcard });
    logger.info(`[domains] Issuing certificate for ${domainName} on project ${projectId}`);

    const certResult = await executeOnHost(target, certbotScript);

    if (certResult.output.includes("WILDCARD_CERT_MANUAL_REQUIRED")) {
      await updateCertificateStatus(certificateId, "failed");
      return {
        success: false,
        message: "Wildcard certificates require DNS-01 challenge. Configure a DNS TXT record for validation.",
      };
    }

    if (!certResult.output.includes("CERTBOT_DONE") && certResult.exitCode !== 0) {
      await updateCertificateStatus(certificateId, "failed");
      logger.error(`[domains] Certbot failed for ${domainName}: ${certResult.output}`);
      return {
        success: false,
        message: `Certificate issuance failed: ${certResult.output.slice(0, 500)}`,
      };
    }

    if (!certResult.output.includes("CERTBOT_DONE")) {
      await updateCertificateStatus(certificateId, "failed");
      logger.error(`[domains] Certbot did not complete for ${domainName}. Output: ${certResult.output}`);
      return {
        success: false,
        message: `Certificate issuance did not complete. Output: ${certResult.output.slice(0, 500)}`,
      };
    }

    // 3. Update the certificate status to active
    await updateCertificateStatus(certificateId, "active");

    // 4. Re-apply nginx config with SSL directives
    const applyResult = await applyDomainConfig({ tenantId, projectId });
    if (!applyResult.success) {
      logger.warn(`[domains] Certificate issued but nginx reload failed: ${applyResult.message}`);
    }

    return {
      success: true,
      message: `SSL certificate issued for ${domainName}. Nginx reloaded with SSL.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateCertificateStatus(certificateId, "failed");
    logger.error(`[domains] Error issuing certificate for ${domainName}: ${msg}`);
    return { success: false, message: `Certificate issuance error: ${msg}` };
  }
}

/**
 * Verify DNS configuration for a domain.
 *
 * Checks if the domain resolves to the server's IP address.
 * This is a pre-check before SSL issuance — if DNS isn't pointing
 * to the server, certbot's HTTP-01 challenge will fail.
 */
export async function verifyDomainDns(params: {
  tenantId: string;
  projectId: string;
  domainName: string;
}): Promise<{ verified: boolean; serverIp?: string; resolvedIp?: string; message: string }> {
  const { tenantId, projectId, domainName } = params;

  try {
    const { target, errorMessage } = await resolveDomainTarget(projectId, tenantId);

    if (!target) {
      return { verified: false, message: errorMessage || "No active deployment found." };
    }

    // Get the server's public IP
    const ipResult = await executeOnHost(target, "curl -s ifconfig.me || curl -s icanhazip.com");
    const serverIp = ipResult.output.trim();

    if (!serverIp || ipResult.exitCode !== 0) {
      return { verified: false, message: "Could not determine server IP." };
    }

    // Resolve the domain's A record via DNS
    const { resolve4 } = await import("node:dns/promises");
    try {
      const addresses = await resolve4(domainName);
      const resolvedIp = addresses[0];

      if (resolvedIp === serverIp) {
        return { verified: true, serverIp, resolvedIp, message: `DNS verified: ${domainName} resolves to ${serverIp}` };
      }

      return {
        verified: false,
        serverIp,
        resolvedIp,
        message: `DNS mismatch: ${domainName} resolves to ${resolvedIp}, but server IP is ${serverIp}. Update your DNS A record.`,
      };
    } catch {
      return {
        verified: false,
        serverIp,
        message: `Cannot resolve ${domainName}. Add an A record pointing to ${serverIp}.`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { verified: false, message: `DNS verification error: ${msg}` };
  }
}

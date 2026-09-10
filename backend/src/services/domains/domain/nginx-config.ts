/**
 * Nginx config and shell-script generation for domain provisioning.
 *
 * Pure string builders — no I/O. They produce the nginx server blocks and the
 * bash scripts that the applier ships to the host to apply config and issue
 * Let's Encrypt certificates via Certbot.
 */

import type { DomainResponse, SslCertificateResponse } from "./domains.js";
import { assertSafeDomainName } from "./applier-target.js";

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
export function generateDomainNginxConfig(params: {
  appName: string;
  domains: DomainResponse[];
  certificates: SslCertificateResponse[];
  containerPort?: number;
}): string {
  const { domains, certificates, containerPort = 8080 } = params;

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

/**
 * Build the shell script to apply the nginx domain config on the host.
 */
export function buildApplyDomainConfigScript(appName: string, nginxConfig: string): string {
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
export function buildCertbotScript(params: {
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

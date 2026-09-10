/**
 * Domain Provisioning Applier
 *
 * Public operations for domain management, run against the deployed server:
 * 1. Preview / apply the generated nginx configuration
 * 2. Issue SSL certificates via Certbot (Let's Encrypt)
 * 3. Verify DNS points at the server before issuance
 *
 * Target resolution and host execution live in `applier-target.ts`; nginx and
 * certbot script generation live in `nginx-config.ts`. This file orchestrates
 * them and owns the certificate-status persistence.
 *
 * Runs on the host OS (not inside the Docker container) because nginx and
 * certbot live on the host.
 */

import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { listDomains, listCertificates } from "./domains.js";
import type { SslCertificateRow } from "../schemas.js";
import { assertSafeDomainName, resolveDomainTarget, executeOnHost } from "./applier-target.js";
import {
  generateDomainNginxConfig,
  buildApplyDomainConfigScript,
  buildCertbotScript,
} from "./nginx-config.js";

export interface ApplyDomainsResult {
  success: boolean;
  message: string;
  generatedConfig?: string;
}

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
    const msg = getErrMsg(err);
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
    const msg = getErrMsg(err);
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
    const msg = getErrMsg(err);
    return { verified: false, message: `DNS verification error: ${msg}` };
  }
}

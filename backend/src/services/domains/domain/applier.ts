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
import { nowIso } from "../../../shared/utils/time.js";
import { listDomains, listCertificates } from "./domains.js";
import type { SslCertificateRow } from "../schemas.js";
import { assertSafeDomainName, resolveDomainTarget, executeOnHost } from "./applier-target.js";
import { lookupActiveDeployment, type ActiveDeployment } from "../../../shared/service-clients/deployments.js";
import {
  generateDomainNginxConfig,
  buildApplyDomainConfigScript,
  buildCertbotScript,
} from "./nginx-config.js";

export interface ApplyDomainsResult {
  success: boolean;
  message: string;
  generatedConfig?: string;
  /**
   * Whether retrying could plausibly succeed.
   *
   * `undefined` on the VPS and Dokploy paths, which have no classifier — those
   * keep the legacy substring rule in `worker.ts`. Only the static paths set it.
   */
  retryable?: boolean;
}

/**
 * Return the active deployment when the project is a static (object storage +
 * CDN) deployment, otherwise null.
 *
 * Returns null on a lookup failure too: the callers all have their own
 * fallthrough for "no deployment", and this keeps the static check from
 * hijacking a VPS project because of a transient read error.
 */
async function resolveStaticDeployment(
  projectId: string,
  tenantId: string,
): Promise<ActiveDeployment | null> {
  const lookup = await lookupActiveDeployment(projectId, tenantId);
  if (!lookup.ok) {
    logger.warn(`[domains] Deployment lookup failed for project ${projectId}: ${lookup.error}`);
    return null;
  }
  const deployment = lookup.deployment;
  return deployment && deployment.deployStrategy === "static" ? deployment : null;
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
    updated_at: nowIso(),
  };
  if (status === "active") {
    updates.issued_at = nowIso();
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
 * Preview the proxy configuration without applying it, for the read-only
 * "View proxy configuration" modal.
 *
 * Dispatches by project type like the apply and issue paths do: Dokploy
 * projects get a description of the live Traefik routing, legacy VPS projects
 * get the generated nginx config.
 */
export async function previewDomainConfig(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ generatedConfig: string }> {
  const { tenantId, projectId } = params;

  // Dokploy projects have no nginx config at all — Traefik routes by host.
  // Without this branch the nginx generator ran unconditionally and showed
  // Dokploy users a proxy_pass block for a server that does not exist.
  const { isDokployProject, previewDomainConfigDokploy } = await import("./dokploy-applier.js");
  if (await isDokployProject(projectId)) {
    return await previewDomainConfigDokploy({ tenantId, projectId });
  }

  // Static sites are served by a CDN — also no nginx.
  const staticDeployment = await resolveStaticDeployment(projectId, tenantId);
  if (staticDeployment) {
    const { previewDomainConfigStatic } = await import("./static/index.js");
    return await previewDomainConfigStatic({ tenantId, projectId, deployment: staticDeployment });
  }

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

  // Dokploy-deployed projects register domains on the Dokploy app (Traefik +
  // Let's Encrypt). The nginx/certbot path below is legacy AWS EC2 VPS only.
  try {
    const { isDokployProject, applyDomainConfigDokploy } = await import("./dokploy-applier.js");
    if (await isDokployProject(projectId)) {
      return await applyDomainConfigDokploy({ tenantId, projectId });
    }
  } catch (err) {
    logger.warn(`[domains] Dokploy strategy check failed, falling back to nginx path: ${getErrMsg(err)}`);
  }

  // Static sites (object storage + CDN) attach domains to the CDN, not a host.
  const staticDeployment = await resolveStaticDeployment(projectId, tenantId);
  if (staticDeployment) {
    const { applyDomainConfigStatic } = await import("./static/index.js");
    return await applyDomainConfigStatic({ tenantId, projectId, deployment: staticDeployment });
  }

  try {
    // 1. Fetch domains and certificates
    const [domains, certificates] = await Promise.all([
      listDomains({ tenantId, projectId }),
      listCertificates({ tenantId, projectId }),
    ]);

    // 2. Resolve target
    const { target, appName, errorMessage } = await resolveDomainTarget(projectId, tenantId);

    if (!target) {
      // success:false, not true. Reporting success for work that did not happen
      // made a domain look configured while it could never serve: the apply job
      // completed, nothing was logged, and the only way to learn the truth was
      // to click "Sync now".
      return {
        success: false,
        message: errorMessage || "Could not resolve a deployment to apply the domain to.",
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

  // On Dokploy, Let's Encrypt is issued by Traefik when the domain is
  // registered with certificateType=letsencrypt. So "issuing a certificate"
  // just means reconciling domains — applyDomainConfigDokploy does that and
  // marks the cert active. No certbot/SSM on this path.
  try {
    const { isDokployProject, applyDomainConfigDokploy } = await import("./dokploy-applier.js");
    if (await isDokployProject(projectId)) {
      return await applyDomainConfigDokploy({ tenantId, projectId });
    }
  } catch (err) {
    logger.warn(`[domains] Dokploy cert strategy check failed, falling back to certbot path: ${getErrMsg(err)}`);
  }

  // Static sites: certificates are provider-issued (ACM), so there is nothing
  // for a manual issuance step to do. Refuse explicitly and record why on the
  // row, rather than leaving it 'pending' forever.
  const staticDeployment = await resolveStaticDeployment(projectId, tenantId);
  if (staticDeployment) {
    const { issueCertificateStatic } = await import("./static/index.js");
    return await issueCertificateStatic({ certificateId });
  }

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
    // Static sites are CNAME-based (CloudFront), so the A-record comparison
    // below cannot work for them — CloudFront answers with rotating edge IPs.
    const staticDeployment = await resolveStaticDeployment(projectId, tenantId);
    if (staticDeployment) {
      const { verifyDomainDnsStatic } = await import("./static/index.js");
      return await verifyDomainDnsStatic({ tenantId, projectId, domainName, deployment: staticDeployment });
    }

    // On Dokploy, the server IP comes from the dokploy_servers mapping (no host
    // shell access). Fall back to the legacy VPS path (curl on the EC2 host).
    let serverIp = "";
    try {
      const { isDokployProject } = await import("./dokploy-applier.js");
      if (await isDokployProject(projectId)) {
        const { getServer } = await import("../../deploy/domain/dokploy/mappings.js");
        const server = await getServer(projectId);
        serverIp = (server?.serverIp || "").trim();
        if (!serverIp) {
          return { verified: false, message: "No Dokploy server is provisioned for this project yet." };
        }
      }
    } catch (err) {
      logger.warn(`[domains] Dokploy DNS-verify path failed, trying nginx path: ${getErrMsg(err)}`);
    }

    if (!serverIp) {
      const { target, errorMessage } = await resolveDomainTarget(projectId, tenantId);
      if (!target) {
        return { verified: false, message: errorMessage || "No active deployment found." };
      }
      // Get the server's public IP from the host
      const ipResult = await executeOnHost(target, "curl -s ifconfig.me || curl -s icanhazip.com");
      serverIp = ipResult.output.trim();
      if (!serverIp || ipResult.exitCode !== 0) {
        return { verified: false, message: "Could not determine server IP." };
      }
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

export interface DnsInstructionsResult {
  supported: boolean;
  domainName?: string;
  records: Array<{ name: string; type: string; value: string; purpose: string }>;
  note: string;
  message?: string;
}

/**
 * The DNS records a user must publish for a domain.
 *
 * Static sites need two (a certificate-validation CNAME and a routing CNAME to
 * the CDN) and the user cannot guess either, so they are surfaced explicitly.
 * The VPS and Dokploy paths already tell the user to point an A record at the
 * server IP that the Domains tab shows, so they report `supported: false` and
 * the UI keeps its existing guidance.
 */
export async function getDomainDnsInstructions(params: {
  tenantId: string;
  projectId: string;
  domainName: string;
}): Promise<DnsInstructionsResult> {
  const { tenantId, projectId, domainName } = params;

  const staticDeployment = await resolveStaticDeployment(projectId, tenantId);
  if (!staticDeployment) {
    return {
      supported: false,
      records: [],
      note: "",
      message: "Point an A record at the server IP shown for this project.",
    };
  }

  const { getDomainDnsInstructionsStatic } = await import("./static/index.js");
  const result = await getDomainDnsInstructionsStatic({
    projectId,
    domainName,
    deployment: staticDeployment,
  });

  if ("error" in result) {
    return { supported: false, records: [], note: "", message: result.error };
  }

  return {
    supported: true,
    domainName: result.domainName,
    records: result.records,
    note: result.note,
  };
}

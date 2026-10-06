/**
 * Static-hosting custom domains — provider dispatch.
 *
 * A static deployment (object storage + CDN) has no container and no host, so
 * none of the nginx/certbot machinery in `applier.ts` applies. This is the third
 * branch of the domains service, alongside Dokploy and legacy VPS.
 */

import { promises as dns } from "node:dns";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import type { ActiveDeployment } from "../../../../shared/service-clients/deployments.js";
import { listDomains } from "../domains.js";
import { normalizeHost } from "./apex.js";
import { awsDnsInstructions, reconcileAwsStaticDomains } from "./aws.js";
import { gcpDnsInstructions, reconcileGcpStaticDomains } from "./gcp.js";
import { findStaticCertRow } from "./certs.js";
import { resolveStaticTarget } from "./target.js";

export interface ApplyDomainsResult {
  success: boolean;
  message: string;
  generatedConfig?: string;
  /** Whether retrying could plausibly succeed. Always set on the static paths. */
  retryable?: boolean;
}

/**
 * Certificates for static sites are provider-issued; there is nothing for a
 * manual "issue certificate" action to do.
 */
const MANUAL_CERT_REFUSAL =
  "Certificates for static sites are requested and renewed automatically by your cloud provider " +
  "(AWS Certificate Manager, or Google-managed certificates). Add the domain in the Domains tab " +
  "and publish the DNS records shown there — no manual certificate is needed.";

/** Apply the project's domains to its CDN. */
export async function applyDomainConfigStatic(params: {
  tenantId: string;
  projectId: string;
  deployment: ActiveDeployment;
}): Promise<ApplyDomainsResult> {
  const { tenantId, projectId, deployment } = params;

  const resolution = await resolveStaticTarget({ projectId, deployment });
  if (!resolution.target) {
    // Deliberately success:false. Reporting success for work that did not
    // happen is the bug this branch exists to remove.
    return {
      success: false,
      message: resolution.errorMessage || "Could not resolve the CDN for this static site.",
    };
  }

  const domains = await listDomains({ tenantId, projectId });
  const mapped = domains.map((d) => ({ id: d.id, name: d.name }));
  const target = resolution.target;

  const outcome =
    target.kind === "gcp-static"
      ? await reconcileGcpStaticDomains({ tenantId, projectId, target, domains: mapped })
      : await reconcileAwsStaticDomains({ tenantId, projectId, target, domains: mapped });

  return { success: outcome.success, message: outcome.message, retryable: outcome.retryable };
}

/** There is no manual certificate step on a static site. */
export async function issueCertificateStatic(params: {
  certificateId: string;
}): Promise<{ success: boolean; message: string }> {
  const { certificateId } = params;

  // Mark the row so the refusal is visible in the UI rather than leaving the
  // certificate spinning on `pending` forever.
  const { setCertState } = await import("./certs.js");
  await setCertState(certificateId, {
    status: "failed",
    verificationState: "failed",
    verificationMessage: MANUAL_CERT_REFUSAL,
  });

  return { success: false, message: MANUAL_CERT_REFUSAL };
}

/**
 * Check whether a domain's DNS points at the CDN.
 *
 * AWS static is CNAME-based, so this resolves CNAME rather than the A record
 * the VPS path checks — an A lookup against CloudFront returns rotating edge
 * IPs that can never match a stored value, which would report a permanent
 * mismatch and tell the user to fix the wrong record type.
 */
export async function verifyDomainDnsStatic(params: {
  tenantId: string;
  projectId: string;
  domainName: string;
  deployment: ActiveDeployment;
}): Promise<{ verified: boolean; serverIp?: string; resolvedIp?: string; message: string }> {
  const { projectId, domainName, deployment } = params;

  const resolution = await resolveStaticTarget({ projectId, deployment });
  if (!resolution.target) {
    return {
      verified: false,
      message: resolution.errorMessage || "Could not resolve the CDN for this static site.",
    };
  }

  // GCP's load balancer owns a dedicated global anycast IP, so the A-record
  // comparison the VPS path uses is already correct there — only the expected
  // value differs. AWS needs a CNAME check instead (below).
  if (resolution.target.kind === "gcp-static") {
    return await verifyGcpARecord(resolution.target.cdnIp, normalizeHost(domainName));
  }

  const expected = normalizeHost(resolution.target.distributionDomain);
  const host = normalizeHost(domainName);

  try {
    const cnames = await dns.resolveCname(host);
    const resolved = cnames.map(normalizeHost);

    if (resolved.includes(expected)) {
      return {
        verified: true,
        serverIp: expected,
        resolvedIp: resolved[0],
        message: `${host} points at the CDN (${expected}).`,
      };
    }

    if (resolved.length > 0) {
      return {
        verified: false,
        serverIp: expected,
        resolvedIp: resolved[0],
        message: `${host} is a CNAME to ${resolved[0]}, but it must point at ${expected}.`,
      };
    }

    return {
      verified: false,
      serverIp: expected,
      message: `${host} has no CNAME record. Add a CNAME pointing at ${expected}.`,
    };
  } catch (err) {
    const msg = getErrMsg(err);

    // A flattened apex (ALIAS/ANAME) answers A but not CNAME. Fall back to
    // comparing the resolved addresses against the CDN's own, so a correctly
    // configured ALIAS is not reported as broken.
    if (/ENODATA|ENOTFOUND/i.test(msg)) {
      const flattened = await verifyFlattenedAlias(host, expected);
      if (flattened) return flattened;

      return {
        verified: false,
        serverIp: expected,
        message:
          `${host} has no CNAME record yet. Add a CNAME pointing at ${expected}. ` +
          `DNS changes can take a few minutes to become visible.`,
      };
    }

    logger.warn({ err: msg, domainName: host, projectId }, "[domains:static] DNS verification failed");
    return { verified: false, serverIp: expected, message: `Could not resolve ${host}: ${msg}` };
  }
}

/**
 * GCP: compare the domain's A record against the load balancer's own IP.
 *
 * Works identically for an apex and a subdomain, which is the advantage of a
 * dedicated anycast address over a CNAME-only CDN.
 */
async function verifyGcpARecord(
  expectedIp: string,
  host: string,
): Promise<{ verified: boolean; serverIp?: string; resolvedIp?: string; message: string }> {
  try {
    const addresses = await dns.resolve4(host);

    if (addresses.includes(expectedIp)) {
      return {
        verified: true,
        serverIp: expectedIp,
        resolvedIp: expectedIp,
        message: `${host} points at the load balancer (${expectedIp}).`,
      };
    }

    if (addresses.length > 0) {
      return {
        verified: false,
        serverIp: expectedIp,
        resolvedIp: addresses[0],
        message: `${host} resolves to ${addresses[0]}, but it must point at ${expectedIp}.`,
      };
    }

    return {
      verified: false,
      serverIp: expectedIp,
      message: `${host} has no A record. Add an A record pointing at ${expectedIp}.`,
    };
  } catch (err) {
    const msg = getErrMsg(err);
    if (/ENODATA|ENOTFOUND/i.test(msg)) {
      return {
        verified: false,
        serverIp: expectedIp,
        message:
          `${host} has no A record yet. Add an A record pointing at ${expectedIp}. ` +
          `DNS changes can take a few minutes to become visible, and the certificate is only ` +
          `issued after Google can see this record.`,
      };
    }
    return { verified: false, serverIp: expectedIp, message: `Could not resolve ${host}: ${msg}` };
  }
}

/**
 * Detect an ALIAS/ANAME-flattened record by comparing the addresses the domain
 * resolves to against the CDN hostname's own addresses.
 *
 * Overlap is strong evidence the domain is served by the same distribution.
 * CloudFront returns different edges per query, so a miss is inconclusive, not
 * a failure — hence null rather than a negative verdict.
 */
async function verifyFlattenedAlias(
  host: string,
  cdnHost: string,
): Promise<{ verified: boolean; serverIp?: string; resolvedIp?: string; message: string } | null> {
  try {
    const [hostAddrs, cdnAddrs] = await Promise.all([dns.resolve4(host), dns.resolve4(cdnHost)]);
    const cdnSet = new Set(cdnAddrs);
    const shared = hostAddrs.find((a) => cdnSet.has(a));
    if (shared) {
      return {
        verified: true,
        serverIp: cdnHost,
        resolvedIp: shared,
        message: `${host} resolves to the CDN via a flattened ALIAS record.`,
      };
    }
  } catch {
    // Nothing to add — the caller reports the CNAME guidance.
  }
  return null;
}

/** A truthful description of how a static site is routed. */
export async function previewDomainConfigStatic(params: {
  tenantId: string;
  projectId: string;
  deployment: ActiveDeployment;
}): Promise<{ generatedConfig: string }> {
  const { tenantId, projectId, deployment } = params;

  const lines: string[] = [
    "# Routing is served by Amazon CloudFront. There is no nginx config for this",
    "# project — the CDN terminates TLS at the edge and reads objects from S3 over",
    "# Origin Access Control.",
    "#",
    "# This view is read-only. Edit domains from the Domains tab.",
    "",
  ];

  const resolution = await resolveStaticTarget({ projectId, deployment });
  if (!resolution.target) {
    lines.push(resolution.errorMessage || "Could not resolve the CDN for this static site.");
    return { generatedConfig: lines.join("\n") };
  }

  const target = resolution.target;
  const routeTarget =
    target.kind === "gcp-static" ? target.cdnIp : target.distributionDomain;

  if (target.kind === "gcp-static") {
    lines.push(`Load balancer IP: ${target.cdnIp}`);
    if (target.bucketName) lines.push(`Origin bucket:    ${target.bucketName} (public)`);
  } else {
    lines.push(`Distribution: ${target.distributionId}`);
    lines.push(`CDN hostname:  ${target.distributionDomain}`);
    if (target.websiteBucket) lines.push(`Origin bucket: ${target.websiteBucket} (private, OAC)`);
  }
  lines.push("");

  const domains = await listDomains({ tenantId, projectId });
  if (domains.length === 0) {
    lines.push(
      target.kind === "gcp-static"
        ? "No custom domains configured — the site is served on the load balancer IP above."
        : "No custom domains configured — the site is served on the CDN hostname above.",
    );
    return { generatedConfig: lines.join("\n") };
  }

  lines.push("Custom domains:");
  for (const d of domains) {
    const host = normalizeHost(d.name);
    const found = await findStaticCertRow(projectId, host);
    if (!found.ok) {
      // Surface the failure rather than rendering a misleading `pending`:
      // "pending" reads as "working on it", which is how the incident's
      // schema-drift failure stayed invisible for so long.
      lines.push(`  ${host} → ${routeTarget}   [unknown]`);
      lines.push(`      ${found.failure.message}`);
      continue;
    }
    const cert = found.row;
    const state = cert?.verificationState ?? "pending";
    lines.push(`  ${host} → ${routeTarget}   [${state}]`);
    if (cert?.verificationMessage) lines.push(`      ${cert.verificationMessage}`);
  }

  return { generatedConfig: lines.join("\n") };
}

export interface DomainDnsInstructions {
  domainName: string;
  records: Array<{ name: string; type: string; value: string; purpose: string }>;
  note: string;
}

/**
 * The DNS records a user must publish for one domain.
 *
 * Served fresh rather than stored: a distribution can be recreated, and a
 * stale instruction is exactly the kind of silently-wrong guidance this work
 * exists to remove.
 */
export async function getDomainDnsInstructionsStatic(params: {
  projectId: string;
  domainName: string;
  deployment: ActiveDeployment;
}): Promise<DomainDnsInstructions | { error: string }> {
  const { projectId, domainName, deployment } = params;

  const resolution = await resolveStaticTarget({ projectId, deployment });
  if (!resolution.target) {
    return { error: resolution.errorMessage || "Could not resolve the CDN for this static site." };
  }

  const host = normalizeHost(domainName);
  const target = resolution.target;

  if (target.kind === "gcp-static") {
    const { records, note } = gcpDnsInstructions({ target, domainName: host });
    return { domainName: host, records, note };
  }

  const found = await findStaticCertRow(projectId, host);
  if (!found.ok) {
    // Without the row there is no validation record to show, and inventing an
    // instruction set that omits it would send the user to publish half of
    // what they need.
    return { error: found.failure.message };
  }

  const { records, note } = awsDnsInstructions({
    target,
    domainName: host,
    validationRecord: found.row?.validationRecord ?? null,
  });

  return { domainName: host, records, note };
}

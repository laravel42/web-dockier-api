/**
 * GCP static-hosting custom domains: Google-managed certificates + HTTPS LB.
 *
 * Shape of the flow, which is asynchronous and ordered differently from AWS:
 *
 *   1. apply  → create the managed certificate, the HTTPS proxy and the :443
 *               forwarding rule on the EXISTING global IP. Return immediately.
 *   2. user   → publishes an A record pointing at that IP.
 *   3. poll   → the certificate stays PROVISIONING until Google can reach the
 *               load balancer over HTTP at the domain, so the A record must be
 *               live BEFORE it can go ACTIVE. Typically 15-60 minutes.
 *
 * That ordering is the opposite of ACM, where validation is a DNS record the
 * user publishes and the CDN is touched last. Here the front end must exist
 * first, because the certificate validates against it.
 *
 * ONE certificate covering every domain, named from a hash of the domain set:
 * Google-managed certificates are immutable in their domain list, so a changed
 * set produces a new name, a new certificate, and a swap on the proxy.
 *
 * Apex domains work normally — the load balancer owns a dedicated global
 * anycast IP, so a plain A record is valid at a zone root.
 */

import {
  deleteManagedCertificate,
  ensureHttpsForwardingRule,
  ensureHttpsProxy,
  ensureManagedCertificate,
  listGlobalResourceNames,
  setProxySslCertificates,
  type ManagedCertificateState,
} from "../../../deploy/domain/infra/gcp-static-lb.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { nowIso } from "../../../../shared/utils/time.js";
import { normalizeHost } from "./apex.js";
import {
  deleteStaticCertRows,
  ensureStaticCertRow,
  listStaticCertRows,
  setCertState,
  type StaticCertRow,
} from "./certs.js";
import type { GcpStaticTarget } from "./target.js";

/**
 * Google-managed certificates support up to 100 domains, but each reconcile
 * must stay well inside the Compute API's name-length limits, so the practical
 * cap here is the certificate's own.
 */
const MAX_DOMAINS_PER_CERTIFICATE = 100;

export interface StaticApplyOutcome {
  success: boolean;
  retryable?: boolean;
  message: string;
  anyLive?: boolean;
}

/** Sorted, normalized, de-duplicated — the canonical form of a domain set. */
function canonicalDomains(names: string[]): string[] {
  return [...new Set(names.map(normalizeHost).filter(Boolean))].sort();
}

/**
 * A deterministic, GCP-legal certificate name derived from the domain set.
 *
 * Compute resource names must be lowercase alphanumeric or hyphens, start with
 * a letter and be at most 63 characters. Including a hash of the domain set
 * means a changed set yields a different name, which is exactly what the
 * immutable-domain-list constraint requires.
 */
export function certificateNameFor(appNamePrefix: string, domains: string[]): string {
  const canonical = canonicalDomains(domains).join(",");
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = (hash * 31 + canonical.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36).slice(0, 8);
  // Leave room for "-cert-" + suffix within 63 chars.
  const head = appNamePrefix.slice(0, 63 - 6 - suffix.length).replace(/-+$/, "");
  return `${head}-cert-${suffix}`;
}

/**
 * Reconcile a project's domains onto its GCP HTTPS load balancer.
 *
 * Never throws: returns an outcome the caller reports verbatim.
 */
export async function reconcileGcpStaticDomains(params: {
  tenantId: string;
  projectId: string;
  target: GcpStaticTarget;
  domains: Array<{ id: string; name: string }>;
}): Promise<StaticApplyOutcome> {
  const { tenantId, projectId, target, domains } = params;

  try {
    const wanted = canonicalDomains(domains.map((d) => d.name));

    // ── Drop certificate rows for domains no longer configured ──
    //
    // A failed read is not an empty table: deriving "orphaned" from `[]` would
    // delete every certificate row this project has. Skip the sweep instead.
    const existingRows = await listStaticCertRows(projectId);
    if (!existingRows.ok) {
      logger.warn(
        { projectId, kind: existingRows.failure.kind },
        "[domains:static:gcp] skipping orphan cleanup — certificate rows could not be read",
      );
    } else {
      const configured = new Set(wanted);
      const orphaned = existingRows.rows.filter((r) => !configured.has(normalizeHost(r.domainName)));
      if (orphaned.length > 0) {
        await deleteStaticCertRows(projectId, orphaned.map((r) => r.domainName));
      }
    }

    if (wanted.length === 0) {
      // Detach by clearing the proxy's certificates is not possible — a proxy
      // requires at least one. Remove the HTTPS front end instead.
      await teardownHttpsFrontEnd(target);
      return {
        success: true,
        message: "No custom domains configured. The site is served on its load balancer IP.",
      };
    }

    if (wanted.length > MAX_DOMAINS_PER_CERTIFICATE) {
      return {
        success: false,
        retryable: false,
        message:
          `A Google-managed certificate covers at most ${MAX_DOMAINS_PER_CERTIFICATE} domains, ` +
          `and this project has ${wanted.length}. Remove some domains and try again.`,
      };
    }

    // ── Ensure a row per domain ──
    const rows = new Map<string, StaticCertRow>();
    for (const d of domains) {
      const name = normalizeHost(d.name);
      if (!name) continue;
      const ensured = await ensureStaticCertRow({
        tenantId,
        projectId,
        domainName: name,
        domainId: d.id,
        type: "gcp_managed",
      });
      if (!ensured.ok) {
        // No row exists to carry the message, so it travels in the apply
        // response and `GET /readyz` is the operator surface.
        return {
          success: false,
          retryable: ensured.failure.retryable,
          message: ensured.failure.message,
        };
      }
      rows.set(name, ensured.row);
    }

    // ── The certificate ──
    const certName = certificateNameFor(target.appName, wanted);
    const cert = await ensureManagedCertificate(target.client, certName, wanted);

    // ── The HTTPS front end, on the EXISTING url map and global IP ──
    const proxyName = `${target.appName}-https-proxy`.slice(0, 63);
    const proxy = await ensureHttpsProxy(target.client, {
      name: proxyName,
      urlMapSelfLink: target.urlMapSelfLink,
      certificateSelfLinks: [cert.selfLink],
    });

    // The proxy may predate this certificate (a changed domain set). Swap it.
    if (cert.selfLink && !proxy.sslCertificates.includes(cert.selfLink)) {
      await setProxySslCertificates(target.client, proxyName, [cert.selfLink]);
      // Delete superseded certificates only after the swap — GCP refuses to
      // remove a certificate a proxy still references.
      await deleteSupersededCertificates(target, certName);
    }

    await ensureHttpsForwardingRule(target.client, {
      name: `${target.appName}-fwd-https`.slice(0, 63),
      proxySelfLink: proxy.selfLink,
      ipAddress: target.cdnIp,
    });

    // ── Report per-domain state ──
    return await recordCertificateState({ target, cert, rows, wanted });
  } catch (err) {
    const msg = getErrMsg(err);
    logger.error({ err: msg, projectId }, "[domains:static:gcp] reconcile failed");
    return { success: false, retryable: true, message: `Could not apply domains: ${msg}` };
  }
}

/** Translate the certificate's provisioning state into per-domain rows. */
async function recordCertificateState(params: {
  target: GcpStaticTarget;
  cert: ManagedCertificateState;
  rows: Map<string, StaticCertRow>;
  wanted: string[];
}): Promise<StaticApplyOutcome> {
  const { target, cert, rows, wanted } = params;

  const active = cert.status === "ACTIVE";
  let awaitingDns = 0;
  let failed = 0;

  for (const [name, row] of rows) {
    const domainState = cert.domainStatus[name] || cert.status;

    // FAILED_NOT_VISIBLE means Google cannot reach the load balancer at this
    // domain — almost always a missing or wrong A record, which is the user's
    // next action rather than an error on our side.
    const notVisible = domainState === "FAILED_NOT_VISIBLE";
    const domainActive = domainState === "ACTIVE";
    const hardFailure = domainState.startsWith("FAILED_") && !notVisible;

    if (notVisible) awaitingDns++;
    if (hardFailure) failed++;

    await setCertState(row.id, {
      providerRef: cert.selfLink || null,
      // Google validates against the A record itself; there is no extra record
      // to publish, so validation_record stays null for this provider.
      validationRecord: null,
      status: domainActive ? "active" : hardFailure ? "failed" : "pending",
      verificationState: domainActive
        ? "live"
        : hardFailure
          ? "failed"
          : notVisible
            ? "awaiting_dns"
            : "provisioning",
      verificationMessage: domainActive
        ? null
        : notVisible
          ? `Point an A record for ${name} at ${target.cdnIp}. Google issues the certificate once it can reach the site at this domain, usually within an hour of the record going live.`
          : hardFailure
            ? `Certificate provisioning failed for ${name} (${domainState}). Check that the domain's CAA records permit Google to issue certificates.`
            : `Waiting for Google to issue the certificate for ${name}. This usually takes 15-60 minutes after the A record is live.`,
      // WRITE-ONCE, was unconditional. Re-stamping on every active reconcile
      // would make any `issued_at`-based budget unreachable.
      issuedAt: domainActive && !row.issuedAt ? nowIso() : undefined,
      // `attachStartedAt: nowIso()` was here, UNCONDITIONALLY, on every row
      // write. Harmless when a user click was the only trigger; fatal under a
      // repeating sweep, because a clock re-stamped on every look never ages
      // and GCP's 24-hour and 72-hour deadlines would never fire. The
      // phase-clock invariant in setCertState now stamps it only on a genuine
      // phase change.
    }, row.verificationState);
  }

  if (active) {
    return {
      success: true,
      anyLive: true,
      message: `${wanted.length} domain(s) are serving over HTTPS on ${target.cdnIp}.`,
    };
  }

  if (failed > 0) {
    return {
      success: false,
      retryable: false,
      message: `Certificate provisioning failed for ${failed} domain(s). See the per-domain detail in the Domains tab.`,
    };
  }

  return {
    success: true,
    message:
      awaitingDns > 0
        ? `HTTPS front end ready. Point an A record for each domain at ${target.cdnIp} — Google issues the certificate once it can reach the site, usually within an hour.`
        : `Certificate requested for ${wanted.length} domain(s). Point an A record at ${target.cdnIp} if you have not already; HTTPS goes live automatically, usually within an hour.`,
  };
}

/** Remove certificates for superseded domain sets, after the proxy swap. */
async function deleteSupersededCertificates(
  target: GcpStaticTarget,
  keepName: string,
): Promise<void> {
  const names = await listGlobalResourceNames(
    target.client,
    "sslCertificates",
    `${target.appName}-cert-`,
  );
  for (const name of names) {
    if (name === keepName) continue;
    await deleteManagedCertificate(target.client, name);
  }
}

/** Remove the HTTPS front end when the last domain is deleted. */
async function teardownHttpsFrontEnd(target: GcpStaticTarget): Promise<void> {
  const { teardownGcpStaticHttps } = await import(
    "../../../deploy/domain/infra/gcp-static-lb.js"
  );
  const { errors } = await teardownGcpStaticHttps(target.client, { appNamePrefix: target.appName });
  if (errors.length > 0) {
    logger.warn(
      { errors, projectId: target.projectId },
      "[domains:static:gcp] partial HTTPS teardown",
    );
  }
}

/** The DNS records a user must publish for a GCP static domain. */
export function gcpDnsInstructions(params: {
  target: GcpStaticTarget;
  domainName: string;
}): {
  records: Array<{ name: string; type: string; value: string; purpose: string }>;
  note: string;
} {
  const { target, domainName } = params;
  return {
    records: [
      {
        name: domainName,
        type: "A",
        value: target.cdnIp,
        purpose:
          "Routes visitors to the load balancer, and is also how Google validates the certificate.",
      },
    ],
    note:
      "This single record is all that is needed — it works at a domain root as well as a subdomain. " +
      "The certificate is issued only after the record is live and visible to Google, usually within " +
      "15-60 minutes.",
  };
}


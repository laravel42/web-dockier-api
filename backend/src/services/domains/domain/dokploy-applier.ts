/**
 * Domains Applier — Dokploy strategy
 *
 * Registers the project's user custom domains on its Dokploy application and
 * requests Let's Encrypt certificates via Traefik, by reconciling Dokploy's
 * per-app domains to match our `domains` table:
 *   - user domain in DB, not on the app   → domain.create (letsencrypt, https)
 *   - user domain on the app, not in DB    → domain.delete
 *   - the auto-generated *.sslip.io domain → left untouched (it's how the app
 *     stays reachable without DNS; Dokploy created it with certificateType none)
 *
 * Dokploy/Traefik issues the Let's Encrypt certificate ASYNCHRONOUSLY once DNS
 * points at the server; there's no synchronous success signal like certbot's
 * exit code. So for a registered letsencrypt domain we optimistically mark the
 * matching ssl_certificates row `active`. (A future enhancement could poll
 * Traefik's cert store; for now "registered with letsencrypt" == active.)
 *
 * This is the Dokploy counterpart to the nginx/certbot applier (applier.ts).
 * The legacy AWS/nginx path is unchanged. Selected by applyDomainConfig() when
 * the project is a Dokploy deployment.
 */

import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { nowIso } from "../../../shared/utils/time.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDokployClient } from "../../deploy/domain/dokploy/client.js";
import { getApplication } from "../../deploy/domain/dokploy/mappings.js";
import type { DokployDomain } from "../../deploy/domain/dokploy/types.js";
import { listDomains } from "./domains.js";

// Declared once in ./mappers.js. This module's own copy had drifted — it was
// missing `retryable`, which compiled silently because the field is optional.
import type { ApplyDomainsResult } from "./mappers.js";
export type { ApplyDomainsResult } from "./mappers.js";

/** Whether a project is deployed via Dokploy (has an application mapping). */
export async function isDokployProject(projectId: string): Promise<boolean> {
  try {
    const app = await getApplication(projectId);
    return Boolean(app?.dokployApplicationId);
  } catch {
    return false;
  }
}

/**
 * The container port Traefik should forward a domain to.
 *
 * Prefers the port RESOLVED AND STORED at deploy time, where both the builder
 * and the app's runtime were known. Re-deriving it here from `buildType` alone
 * is not possible correctly: railpack serves Node apps on 3000 but PHP/static on
 * 80, and a PHP app that fell back to nixpacks also serves on 80. Getting it
 * wrong registers the domain on a port nothing listens on — Let's Encrypt
 * succeeds, the UI shows a healthy certificate, and the domain returns Bad
 * Gateway.
 *
 * The fallback only applies to applications deployed before the port was
 * persisted; their next deploy fills it in.
 */
/** Build types whose container serves HTTP on port 80 rather than 3000. */
const PORT_80_BUILD_TYPES = new Set(["railpack", "static"]);

function resolveDomainPort(mapping: { containerPort: number | null; buildType: string }): number {
  if (mapping.containerPort && mapping.containerPort > 0) return mapping.containerPort;
  // Legacy rows: keep the historical guess rather than inventing a new one.
  // `static` is included because Dokploy serves a static app from nginx on 80 —
  // a stored `build_type = "static"` row with no persisted port would otherwise
  // be guessed as 3000 and return Bad Gateway behind a valid certificate.
  return PORT_80_BUILD_TYPES.has(mapping.buildType) ? 80 : 3000;
}

/**
 * True for the auto-generated free domain Dokploy assigns for reachability.
 * We must never delete it during reconcile — it's not a user domain.
 */
function isAutoDomain(d: DokployDomain): boolean {
  const host = (d.host || "").toLowerCase();
  return host.endsWith(".sslip.io") || host.endsWith(".traefik.me");
}

/** Normalize a hostname for comparison (lowercase, strip trailing dot). */
function normHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Reconcile the Dokploy app's domains to match the project's `domains` table,
 * requesting Let's Encrypt for each user domain. Never throws — returns an
 * ApplyDomainsResult (same shape as the nginx applier).
 */
export async function applyDomainConfigDokploy(params: {
  tenantId: string;
  projectId: string;
}): Promise<ApplyDomainsResult> {
  const { tenantId, projectId } = params;

  try {
    const mapping = await getApplication(projectId);
    if (!mapping?.dokployApplicationId) {
      return { success: true, message: "No Dokploy application yet. Domains will be applied on next deployment." };
    }
    const applicationId = mapping.dokployApplicationId;
    const port = resolveDomainPort(mapping);

    const dbDomains = await listDomains({ tenantId, projectId });
    const client = createDokployClient();
    const existing = await client.listDomains(applicationId);

    const desiredHosts = new Set(dbDomains.map((d) => normHost(d.name)));
    const existingByHost = new Map(existing.map((d) => [normHost(d.host), d]));

    // 1. Register user domains present in the DB but not on the app.
    //
    // A failure here is collected rather than swallowed. Reporting success for a
    // domain Dokploy rejected is worse than the failure itself: the deploy log
    // said "Applied 1 custom domain" while the domain was not registered, so the
    // only trace was a logger.warn nobody reads, and the domain silently 404s.
    let created = 0;
    const failures: Array<{ host: string; message: string }> = [];
    // Hosts that are actually on the app after this pass — used below so a
    // failed registration does not get its certificate marked active.
    const liveHosts = new Set<string>();
    for (const d of dbDomains) {
      const host = normHost(d.name);
      if (existingByHost.has(host)) {
        liveHosts.add(host); // already registered
        continue;
      }
      try {
        await client.createDomain({
          host: d.name,
          applicationId,
          port,
          https: true,
          domainType: "application",
          certificateType: "letsencrypt",
        });
        created++;
        liveHosts.add(host);
      } catch (e) {
        const message = getErrMsg(e);
        failures.push({ host: d.name, message });
        logger.warn({ err: message, host: d.name, projectId }, "[domains:dokploy] failed to register domain");
      }
    }

    // 2. Remove app domains that are user domains no longer in the DB. The
    //    auto sslip.io/traefik.me domain is preserved regardless.
    let removed = 0;
    for (const d of existing) {
      if (isAutoDomain(d)) continue;
      if (desiredHosts.has(normHost(d.host))) continue;
      if (!d.domainId) continue;
      try {
        await client.deleteDomain(d.domainId);
        removed++;
      } catch (e) {
        logger.warn({ err: getErrMsg(e), host: d.host, projectId }, "[domains:dokploy] failed to remove domain");
      }
    }

    // 3. Mark Let's Encrypt certificates for domains actually on the app as
    //    active. Traefik issues them asynchronously once DNS resolves; we
    //    reflect the "requested/registered" state as active so the UI isn't
    //    stuck pending. Domains that failed to register are excluded — marking
    //    those active would claim a certificate for a domain Traefik never saw.
    await markLetsEncryptActive(tenantId, projectId, liveHosts);

    logger.info({ projectId, applicationId, created, removed, failed: failures.length }, "[domains:dokploy] reconciled domains");

    const domainWord = dbDomains.length === 1 ? "domain" : "domains";

    if (failures.length > 0) {
      const detail = failures.map((f) => `${f.host} (${f.message})`).join("; ");
      return {
        success: false,
        message:
          `Failed to register ${failures.length} of ${dbDomains.length} custom ${domainWord} on the deployed application: ${detail}.` +
          (created > 0 ? ` ${created} registered successfully.` : ""),
      };
    }

    if (dbDomains.length === 0) {
      return { success: true, message: "No custom domains configured for this project." };
    }

    return {
      success: true,
      message:
        `Applied ${dbDomains.length} custom ${domainWord} to the deployed application ` +
        `(${created} newly registered, ${dbDomains.length - created} already present; ` +
        `Let's Encrypt requested — certificates issue once DNS points at the server).`,
    };
  } catch (err) {
    const msg = getErrMsg(err);
    logger.error({ err: msg, projectId }, "[domains:dokploy] error applying domains");
    return { success: false, message: `Error applying domains: ${msg}` };
  }
}

/**
 * Optimistically mark lets_encrypt certificates for the given hosts `active`.
 * Dokploy/Traefik owns actual issuance; this reflects that we requested it, so
 * the certificate list doesn't sit on "pending" forever on the Dokploy path.
 */
async function markLetsEncryptActive(tenantId: string, projectId: string, hosts: Set<string>): Promise<void> {
  if (hosts.size === 0) return;
  try {
    const { data } = await supabaseAdmin
      .from("ssl_certificates")
      .select("id, domain_name, type, status")
      .eq("organization_id", tenantId)
      .eq("project_id", projectId);

    for (const row of data ?? []) {
      if (row.type !== "lets_encrypt") continue;
      if (!hosts.has(normHost(row.domain_name as string))) continue;
      if (row.status === "active") continue;
      const issuedAt = nowIso();
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 90); // LE certs last 90 days
      await supabaseAdmin
        .from("ssl_certificates")
        .update({ status: "active", issued_at: issuedAt, expires_at: expiry.toISOString(), updated_at: issuedAt })
        .eq("id", row.id as string);
    }
  } catch (e) {
    // Non-fatal — cert status is cosmetic on the Dokploy path.
    logger.warn({ err: getErrMsg(e), projectId }, "[domains:dokploy] failed to update certificate status");
  }
}

/**
 * Render a read-only description of the routing Dokploy/Traefik actually serves
 * for this project's domains.
 *
 * The shared `previewDomainConfig` used to fall through to the nginx generator
 * for every project, so a Dokploy user opening "View proxy configuration" was
 * shown an nginx `proxy_pass http://127.0.0.1:8080` block that exists nowhere —
 * wrong server, wrong port, wrong mechanism. There is no nginx on this path:
 * Traefik routes by host and terminates TLS itself.
 *
 * Reports Dokploy's live domain list when it can be read, and falls back to the
 * desired state from our own tables when it can't, so the modal still renders
 * something truthful if Dokploy is unreachable. Returns text because the caller's
 * contract is `{ generatedConfig: string }` and the modal displays it verbatim.
 */
export async function previewDomainConfigDokploy(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ generatedConfig: string }> {
  const { tenantId, projectId } = params;

  const lines: string[] = [
    "# Routing is managed by Dokploy and served by Traefik.",
    "# There is no nginx config for this project — Traefik routes by Host header",
    "# and terminates TLS, forwarding plain HTTP to the container port below.",
    "#",
    "# This view is read-only. Edit domains from the Domains tab.",
    "",
  ];

  const mapping = await getApplication(projectId);
  if (!mapping?.dokployApplicationId) {
    lines.push("No Dokploy application yet — domains are applied on the next deployment.");
    return { generatedConfig: lines.join("\n") };
  }

  const port = resolveDomainPort(mapping);
  lines.push(`Application: ${mapping.dokployApplicationId}`);
  lines.push(`Container port: ${port}${mapping.containerPort ? "" : " (inferred — redeploy to persist)"}`);
  lines.push("");

  try {
    const client = createDokployClient();
    const existing = await client.listDomains(mapping.dokployApplicationId);

    if (existing.length === 0) {
      lines.push("No domains registered on the application.");
      return { generatedConfig: lines.join("\n") };
    }

    lines.push("Registered domains (live from Dokploy):");
    for (const d of existing) {
      const scheme = d.https ? "https" : "http";
      const cert = d.certificateType && d.certificateType !== "none" ? d.certificateType : "none";
      const auto = isAutoDomain(d) ? "  [auto-assigned, not editable]" : "";
      lines.push(`  ${scheme}://${d.host} → :${d.port ?? port}   cert: ${cert}${auto}`);
    }
  } catch (e) {
    // Preview must never fail the request — fall back to desired state.
    logger.warn({ err: getErrMsg(e), projectId }, "[domains:dokploy] could not read live domains for preview");
    const dbDomains = await listDomains({ tenantId, projectId });

    lines.push("Could not reach Dokploy — showing desired state from Dockier:");
    if (dbDomains.length === 0) {
      lines.push("  (no domains configured)");
    }
    for (const d of dbDomains) {
      lines.push(`  https://${d.name} → :${port}   cert: letsencrypt`);
    }
  }

  return { generatedConfig: lines.join("\n") };
}

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

export interface ApplyDomainsResult {
  success: boolean;
  message: string;
  generatedConfig?: string;
}

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
 * The container port Traefik should forward a domain to, by build type — must
 * match the port the app listens on (railpack PHP/static serve on 80; other
 * builders default to 3000). Mirrors trigger-deploy's containerPortForBuildType.
 */
function containerPortForBuildType(buildType: string | undefined): number {
  return buildType === "railpack" ? 80 : 3000;
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
    const port = containerPortForBuildType(mapping.buildType);

    const dbDomains = await listDomains({ tenantId, projectId });
    const client = createDokployClient();
    const existing = await client.listDomains(applicationId);

    const desiredHosts = new Set(dbDomains.map((d) => normHost(d.name)));
    const existingByHost = new Map(existing.map((d) => [normHost(d.host), d]));

    // 1. Register user domains present in the DB but not on the app.
    let created = 0;
    for (const d of dbDomains) {
      const host = normHost(d.name);
      if (existingByHost.has(host)) continue; // already registered
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
      } catch (e) {
        logger.warn({ err: getErrMsg(e), host: d.name, projectId }, "[domains:dokploy] failed to register domain");
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

    // 3. Mark Let's Encrypt certificates for still-present domains as active.
    //    Traefik issues them asynchronously once DNS resolves; we reflect the
    //    "requested/registered" state as active so the UI isn't stuck pending.
    await markLetsEncryptActive(tenantId, projectId, desiredHosts);

    logger.info({ projectId, applicationId, created, removed }, "[domains:dokploy] reconciled domains");

    const domainWord = dbDomains.length === 1 ? "domain" : "domains";
    return {
      success: true,
      message: `Applied ${dbDomains.length} custom ${domainWord} to the deployed application (Let's Encrypt requested; certificates issue once DNS points at the server).`,
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

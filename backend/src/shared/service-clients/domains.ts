/**
 * Domains Service Client
 *
 * Thin cross-service accessor for domain and certificate data, used by the
 * deploy service so a redeploy can reproduce the custom-domain configuration
 * already attached to a project's CDN.
 *
 * Without this, `AwsS3Adapter` would pass empty domain parameters on every
 * deploy and CloudFormation would strip the aliases and certificate off the
 * distribution — taking a working custom domain offline on an unrelated push.
 */

import { supabaseAdmin } from "../supabase/client.js";
import { logger } from "../logger.js";

/** Lowercased, de-duplicated, sorted domain names configured for a project. */
export async function listProjectDomainNames(projectId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("domains")
    .select("name")
    .eq("project_id", projectId);

  if (error) {
    logger.warn({ err: error, projectId }, "[service-clients] Failed to list project domains");
    return [];
  }

  const names = (data ?? [])
    .map((r) => (r.name || "").trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);

  return [...new Set(names)].sort();
}

/**
 * The ACM certificate ARN currently serving a project's static domains.
 *
 * Returns null unless there is a single issued certificate shared by every
 * configured domain. A partial match is deliberately treated as "no
 * certificate": attaching aliases that the certificate does not cover makes
 * CloudFront reject the whole stack update, which would fail the deploy rather
 * than just the domain.
 */
export async function findIssuedAcmArnForDomains(
  projectId: string,
  domainNames: string[],
): Promise<string | null> {
  if (domainNames.length === 0) return null;

  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .select("domain_name, provider_ref, status")
    .eq("project_id", projectId)
    .eq("type", "acm");

  if (error) {
    logger.warn({ err: error, projectId }, "[service-clients] Failed to read static certificates");
    return null;
  }

  const rows = data ?? [];
  const byDomain = new Map(
    rows.map((r) => [(r.domain_name || "").trim().toLowerCase(), r]),
  );

  const arns = new Set<string>();
  for (const name of domainNames) {
    const row = byDomain.get(name);
    if (!row || !row.provider_ref || row.status !== "active") return null;
    arns.add(row.provider_ref);
  }

  // Exactly one certificate must cover them all — a CloudFront distribution
  // has a single ViewerCertificate.
  return arns.size === 1 ? [...arns][0] : null;
}

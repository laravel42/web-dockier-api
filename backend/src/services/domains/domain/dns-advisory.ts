/**
 * A heads-up when the domain being added already points somewhere.
 *
 * Purely advisory: it never blocks an add, and any failure to look it up is
 * silent. A warning that stops you adding a domain would be worse than no
 * warning at all, because DNS is exactly the thing we cannot see reliably from
 * here.
 */

import { promises as dns } from "node:dns";

import { logger } from "../../../shared/logger.js";

/** Per-query budget. One try: a retry would double the worst case for nothing. */
const RESOLVER_TIMEOUT_MS = 1200;
/** Hard ceiling on the whole lookup, so an HTTP request cannot be held open. */
const TOTAL_BUDGET_MS = 1500;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

/** DNS answers that mean "nothing published", which is the happy path here. */
function isNotFound(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
}

async function lookup(host: string): Promise<{ cname: string[]; a: string[] } | null> {
  const resolver = new dns.Resolver({ timeout: RESOLVER_TIMEOUT_MS, tries: 1 });

  try {
    const cname = await resolver.resolveCname(host);
    if (cname.length > 0) return { cname: cname.map(normalize), a: [] };
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  try {
    const a = await resolver.resolve4(host);
    return { cname: [], a: a.map(normalize) };
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  return null;
}

/**
 * Warn when `host` already resolves somewhere other than this project's CDN.
 *
 * Returns `undefined` — no advisory — when:
 *   - nothing is published (NXDOMAIN / ENODATA),
 *   - the answer ALREADY points at this project's CDN,
 *   - or the lookup failed or timed out.
 *
 * The second case matters more than it looks: publishing the routing record
 * before adding the domain is a perfectly sensible order, and telling that user
 * their correct record "will be replaced" is a false alarm.
 *
 * `routeTarget` unknown means any answer produces an advisory, since we cannot
 * tell a correct record from a stale one.
 */
export async function existingRecordAdvisory(
  host: string,
  routeTarget: string | null,
): Promise<string | undefined> {
  const name = normalize(host);

  let answer: Awaited<ReturnType<typeof lookup>>;
  try {
    answer = await Promise.race([
      lookup(name),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TOTAL_BUDGET_MS)),
    ]);
  } catch (err) {
    logger.warn({ err, host: name }, "[domains] existing-record lookup failed");
    return undefined;
  }

  if (!answer) return undefined;

  const target = routeTarget ? normalize(routeTarget) : null;

  if (answer.cname.length > 0) {
    if (target && answer.cname.includes(target)) return undefined;
    return (
      `"${name}" currently points at ${answer.cname[0]} with a CNAME record. ` +
      "You will need to change that record for this site to be served."
    );
  }

  if (answer.a.length > 0) {
    if (target && answer.a.includes(target)) return undefined;
    // Known imprecision: an ALIAS-flattened apex on AWS answers with rotating
    // CloudFront edge IPs, which will never equal `distributionDomain`. The
    // wording stays true in that case — the records do need checking — it just
    // is not news to that user.
    return (
      `"${name}" currently resolves to ${answer.a[0]}. ` +
      "Check that this is a record you want to replace before pointing it at this site."
    );
  }

  return undefined;
}

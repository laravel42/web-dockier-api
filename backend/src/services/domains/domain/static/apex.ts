/**
 * Apex (zone-root) domain detection.
 *
 * Why this matters: CloudFront is reachable only by CNAME, and RFC 1034 forbids
 * a CNAME at a zone apex. So `example.com` cannot point at a distribution
 * without a provider-specific ALIAS/ANAME record, which Dockier does not manage.
 * We must detect the case up front and tell the user plainly, instead of
 * attaching the alias and letting their DNS silently never resolve.
 *
 * GCP does not have this problem — its load balancer owns a dedicated global
 * anycast IP, so an apex A record works normally.
 */

/**
 * Public suffixes that are themselves two labels, where a registrable domain is
 * therefore three labels (`example.co.uk`, not `co.uk`).
 *
 * Deliberately a short, explicit list rather than a bundled Public Suffix List:
 * the full PSL is thousands of entries that change over time, and the cost of
 * being wrong here is bounded — a false "this is an apex" refusal names the
 * exact reason, and a false negative produces the DNS instruction the user
 * would have got anyway. If this grows past a handful more entries, replace it
 * with a real PSL dependency rather than extending it indefinitely.
 */
const TWO_LABEL_PUBLIC_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "gov.uk", "ac.uk", "net.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
  "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
  "com.br", "net.br", "org.br", "gov.br",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "co.za", "org.za", "net.za", "gov.za",
  "com.mx", "com.ar", "com.co", "com.tr", "com.sg", "com.hk", "com.tw",
  "co.in", "net.in", "org.in", "gen.in", "firm.in",
  "co.kr", "or.kr",
  "com.cn", "net.cn", "org.cn", "gov.cn",
  "co.il", "org.il", "net.il",
]);

/** Normalize a hostname for comparison: lowercase, no trailing dot. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Sorted, normalized, de-duplicated — the canonical form of a domain set. */
export function canonicalDomains(names: string[]): string[] {
  return [...new Set(names.map(normalizeHost).filter(Boolean))].sort();
}

/**
 * A small deterministic string hash in base-36.
 *
 * Used to derive persisted identifiers (an ACM idempotency token, a GCP
 * certificate name), so its output MUST stay stable — a changed value orphans
 * a live resource. The callers wrap and truncate it differently; this is only
 * the shared core: `(hash * 31 + charCode) | 0`, then `Math.abs(...).toString(36)`.
 */
export function stableHash36(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * True when `host` is the root of its registrable zone — i.e. it has no
 * subdomain label and therefore cannot carry a CNAME.
 *
 * `example.com` → true
 * `www.example.com` → false
 * `example.co.uk` → true  (two-label public suffix)
 * `www.example.co.uk` → false
 * `*.example.com` → false (a wildcard is not the apex itself)
 */
export function isApexDomain(host: string): boolean {
  const name = normalizeHost(host);
  if (!name || name.startsWith("*.")) return false;

  const labels = name.split(".");
  if (labels.length < 2) return false;

  const lastTwo = labels.slice(-2).join(".");
  if (TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
    // Registrable domain is three labels; apex iff that is all there is.
    return labels.length === 3;
  }

  return labels.length === 2;
}

/**
 * Where an apex refusal is being shown.
 *
 * `add-form` is the interactive path, which can offer the acknowledgement
 * checkbox. `persisted` covers a message written onto a certificate row or
 * returned in an apply response, where there is no checkbox to point at.
 */
export type ApexRefusalSurface = "add-form" | "persisted";

/**
 * The message shown when an apex domain is rejected on AWS.
 *
 * Names the specific limitation and all four real ways out, because
 * "unsupported" alone leaves the user with no next step — and because a blanket
 * "apex is unsupported" would be false: flattening, Route 53 Alias and the GCP
 * target all work.
 */
export function apexRefusalMessage(host: string, surface: ApexRefusalSurface): string {
  const name = normalizeHost(host);
  const suggestion = `www.${name}`;

  // The explanation is shared so the two surfaces cannot drift apart. Only the
  // closing instruction differs, because only one of them has a checkbox.
  const explanation =
    `"${name}" is the root of its domain, and CloudFront can only be reached by a CNAME record, ` +
    `which DNS does not permit at a domain root — your DNS provider will reject it. ` +
    `There are four ways forward: use a subdomain such as "${suggestion}"; use an ALIAS, ANAME ` +
    `or CNAME-flattening record at the root if your DNS provider supports one (Cloudflare and ` +
    `DNSimple do, among others); use a Route 53 A record with Alias enabled; or host this site ` +
    `on the GCP static target, where a root domain works normally because the load balancer has ` +
    `its own dedicated IP.`;

  const closing =
    surface === "add-form"
      ? ` If your DNS provider supports ALIAS, ANAME or CNAME flattening, tick the box below and add "${name}" again.`
      : ` Remove this domain and add it again to choose one of these.`;

  return explanation + closing;
}

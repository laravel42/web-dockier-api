/**
 * Does a domain's DNS actually route to the CDN?
 *
 * Its own module rather than living in `index.ts`, because BOTH `index.ts` (the
 * verify endpoint) and `aws.ts` (the reconcile, which gates `live` on the
 * result) need it, and `index.ts` already imports `aws.ts` — putting it in
 * `index.ts` would make that a cycle.
 *
 * Pure `node:dns`. No AWS call anywhere in here, which is why the reconcile can
 * use it without a target resolution.
 */

import { promises as dns } from "node:dns";

import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { isApexDomain, normalizeHost } from "./apex.js";

export type RoutingOutcome = "verified" | "inconclusive" | "missing" | "mismatched";

export interface RoutingCheck {
  outcome: RoutingOutcome;
  /** Present on every variant, because the frontend reads it unconditionally. */
  serverIp: string;
  resolved?: string;
  message: string;
  /** Set only when the lookup itself failed for a non-NXDOMAIN reason. */
  error?: string;
}

/**
 * The routing-record guidance, in ONE place.
 *
 * There are two negative branches below — an empty CNAME answer, and an
 * `ENODATA`/`ENOTFOUND` after the flattening fallback misses — and before this
 * helper existed both told the user to "add a CNAME", with no awareness that
 * the host might be a zone root where DNS forbids one. That is the exact
 * message that sent a real user to their registrar and got back
 * `La zona DNS tiene un formato incorrecto [CNAME Err 1]`. Fixing only the
 * branch that was reported would have left the other producing the same
 * broken advice.
 */
export function missingRoutingRecordMessage(
  host: string,
  expected: string,
  options: { propagating: boolean },
): string {
  const suffix = options.propagating ? " DNS changes can take a few minutes to become visible." : "";

  if (isApexDomain(host)) {
    return (
      `${host} is the root of its domain, so it needs an ALIAS, ANAME or CNAME-flattening ` +
      `record pointing at ${expected} — a plain CNAME at a domain root will be rejected by ` +
      `your DNS provider. On Route 53, use an A record with Alias enabled.${suffix}`
    );
  }

  return (
    `${host} has no CNAME record${options.propagating ? " yet" : ""}. ` +
    `Add a CNAME pointing at ${expected}.${suffix}`
  );
}

/**
 * A flattened apex (ALIAS/ANAME) answers A but not CNAME.
 *
 * Returns `null` on a miss BY DESIGN rather than `false`: CloudFront's edge
 * addresses rotate between queries, so a non-overlapping A set means *unknown*,
 * not *unpublished*. Callers must not treat `null` as a negative — see the
 * `inconclusive` outcome.
 */
async function verifyFlattenedAlias(
  host: string,
  cdnHost: string,
): Promise<{ resolvedIp: string; message: string } | null> {
  try {
    const [hostAddrs, cdnAddrs] = await Promise.all([dns.resolve4(host), dns.resolve4(cdnHost)]);
    const cdnSet = new Set(cdnAddrs);
    const shared = hostAddrs.find((a) => cdnSet.has(a));
    if (shared) {
      return {
        resolvedIp: shared,
        message: `${host} resolves to the CDN via a flattened ALIAS record.`,
      };
    }
  } catch {
    // Nothing to add — the caller reports the routing guidance.
  }
  return null;
}

/**
 * Does `host` route to `expected`?
 *
 * NOTE: a DNS check, not a TLS handshake. It proves the record points at the
 * distribution, not that the distribution is serving the domain over HTTPS. A
 * real end-to-end TLS assertion stays integration-only.
 */
export async function verifyRoutingRecordAws(
  host: string,
  expected: string,
): Promise<RoutingCheck> {
  try {
    const cnames = await dns.resolveCname(host);
    const resolved = cnames.map(normalizeHost);

    if (resolved.includes(expected)) {
      return {
        outcome: "verified",
        serverIp: expected,
        resolved: resolved[0],
        message: `${host} points at the CDN (${expected}).`,
      };
    }

    if (resolved.length > 0) {
      return {
        outcome: "mismatched",
        serverIp: expected,
        resolved: resolved[0],
        message: `${host} is a CNAME to ${resolved[0]}, but it must point at ${expected}.`,
      };
    }

    return {
      outcome: "missing",
      serverIp: expected,
      message: missingRoutingRecordMessage(host, expected, { propagating: false }),
    };
  } catch (err) {
    const msg = getErrMsg(err);

    if (/ENODATA|ENOTFOUND/i.test(msg)) {
      const flattened = await verifyFlattenedAlias(host, expected);
      if (flattened) {
        return {
          outcome: "verified",
          serverIp: expected,
          resolved: flattened.resolvedIp,
          message: flattened.message,
        };
      }

      // No CNAME and no A overlap. For an apex this is genuinely UNKNOWN.
      if (isApexDomain(host)) {
        return {
          outcome: "inconclusive",
          serverIp: expected,
          message:
            `${host} has no CNAME record, which is expected for a flattened root domain. ` +
            `Its addresses could not be matched against the CDN's, which rotate — so this ` +
            `could not be confirmed either way. Check that the site loads over HTTPS.`,
        };
      }

      return {
        outcome: "missing",
        serverIp: expected,
        message: missingRoutingRecordMessage(host, expected, { propagating: true }),
      };
    }

    return {
      outcome: "missing",
      serverIp: expected,
      message: `Could not resolve ${host}: ${msg}`,
      error: msg,
    };
  }
}

/**
 * Is the certificate's own validation record visible in DNS?
 *
 * The only available signal for distinguishing "the user has not published the
 * record" from "AWS has it and is validating": ACM's `ValidationStatus` stays
 * `PENDING_VALIDATION` for both until it flips to `SUCCESS`.
 */
export async function isValidationRecordVisible(recordName: string): Promise<boolean> {
  try {
    const answers = await dns.resolveCname(normalizeHost(recordName));
    return answers.length > 0;
  } catch {
    return false;
  }
}

/**
 * Every call to a git provider goes through `gitFetch`, because a connection's
 * `endpoint` is tenant-supplied: without this guard a tenant could point it
 * (or a redirect from it) at cloud metadata or an internal service and read the
 * reply back through the file-content route.
 */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { fetchWithTimeout, type FetchWithTimeoutInit } from "../../../../shared/http/fetch.js";
import { createDomainErrorClass } from "../../../../shared/supabase/errors.js";

const UnsafeEndpointError = createDomainErrorClass<"bad_request">("GitIntegrationError");

// The default public API hosts, skipped to save a DNS lookup on every call.
const PUBLIC_API_HOSTS = new Set(["api.github.com", "gitlab.com", "api.bitbucket.org"]);
const MAX_REDIRECTS = 5;

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 127], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net, prefix, "ipv6");

/** Loopback, private, link-local (metadata), CGNAT, multicast or reserved. IPv4-mapped IPv6 included. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (PUBLIC_API_HOSTS.has(host)) return;
  // shortcut: checked at lookup, not at connect, so DNS rebinding between the two still gets through; upgrade to an undici dispatcher with a connect-time lookup if that matters.
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.some(isBlockedAddress)) {
    throw new UnsafeEndpointError(
      "This connection's endpoint points to a private or internal network address, which is not allowed.",
      "bad_request",
    );
  }
}

/** `fetchWithTimeout` that refuses internal addresses, re-checking every redirect hop. */
export async function gitFetch(url: string | URL, init: FetchWithTimeoutInit = {}): Promise<Response> {
  let target = new URL(url);
  let headers = init.headers;
  const method = (init.method ?? "GET").toUpperCase();
  for (let hop = 0; ; hop++) {
    await assertPublicHost(target);
    const res = await fetchWithTimeout(target.href, { ...init, headers, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    // Only GET/HEAD are followed: fetch would rewrite a redirected POST into a GET.
    if (!location || (method !== "GET" && method !== "HEAD")) return res;
    if (hop >= MAX_REDIRECTS) throw new UnsafeEndpointError("The git provider redirected too many times.", "bad_request");
    const next = new URL(location, target);
    if (next.origin !== target.origin) {
      const stripped = new Headers(headers);
      stripped.delete("authorization");
      stripped.delete("private-token");
      headers = stripped;
    }
    target = next;
  }
}

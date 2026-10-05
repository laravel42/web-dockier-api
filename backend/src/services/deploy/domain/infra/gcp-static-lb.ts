/**
 * GCP static-site HTTPS load balancer primitives (Compute v1 REST).
 *
 * The static GCP deploy already provisions a backend bucket with Cloud CDN, a
 * URL map, a target HTTP proxy, a global anycast IP and a `:80` forwarding
 * rule. What is missing for a custom domain is the HTTPS half: a
 * Google-managed certificate, a target HTTPS proxy, and a `:443` forwarding
 * rule sharing the existing IP.
 *
 * Why REST and not Pulumi: the Pulumi program is generated at plan time and
 * stored on the deployment row, so a domain added later has no workspace to
 * re-run — and the Pulumi CLI is not present in `backend/Dockerfile`, so a
 * `pulumi up` from the domains service would not work in production at all.
 * These calls are the same escape hatch `GcpStorageAdapter.destroy()` already
 * uses to clean up LB resources outside a deploy.
 *
 * NOTE on collection names. The valid Compute v1 global collections are
 * `global/forwardingRules` and `global/addresses`. The destroy sweep in
 * `gcp-storage.ts` spells them `global/globalForwardingRules` and
 * `global/globalAddresses`, which are not valid and silently 404 — a
 * pre-existing bug, not copied here.
 */

import type { GcpClient } from "./gcp-client.js";
import { GcpApiError } from "./gcp-client.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";

const COMPUTE = "https://compute.googleapis.com/compute/v1";

function globalUrl(projectId: string, collection: string, name?: string): string {
  const base = `${COMPUTE}/projects/${projectId}/global/${collection}`;
  return name ? `${base}/${name}` : base;
}

/** A Google-managed certificate's provisioning state. */
export interface ManagedCertificateState {
  name: string;
  selfLink: string;
  /** PROVISIONING | ACTIVE | FAILED_NOT_VISIBLE | FAILED_CAA_* | ... */
  status: string;
  /** Per-domain status; a domain stuck at FAILED_NOT_VISIBLE has no live A record. */
  domainStatus: Record<string, string>;
  domains: string[];
}

interface ManagedCertResource {
  name?: string;
  selfLink?: string;
  managed?: {
    status?: string;
    domains?: string[];
    domainStatus?: Record<string, string>;
  };
}

/** True for a 404 from the Compute API. */
function isNotFound(err: unknown): boolean {
  return err instanceof GcpApiError && err.isNotFound;
}

/** True when a resource already exists (concurrent create, or a re-run). */
function isAlreadyExists(err: unknown): boolean {
  if (!(err instanceof GcpApiError)) return false;
  // The message check covers Compute returning 400 with an alreadyExists reason.
  return err.isAlreadyExists || /alreadyExists/i.test(err.message);
}

/** Read a managed certificate, or null when it does not exist. */
export async function getManagedCertificate(
  client: GcpClient,
  name: string,
): Promise<ManagedCertificateState | null> {
  try {
    const res = await client.requestJson<ManagedCertResource>(
      globalUrl(client.getProjectId(), "sslCertificates", name),
    );
    return {
      name: res.name || name,
      selfLink: res.selfLink || "",
      status: res.managed?.status || "UNKNOWN",
      domainStatus: res.managed?.domainStatus || {},
      domains: res.managed?.domains || [],
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Create a Google-managed certificate covering `domains`, or return the
 * existing one.
 *
 * Managed certificates are immutable in their domain list, so a changed domain
 * set means a new certificate under a new name — the caller owns that naming.
 */
export async function ensureManagedCertificate(
  client: GcpClient,
  name: string,
  domains: string[],
): Promise<ManagedCertificateState> {
  const existing = await getManagedCertificate(client, name);
  if (existing) return existing;

  try {
    await client.requestJson(globalUrl(client.getProjectId(), "sslCertificates"), {
      method: "POST",
      body: {
        name,
        type: "MANAGED",
        managed: { domains },
      },
    });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }

  // Read back so the caller always gets a real status rather than assuming.
  const created = await getManagedCertificate(client, name);
  if (created) return created;

  return { name, selfLink: "", status: "PROVISIONING", domainStatus: {}, domains };
}

/** Delete a managed certificate. Never throws — a leaked certificate is free. */
export async function deleteManagedCertificate(client: GcpClient, name: string): Promise<void> {
  try {
    await client.requestJson(globalUrl(client.getProjectId(), "sslCertificates", name), {
      method: "DELETE",
    });
  } catch (err) {
    if (isNotFound(err)) return;
    // In use by a proxy, or a transient failure. The next reconcile retries.
    logger.warn({ err: getErrMsg(err), name }, "[gcp-static-lb] could not delete managed certificate");
  }
}

export interface HttpsProxyState {
  name: string;
  selfLink: string;
  sslCertificates: string[];
  urlMap: string;
}

interface ProxyResource {
  name?: string;
  selfLink?: string;
  sslCertificates?: string[];
  urlMap?: string;
}

/** Read a target HTTPS proxy, or null when it does not exist. */
export async function getHttpsProxy(client: GcpClient, name: string): Promise<HttpsProxyState | null> {
  try {
    const res = await client.requestJson<ProxyResource>(
      globalUrl(client.getProjectId(), "targetHttpsProxies", name),
    );
    return {
      name: res.name || name,
      selfLink: res.selfLink || "",
      sslCertificates: res.sslCertificates || [],
      urlMap: res.urlMap || "",
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Create the HTTPS proxy if missing, pointing at the EXISTING url map so HTTP
 * and HTTPS serve identical routing and the SPA error policy is not duplicated.
 */
export async function ensureHttpsProxy(
  client: GcpClient,
  params: { name: string; urlMapSelfLink: string; certificateSelfLinks: string[] },
): Promise<HttpsProxyState> {
  const existing = await getHttpsProxy(client, params.name);
  if (existing) return existing;

  try {
    await client.requestJson(globalUrl(client.getProjectId(), "targetHttpsProxies"), {
      method: "POST",
      body: {
        name: params.name,
        urlMap: params.urlMapSelfLink,
        sslCertificates: params.certificateSelfLinks,
      },
    });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }

  const created = await getHttpsProxy(client, params.name);
  if (created) return created;

  return {
    name: params.name,
    selfLink: "",
    sslCertificates: params.certificateSelfLinks,
    urlMap: params.urlMapSelfLink,
  };
}

/**
 * Swap the certificates attached to an HTTPS proxy.
 *
 * This is how a changed domain set goes live: the new certificate replaces the
 * old one on the proxy, and only then can the old one be deleted.
 */
export async function setProxySslCertificates(
  client: GcpClient,
  proxyName: string,
  certificateSelfLinks: string[],
): Promise<void> {
  await client.requestJson(
    `${globalUrl(client.getProjectId(), "targetHttpsProxies", proxyName)}/setSslCertificates`,
    { method: "POST", body: { sslCertificates: certificateSelfLinks } },
  );
}

export interface ForwardingRuleState {
  name: string;
  target: string;
  ipAddress: string;
  portRange: string;
}

interface ForwardingRuleResource {
  name?: string;
  target?: string;
  IPAddress?: string;
  portRange?: string;
}

/** Read a global forwarding rule, or null when it does not exist. */
export async function getForwardingRule(
  client: GcpClient,
  name: string,
): Promise<ForwardingRuleState | null> {
  try {
    const res = await client.requestJson<ForwardingRuleResource>(
      globalUrl(client.getProjectId(), "forwardingRules", name),
    );
    return {
      name: res.name || name,
      target: res.target || "",
      ipAddress: res.IPAddress || "",
      portRange: res.portRange || "",
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Create the `:443` forwarding rule on the EXISTING global IP.
 *
 * Reusing the IP is what keeps the user's A record valid: a new address would
 * mean the DNS they already published points at nothing.
 */
export async function ensureHttpsForwardingRule(
  client: GcpClient,
  params: { name: string; proxySelfLink: string; ipAddress: string },
): Promise<ForwardingRuleState> {
  const existing = await getForwardingRule(client, params.name);
  if (existing) return existing;

  try {
    await client.requestJson(globalUrl(client.getProjectId(), "forwardingRules"), {
      method: "POST",
      body: {
        name: params.name,
        target: params.proxySelfLink,
        IPAddress: params.ipAddress,
        portRange: "443",
        loadBalancingScheme: "EXTERNAL_MANAGED",
      },
    });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }

  const created = await getForwardingRule(client, params.name);
  if (created) return created;

  return { name: params.name, target: params.proxySelfLink, ipAddress: params.ipAddress, portRange: "443" };
}

/** Read the address value of a global IP, or null when it does not exist. */
export async function getGlobalAddressValue(
  client: GcpClient,
  name: string,
): Promise<string | null> {
  try {
    const res = await client.requestJson<{ address?: string }>(
      globalUrl(client.getProjectId(), "addresses", name),
    );
    return res.address || null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Names in a global collection starting with `prefix`.
 *
 * Used to discover the LB resources of a deployment that predates CDN handle
 * persistence, following the name convention the Pulumi program emits.
 */
export async function listGlobalResourceNames(
  client: GcpClient,
  collection: string,
  prefix: string,
): Promise<string[]> {
  try {
    const res = await client.requestJson<{ items?: Array<{ name?: string }> }>(
      globalUrl(client.getProjectId(), collection),
    );
    return (res.items ?? [])
      .map((i) => i.name || "")
      .filter((n) => n && n.startsWith(prefix));
  } catch (err) {
    logger.warn(
      { err: getErrMsg(err), collection, prefix },
      "[gcp-static-lb] could not list global resources",
    );
    return [];
  }
}

/**
 * Remove the HTTPS front end and every managed certificate for a static site.
 *
 * Ordered deliberately: the forwarding rule references the proxy and the proxy
 * references the certificates, so deleting in the other direction fails with
 * "resource in use".
 */
export async function teardownGcpStaticHttps(
  client: GcpClient,
  params: { appNamePrefix: string },
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const { appNamePrefix } = params;

  const rules = await listGlobalResourceNames(client, "forwardingRules", `${appNamePrefix}-fwd-https`);
  for (const name of rules) {
    try {
      await client.requestJson(globalUrl(client.getProjectId(), "forwardingRules", name), {
        method: "DELETE",
      });
    } catch (err) {
      if (!isNotFound(err)) errors.push(`forwardingRules/${name}: ${getErrMsg(err)}`);
    }
  }

  const proxies = await listGlobalResourceNames(client, "targetHttpsProxies", `${appNamePrefix}-https-proxy`);
  for (const name of proxies) {
    try {
      await client.requestJson(globalUrl(client.getProjectId(), "targetHttpsProxies", name), {
        method: "DELETE",
      });
    } catch (err) {
      if (!isNotFound(err)) errors.push(`targetHttpsProxies/${name}: ${getErrMsg(err)}`);
    }
  }

  const certs = await listGlobalResourceNames(client, "sslCertificates", `${appNamePrefix}-cert`);
  for (const name of certs) {
    await deleteManagedCertificate(client, name);
  }

  return { errors };
}

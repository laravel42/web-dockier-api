/**
 * GCP Compute Engine VPS Provisioning (Dokploy path)
 *
 * Launches a bare Ubuntu VM on the *tenant's own* GCP account so Dokploy can
 * register it as a remote deploy target and run its own setup (Docker, Traefik,
 * build tools). Like the AWS path, we do the minimum here — no startup-script
 * bootstrapping — because Dokploy's `server.setup` installs software.
 *
 * The tenant's credential is a service-account JSON string (stored in
 * server_providers.api_key); GcpClient handles the JWT → token exchange.
 */

import { createGcpClient, GcpApiError } from "../../infra/gcp-client.js";

const DEFAULT_MACHINE_TYPE = "e2-small";
const FIREWALL_NAME = "dockier-dokploy-allow";
const NETWORK_TAG = "dockier-dokploy";
// Ubuntu 22.04 LTS image family (Canonical's public project).
const UBUNTU_SOURCE_IMAGE = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts";
const OPEN_PORTS = ["22", "80", "443"];

export interface GceProvisionParams {
  /** Service-account JSON key string (server_providers.api_key for GCP). */
  serviceAccountKey: string;
  /** Region (e.g. "us-central1"). A zone is derived unless `zone` is given. */
  region: string;
  /** Explicit zone override (e.g. "us-central1-b"). */
  zone?: string;
  /** Machine type from the selected plan (e.g. "e2-small"). */
  machineType?: string;
  /** Public SSH key to install (the Dokploy-managed key). */
  sshPublicKey: string;
  /** Instance name (GCE naming rules: lowercase, digits, hyphens). */
  instanceName: string;
  /** Optional progress log. */
  log?: (line: string) => Promise<void> | void;
  /** Operation poll timeout (ms). Default 180000. */
  operationTimeoutMs?: number;
  /** Operation poll interval (ms). Default 3000. */
  operationIntervalMs?: number;
}

export interface GceProvisionResult {
  /** GCE instance name (used as the instance identifier for teardown). */
  instanceId: string;
  publicIp: string;
  zone: string;
}

/**
 * Launch a Compute Engine VM and return its name + external IP once ready.
 */
export async function provisionGceInstance(params: GceProvisionParams): Promise<GceProvisionResult> {
  const log = params.log ?? (() => {});
  const zone = params.zone || `${params.region}-b`;
  const machineType = params.machineType || DEFAULT_MACHINE_TYPE;
  const name = sanitizeInstanceName(params.instanceName);

  let client: Awaited<ReturnType<typeof createGcpClient>>;
  try {
    client = await createGcpClient(params.serviceAccountKey);
  } catch (err) {
    throw wrapGcpError(err, "authenticate with GCP");
  }

  // ─── 1. Firewall rule (idempotent) ─────────────────────────────
  await log(`Ensuring firewall rule "${FIREWALL_NAME}" (ports ${OPEN_PORTS.join("/")})...`);
  try {
    await client.ensureFirewallRule({ name: FIREWALL_NAME, ports: OPEN_PORTS, targetTag: NETWORK_TAG });
  } catch (err) {
    throw wrapGcpError(err, "create firewall rule");
  }

  // ─── 2. Create the instance ────────────────────────────────────
  await log(`Launching GCE instance "${name}" (${machineType}, ${zone})...`);
  let createResult: { operationName: string; alreadyExists: boolean };
  try {
    createResult = await client.createInstance(zone, {
      name,
      machineType,
      sourceImage: UBUNTU_SOURCE_IMAGE,
      sshKeys: `root:${params.sshPublicKey}`,
      diskSizeGb: 30,
      tags: [NETWORK_TAG],
    });
  } catch (err) {
    throw wrapGcpError(err, "create GCE instance");
  }

  // ─── 3. Wait for the create operation to finish ────────────────
  if (!createResult.alreadyExists && createResult.operationName) {
    await log(`Waiting for instance operation to complete...`);
    try {
      await client.waitForZoneOperation(zone, createResult.operationName, {
        timeoutMs: params.operationTimeoutMs,
        intervalMs: params.operationIntervalMs,
      });
    } catch (err) {
      throw wrapGcpError(err, "provision GCE instance");
    }
  } else if (createResult.alreadyExists) {
    await log(`Instance "${name}" already exists — reusing.`);
  }

  // ─── 4. Read the external IP ───────────────────────────────────
  await log("Reading instance external IP...");
  const publicIp = await pollExternalIp(client, zone, name, {
    timeoutMs: params.operationTimeoutMs,
    intervalMs: params.operationIntervalMs,
  });

  await log(`Instance "${name}" is running at ${publicIp}`);
  return { instanceId: name, publicIp, zone };
}

// ─── Helpers ─────────────────────────────────────────────────────

async function pollExternalIp(
  client: Awaited<ReturnType<typeof createGcpClient>>,
  zone: string,
  name: string,
  opts: { timeoutMs?: number; intervalMs?: number },
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const ip = await client.getInstanceExternalIp(zone, name);
      if (ip) return ip;
    } catch (err) {
      // Transient read failure — keep polling until the deadline.
      if (err instanceof GcpApiError && !err.isRetryable && !err.isNotFound) {
        throw wrapGcpError(err, "read GCE instance IP");
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`GCE instance "${name}" did not report an external IP within ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * GCE instance names must be 1–63 chars, lowercase letters, digits, or hyphens,
 * and start with a letter. Normalize to satisfy that.
 */
function sanitizeInstanceName(raw: string): string {
  let name = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z]/.test(name)) name = `d-${name}`;
  return name.slice(0, 63).replace(/-$/, "");
}

/** Turn opaque GCP errors into actionable, user-facing messages. */
function wrapGcpError(err: unknown, action: string): Error {
  if (err instanceof GcpApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return new Error(`Failed to ${action}: the GCP service account is invalid or lacks permission (${err.gcpErrorCode ?? err.statusCode}). Check the provider's service-account JSON and its IAM roles (Compute Admin).`);
    }
    if (err.statusCode === 429 || err.gcpErrorCode === "QUOTA_EXCEEDED") {
      return new Error(`Failed to ${action}: the GCP project hit a quota limit. Try a different machine type or region, or request a quota increase.`);
    }
    return new Error(`Failed to ${action}: ${err.message}`);
  }
  const message = err instanceof Error ? err.message : String(err);
  // createGcpClient throws plain Errors for bad/missing credentials.
  if (/service account|access token|project ID/i.test(message)) {
    return new Error(`Failed to ${action}: the GCP service-account credentials for this provider are invalid (${message}).`);
  }
  return new Error(`Failed to ${action}: ${message}`);
}

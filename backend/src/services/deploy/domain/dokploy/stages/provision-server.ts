/**
 * Stage: Provision Server
 *
 * Ensures a Dokploy Remote Server exists for the project.
 * If a healthy server already exists in the DB, reuses it.
 * If not, attempts to register a pre-provisioned VPS (from DOKPLOY_DEFAULT_SERVER_IP)
 * or fails with a clear actionable error.
 *
 * Full VPS auto-provisioning (EC2/GCE API → launch → wait for SSH) is deferred
 * to a follow-up task. For the initial integration, servers must be pre-provisioned
 * externally and either:
 *   a) Registered via `registerServerInDokploy()` from an admin endpoint, or
 *   b) Set via `DOKPLOY_DEFAULT_SERVER_IP` env var for single-server setups.
 *
 * This stage runs in parallel with sync-git.
 */

import type { DokployClient } from "../client.js";
import { getServer, upsertServer, updateServerStatus, deleteServerMapping } from "../mappings.js";
import { env } from "../../../../../shared/config.js";
import { getProviderCredentialsSafe, toAwsCredentials, toGcpServiceAccountKey, type ProviderCredential } from "../../../../../lib/provider-credentials.js";
import { provisionEc2Instance, ec2InstanceIsAlive } from "../provisioning/aws-ec2.js";
import { provisionGceInstance, gceInstanceIsAlive } from "../provisioning/gcp-gce.js";
import { waitForSsh } from "../provisioning/wait-for-ssh.js";
import { generateDockierSshKey } from "../provisioning/ssh-keygen.js";
import { sleep } from "../../../../../shared/utils/time.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";
import type { ServerValidation } from "../types.js";

export interface ProvisionServerResult {
  dokployServerId: string;
  serverIp: string;
  /**
   * True when an existing, still-valid server was reused; false when a fresh
   * server was provisioned. A fresh server means any previously provisioned
   * databases (which lived on the OLD box) are gone, so the pipeline must clear
   * their stale mappings and recreate them on the new server.
   */
  reused: boolean;
}

/**
 * Get or provision a Dokploy Remote Server for this project.
 */
export async function stageProvisionServer(params: {
  projectId: string;
  providerId: string;
  /** Tenant/organization id — used for cost-attribution tags on the VM. */
  tenantId?: string;
  /** Selected plan's instance size (e.g. "t3.small"). Optional — defaults per provider. */
  instanceType?: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, tenantId, instanceType, client, log } = params;

  await log("[stage:provision-server] Checking for existing server...");

  // Reuse the mapped server only if it is marked ready, still exists in Dokploy,
  // AND its underlying VM is still alive.
  //
  // Checking the Dokploy record alone is not enough: the record routinely
  // outlives the machine. A teardown that terminates the VM but fails to remove
  // the Dokploy server record (Dokploy rejects removal while services remain)
  // leaves a record that still resolves, so reuse "succeeded" and pointed the
  // whole deploy at a terminated instance — every SSH-dependent step then failed
  // confusingly. Verify the VM itself and re-provision when it's gone.
  const existing = await getServer(projectId);
  if (existing && existing.serverStatus === "ready") {
    const recordExists = await serverExists(existing.dokployServerId, client);
    const vmAlive = recordExists ? await mappedInstanceIsAlive(existing, log) : false;

    if (recordExists && vmAlive) {
      await log(`[stage:provision-server] ✓ Reusing existing server: ${existing.serverIp}`);
      return {
        dokployServerId: existing.dokployServerId,
        serverIp: existing.serverIp,
        reused: true,
      };
    }

    await log(
      recordExists
        ? `[stage:provision-server] Mapped server ${existing.serverIp} is no longer running — clearing stale mapping and re-provisioning.`
        : `[stage:provision-server] Mapped server ${existing.dokployServerId} no longer exists — clearing stale mapping and re-provisioning.`,
    );
    await deleteServerMapping(projectId);
    // The dead server's self-hosted services died with it, but their mappings are
    // cleared by the pipeline (which drops them whenever the server is not
    // reused) — not here, so that rule lives in exactly one place.
  } else if (existing && existing.serverStatus === "error") {
    // Server exists but is in error state — re-provision.
    await log("[stage:provision-server] Existing server is in error state, re-provisioning...");
  }

  await log("[stage:provision-server] Provisioning new server...");

  // ─── Pre-provisioned server path ───────────────────────────────
  // For the initial integration, we support a DOKPLOY_DEFAULT_SERVER_IP
  // env var for single-server setups. This registers the server in Dokploy
  // and stores the mapping. The server must already have SSH access configured
  // with the key matching DOKPLOY_SSH_KEY_ID.
  const defaultServerIp = process.env.DOKPLOY_DEFAULT_SERVER_IP;
  if (defaultServerIp) {
    await log(`[stage:provision-server] Using pre-provisioned server: ${defaultServerIp}`);
    return registerServerInDokploy({
      projectId,
      providerId,
      serverIp: defaultServerIp,
      client,
      log,
    });
  }

  // ─── Auto-provision a VPS on the tenant's own cloud account ────
  const creds = await getProviderCredentialsSafe(providerId);
  if (!creds) {
    throw new Error(
      "Could not resolve cloud credentials for this deployment's provider. " +
      "Verify the provider is configured under Settings → Providers.",
    );
  }

  const { credential, region } = creds;
  if (credential.kind === "aws") {
    return provisionAwsServer({ projectId, providerId, tenantId, instanceType, credential, region, client, log });
  }

  if (credential.kind === "gcp") {
    return provisionGcpServer({ projectId, providerId, tenantId, instanceType, credential, region, client, log });
  }

  throw new Error(
    `Unsupported cloud provider "${creds.provider}" for VPS provisioning. Supported: aws, gcp.`,
  );
}

/**
 * Provision an EC2 VPS on the tenant's AWS account, wait for SSH, and register
 * it in Dokploy. The SSH public key installed on the instance is the public
 * half of the Dokploy-managed key referenced by DOKPLOY_SSH_KEY_ID, so Dokploy
 * can connect and run its own setup.
 */
async function provisionAwsServer(params: {
  projectId: string;
  providerId: string;
  tenantId?: string;
  instanceType?: string;
  credential: ProviderCredential;
  region: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, tenantId, instanceType, credential, client, log } = params;

  const sshKeyId = env.DOKPLOY_SSH_KEY_ID;
  if (!sshKeyId) {
    throw new Error("DOKPLOY_SSH_KEY_ID is required to auto-provision servers");
  }

  const region = params.region || "us-east-1";
  await log(`[stage:provision-server] Provisioning EC2 VPS on tenant AWS account (region ${region})...`);

  // The Dokploy key's public half must be installed on the VM so Dokploy can SSH in.
  const sshPublicKey = await getDokployPublicKey(client, sshKeyId);

  // Dockier's OWN key — installed alongside Dokploy's so Dockier can SSH in to
  // run commands (post-deploy scripts + on-demand). Private half is persisted
  // encrypted on the server mapping.
  const dockierKey = generateDockierSshKey(`dockier-${projectId.slice(0, 8)}`);

  let instanceId: string;
  let serverIp: string;
  try {
    const result = await provisionEc2Instance({
      credentials: toAwsCredentials(credential, region),
      instanceType,
      sshPublicKey,
      extraPublicKeys: [dockierKey.publicKeyOpenssh],
      keyPairName: `dockier-${projectId.slice(0, 8)}`,
      instanceName: `dockier-${projectId.slice(0, 8)}`,
      tags: attributionTags(projectId, tenantId),
      log: (line) => log(`[stage:provision-server] ${line}`),
    });
    instanceId = result.instanceId;
    serverIp = result.publicIp;
  } catch (err) {
    // Mark any prior server row as error so a later deploy re-provisions cleanly.
    if (await getServer(projectId)) await updateServerStatus(projectId, "error");
    throw err;
  }

  // Wait for SSH before handing the box to Dokploy's setup (which SSHes in).
  await log(`[stage:provision-server] Waiting for SSH on ${serverIp}:22...`);
  const reachable = await waitForSsh(serverIp, 22, {
    onAttempt: (attempt) => { if (attempt % 6 === 0) void log(`[stage:provision-server] still waiting for SSH (attempt ${attempt})...`); },
  });
  if (!reachable) {
    if (await getServer(projectId)) await updateServerStatus(projectId, "error");
    throw new Error(`Provisioned instance ${instanceId} (${serverIp}) did not become SSH-reachable in time`);
  }

  return registerServerInDokploy({ projectId, providerId, serverIp, instanceId, sshPrivateKey: dockierKey.privateKeyPem, client, log });
}

/**
 * Provision a Compute Engine VM on the tenant's GCP account, wait for SSH, and
 * register it in Dokploy. The GCP credential is a service-account JSON string
 * (server_providers.credentials.serviceAccountKey). Installs the Dokploy-managed
 * key's public half so Dokploy can connect and run its own setup.
 */
async function provisionGcpServer(params: {
  projectId: string;
  providerId: string;
  tenantId?: string;
  instanceType?: string;
  credential: ProviderCredential;
  region: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, tenantId, instanceType, credential, client, log } = params;

  const sshKeyId = env.DOKPLOY_SSH_KEY_ID;
  if (!sshKeyId) {
    throw new Error("DOKPLOY_SSH_KEY_ID is required to auto-provision servers");
  }

  const region = params.region || "us-central1";
  await log(`[stage:provision-server] Provisioning GCE VM on tenant GCP account (region ${region})...`);

  const sshPublicKey = await getDokployPublicKey(client, sshKeyId);

  // Dockier's own key for command execution (see the AWS path for rationale).
  const dockierKey = generateDockierSshKey(`dockier-${projectId.slice(0, 8)}`);

  let instanceId: string;
  let serverIp: string;
  try {
    const result = await provisionGceInstance({
      serviceAccountKey: toGcpServiceAccountKey(credential),
      region,
      machineType: instanceType,
      sshPublicKey,
      extraPublicKeys: [dockierKey.publicKeyOpenssh],
      instanceName: `dockier-${projectId.slice(0, 8)}`,
      labels: attributionTags(projectId, tenantId),
      log: (line) => log(`[stage:provision-server] ${line}`),
    });
    instanceId = result.instanceId;
    serverIp = result.publicIp;
  } catch (err) {
    if (await getServer(projectId)) await updateServerStatus(projectId, "error");
    throw err;
  }

  await log(`[stage:provision-server] Waiting for SSH on ${serverIp}:22...`);
  const reachable = await waitForSsh(serverIp, 22, {
    onAttempt: (attempt) => { if (attempt % 6 === 0) void log(`[stage:provision-server] still waiting for SSH (attempt ${attempt})...`); },
  });
  if (!reachable) {
    if (await getServer(projectId)) await updateServerStatus(projectId, "error");
    throw new Error(`Provisioned instance ${instanceId} (${serverIp}) did not become SSH-reachable in time`);
  }

  return registerServerInDokploy({ projectId, providerId, serverIp, instanceId, sshPrivateKey: dockierKey.privateKeyPem, client, log });
}

/**
 * Build cost-attribution tags/labels applied to provisioned VMs so orphaned
 * instances on a tenant's cloud account are traceable back to Dockier.
 * Keys are lowercase to satisfy GCP label rules (AWS tag keys are case-flexible).
 */
/**
 * Check whether a Dokploy server still exists, by id. Returns false if
 * `server.one` reports it missing (or any lookup error), so a
 * deleted/unreachable server is treated as "re-provision" rather than fatal.
 */
async function serverExists(serverId: string, client: DokployClient): Promise<boolean> {
  try {
    const server = await client.getServer(serverId);
    return Boolean(server?.serverId);
  } catch {
    // server.one throws (typically 404) when the server was deleted.
    return false;
  }
}

function attributionTags(projectId: string, tenantId?: string): Record<string, string> {
  const tags: Record<string, string> = {
    "dockier-managed": "true",
    "dockier-project": projectId,
  };
  if (tenantId) tags["dockier-tenant"] = tenantId;
  return tags;
}

/**
 * Fetch the public key material for the Dokploy-managed SSH key referenced by
 * DOKPLOY_SSH_KEY_ID, so it can be installed on provisioned VMs.
 */
async function getDokployPublicKey(client: DokployClient, sshKeyId: string): Promise<string> {
  const keys = await client.listSSHKeys();
  const match = keys.find((k) => k.sshKeyId === sshKeyId);
  if (!match?.publicKey) {
    throw new Error(
      `The configured deployment SSH key "${sshKeyId}" could not be found (or has no public key). ` +
      "Contact your Dockier administrator to verify the deployment SSH key configuration.",
    );
  }
  return match.publicKey.trim();
}

/**
 * Whether the VM behind a mapped server is still alive.
 *
 * Resolves the mapping's provider credentials and asks the cloud API directly.
 * Best-effort and deliberately conservative:
 *  - no recorded instanceId (e.g. a pre-provisioned/BYO server) → assume alive,
 *    since Dockier never created a VM for it and must not re-provision one.
 *  - credentials unavailable or the check errors → treat as NOT alive, because
 *    silently reusing a dead server is the failure mode we're fixing.
 */
async function mappedInstanceIsAlive(
  existing: { instanceId?: string | null; providerId: string; serverIp: string },
  log: (line: string) => Promise<void>,
): Promise<boolean> {
  if (!existing.instanceId) return true;

  try {
    const creds = await getProviderCredentialsSafe(existing.providerId);
    if (!creds) {
      await log("[stage:provision-server] Could not resolve provider credentials to verify the existing server.");
      return false;
    }

    if (creds.credential.kind === "aws") {
      return await ec2InstanceIsAlive(
        toAwsCredentials(creds.credential, creds.region || "us-east-1"),
        existing.instanceId,
      );
    }
    if (creds.credential.kind === "gcp") {
      return await gceInstanceIsAlive(toGcpServiceAccountKey(creds.credential), existing.instanceId);
    }
    // Unknown provider — can't verify; assume alive rather than destroying a
    // server we don't understand.
    return true;
  } catch {
    return false;
  }
}

/**
 * Run Dokploy `server.setup` + `server.validate`, retrying until the server is
 * fully provisioned (Docker installed) or attempts are exhausted.
 *
 * Two transient conditions are tolerated on a freshly launched VPS:
 *
 *  1. Not SSH-ready as root yet — Ubuntu enables root SSH via cloud-init on
 *     first boot, finishing slightly AFTER port 22 opens. In that window
 *     Dokploy hits the "Please login as the user ubuntu" banner and validate
 *     returns "Failed to parse output: ... Please log ...".
 *
 *  2. Setup still running — `server.setup` installs Docker/Swarm/Traefik over
 *     SSH, which takes a couple of minutes. validate returns a well-formed
 *     response with `docker.enabled: false` until it completes.
 *
 * Both are retried with a delay. We only return once Docker reports enabled.
 */
export async function setupAndValidateWithRetry(
  client: DokployClient,
  serverId: string,
  log: (line: string) => Promise<void>,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<ServerValidation> {
  const attempts = opts.attempts ?? 10;
  const delayMs = opts.delayMs ?? 20_000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await client.setupServer(serverId);
      const validation = await client.validateServer(serverId);

      // Wait for BOTH Docker and the Dokploy overlay network.
      //
      // Setup installs Docker, then initializes Swarm, then creates the
      // `dokploy-network` overlay. Returning as soon as Docker was enabled left
      // a race: the caller requires the network, so a server that just needed a
      // few more seconds failed hard with "Dokploy network not installed after
      // setup" and the whole deploy aborted. Both must be ready before we
      // consider the server provisioned.
      if (validation.docker?.enabled && validation.isDokployNetworkInstalled) {
        return validation;
      }

      if (attempt < attempts) {
        if (!validation.docker?.enabled) {
          lastErr = new Error("Docker not installed yet");
          await log(`[stage:provision-server] Docker not ready yet (attempt ${attempt}/${attempts}); waiting for server setup to finish...`);
        } else {
          lastErr = new Error("Dokploy network not created yet");
          await log(`[stage:provision-server] Docker is ready; waiting for the Dokploy network (attempt ${attempt}/${attempts})...`);
        }
        await sleep(delayMs);
        continue;
      }

      throw new Error(
        validation.docker?.enabled
          ? "Server setup failed: the Dokploy network was not created within the expected time"
          : "Server setup failed: Docker was not installed within the expected time",
      );
    } catch (err) {
      lastErr = err;
      const msg = getErrMsg(err);
      // Retry the transient "not SSH-ready" / connection signals; fail fast on
      // anything structural (bad serverId, auth, etc.).
      const transient = /please log|failed to parse output|docker not installed yet|dokploy network not created yet|ECONNREFUSED|timed out|connection/i.test(msg);
      if (!transient || attempt === attempts) throw err;
      await log(`[stage:provision-server] Server not ready yet (attempt ${attempt}/${attempts}); retrying...`);
      await sleep(delayMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Server setup failed");
}

/**
 * Register an already-provisioned VPS in Dokploy and run setup.
 * Used when VPS is provisioned externally or via EC2/GCE API.
 */
export async function registerServerInDokploy(params: {
  projectId: string;
  providerId: string;
  serverIp: string;
  instanceId?: string;
  /** Dockier-owned SSH private key (PEM) to persist encrypted for command execution. */
  sshPrivateKey?: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, serverIp, instanceId, sshPrivateKey, client, log } = params;

  const sshKeyId = env.DOKPLOY_SSH_KEY_ID;
  if (!sshKeyId) {
    throw new Error("DOKPLOY_SSH_KEY_ID is required to register remote servers");
  }

  await log(`[stage:provision-server] Registering server ${serverIp}...`);

  // Register in Dokploy
  const server = await client.createServer({
    name: `dockier-${projectId.slice(0, 8)}`,
    description: `Auto-provisioned by Dockier for project ${projectId}`,
    ipAddress: serverIp,
    port: 22,
    username: "root",
    sshKeyId,
    serverType: "deploy",
  });

  // Guard: createServer must resolve a real serverId. Dokploy's server.create
  // returns an empty body, so the id is resolved via server.all — if that
  // resolution ever comes back without an id, fail here with a clear message
  // rather than passing `undefined` into server.setup/validate (which surfaces
  // as an opaque "expected string, received undefined" 400).
  if (!server?.serverId) {
    await updateServerStatus(projectId, "error");
    throw new Error(
      `Dokploy server registration for ${serverIp} returned no serverId ` +
      `(create response was empty and the server could not be resolved from server.all).`,
    );
  }

  await log(`[stage:provision-server] Server registered (${server.serverId}). Running setup (Docker, Traefik, buildpacks)...`);

  await log("[stage:provision-server] Validating server readiness...");
  // Retries until BOTH Docker is enabled and the Dokploy network exists (or
  // attempts are exhausted, in which case it throws). On return the server is
  // fully provisioned, so no further readiness guard is needed here.
  try {
    await setupAndValidateWithRetry(client, server.serverId, log);
  } catch (err) {
    await updateServerStatus(projectId, "error");
    throw err;
  }

  // Store mapping (persists the Dockier SSH key encrypted when supplied).
  await upsertServer({
    projectId,
    providerId,
    dokployServerId: server.serverId,
    serverIp,
    instanceId,
    serverStatus: "ready",
    sshPrivateKey,
  });

  await log(`[stage:provision-server] ✓ Server ready: ${serverIp} (${server.serverId})`);
  return {
    dokployServerId: server.serverId,
    serverIp,
    reused: false,
  };
}

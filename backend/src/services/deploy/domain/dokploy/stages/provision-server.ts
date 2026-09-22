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
import { provisionEc2Instance } from "../provisioning/aws-ec2.js";
import { provisionGceInstance } from "../provisioning/gcp-gce.js";
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

  // Reuse the mapped server only if it is marked ready AND still exists in
  // Dokploy. A server deleted out-of-band (e.g. removed in the Dokploy UI, or
  // its VM terminated) leaves a dangling mapping row; blindly reusing it points
  // the whole deploy at a server that is no longer there — which later fails
  // deep in configure-app/deploy. If it's gone, clear the stale mapping and
  // provision a fresh server.
  const existing = await getServer(projectId);
  if (existing && existing.serverStatus === "ready") {
    if (await serverExists(existing.dokployServerId, client)) {
      await log(`[stage:provision-server] ✓ Reusing existing server: ${existing.serverIp}`);
      return {
        dokployServerId: existing.dokployServerId,
        serverIp: existing.serverIp,
        reused: true,
      };
    }
    await log(
      `[stage:provision-server] Mapped server ${existing.dokployServerId} no longer exists — clearing stale mapping and re-provisioning.`,
    );
    await deleteServerMapping(projectId);
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
async function setupAndValidateWithRetry(
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

      if (validation.docker?.enabled) {
        return validation;
      }

      // Setup accepted but Docker not up yet — keep waiting.
      lastErr = new Error("Docker not installed yet");
      if (attempt < attempts) {
        await log(`[stage:provision-server] Docker not ready yet (attempt ${attempt}/${attempts}); waiting for server setup to finish...`);
        await sleep(delayMs);
        continue;
      }
      throw new Error("Server setup failed: Docker was not installed within the expected time");
    } catch (err) {
      lastErr = err;
      const msg = getErrMsg(err);
      // Retry the transient "not SSH-ready" / connection signals; fail fast on
      // anything structural (bad serverId, auth, etc.).
      const transient = /please log|failed to parse output|docker not installed yet|ECONNREFUSED|timed out|connection/i.test(msg);
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
  // Retries until Docker is enabled (or attempts exhausted), so on return
  // docker.enabled is guaranteed true.
  const validation = await setupAndValidateWithRetry(client, server.serverId, log);

  if (!validation.isDokployNetworkInstalled) {
    await updateServerStatus(projectId, "error");
    throw new Error("Server setup failed: Dokploy network not installed after setup");
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

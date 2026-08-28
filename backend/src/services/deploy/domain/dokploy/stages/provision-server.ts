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
import { getServer, upsertServer, updateServerStatus } from "../mappings.js";
import { env } from "../../../../../shared/config.js";
import { getProviderCredentialsSafe } from "../../../../../lib/provider-credentials.js";
import { provisionEc2Instance } from "../provisioning/aws-ec2.js";
import { provisionGceInstance } from "../provisioning/gcp-gce.js";
import { waitForSsh } from "../provisioning/wait-for-ssh.js";

export interface ProvisionServerResult {
  dokployServerId: string;
  serverIp: string;
}

/**
 * Get or provision a Dokploy Remote Server for this project.
 */
export async function stageProvisionServer(params: {
  projectId: string;
  providerId: string;
  /** Selected plan's instance size (e.g. "t3.small"). Optional — defaults per provider. */
  instanceType?: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, instanceType, client, log } = params;

  await log("[stage:provision-server] Checking for existing server...");

  // Check if we already have a healthy server for this project
  const existing = await getServer(projectId);
  if (existing && existing.serverStatus === "ready") {
    await log(`[stage:provision-server] ✓ Reusing existing server: ${existing.serverIp}`);
    return {
      dokployServerId: existing.dokployServerId,
      serverIp: existing.serverIp,
    };
  }

  // If server exists but is in error/provisioning state, we'll re-provision
  if (existing && existing.serverStatus === "error") {
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

  const provider = creds.provider.toLowerCase();
  if (provider === "aws") {
    return provisionAwsServer({ projectId, providerId, instanceType, creds, client, log });
  }

  if (provider === "gcp") {
    return provisionGcpServer({ projectId, providerId, instanceType, creds, client, log });
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
  instanceType?: string;
  creds: { apiKey: string; apiSecret: string; region: string };
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, instanceType, creds, client, log } = params;

  const sshKeyId = env.DOKPLOY_SSH_KEY_ID;
  if (!sshKeyId) {
    throw new Error("DOKPLOY_SSH_KEY_ID is required to auto-provision servers");
  }

  const region = creds.region || "us-east-1";
  await log(`[stage:provision-server] Provisioning EC2 VPS on tenant AWS account (region ${region})...`);

  // The Dokploy key's public half must be installed on the VM so Dokploy can SSH in.
  const sshPublicKey = await getDokployPublicKey(client, sshKeyId);

  let instanceId: string;
  let serverIp: string;
  try {
    const result = await provisionEc2Instance({
      credentials: { accessKeyId: creds.apiKey, secretAccessKey: creds.apiSecret, region },
      instanceType,
      sshPublicKey,
      keyPairName: `dockier-${projectId.slice(0, 8)}`,
      instanceName: `dockier-${projectId.slice(0, 8)}`,
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

  return registerServerInDokploy({ projectId, providerId, serverIp, instanceId, client, log });
}

/**
 * Provision a Compute Engine VM on the tenant's GCP account, wait for SSH, and
 * register it in Dokploy. The GCP credential is a service-account JSON string
 * (server_providers.api_key). Installs the Dokploy-managed key's public half so
 * Dokploy can connect and run its own setup.
 */
async function provisionGcpServer(params: {
  projectId: string;
  providerId: string;
  instanceType?: string;
  creds: { apiKey: string; apiSecret: string; region: string };
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, instanceType, creds, client, log } = params;

  const sshKeyId = env.DOKPLOY_SSH_KEY_ID;
  if (!sshKeyId) {
    throw new Error("DOKPLOY_SSH_KEY_ID is required to auto-provision servers");
  }

  const region = creds.region || "us-central1";
  await log(`[stage:provision-server] Provisioning GCE VM on tenant GCP account (region ${region})...`);

  const sshPublicKey = await getDokployPublicKey(client, sshKeyId);

  let instanceId: string;
  let serverIp: string;
  try {
    const result = await provisionGceInstance({
      serviceAccountKey: creds.apiKey,
      region,
      machineType: instanceType,
      sshPublicKey,
      instanceName: `dockier-${projectId.slice(0, 8)}`,
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

  return registerServerInDokploy({ projectId, providerId, serverIp, instanceId, client, log });
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
      `SSH key "${sshKeyId}" not found in Dokploy (or has no public key). ` +
      "Check DOKPLOY_SSH_KEY_ID matches a key under Dokploy → Settings → SSH Keys.",
    );
  }
  return match.publicKey.trim();
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
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, serverIp, instanceId, client, log } = params;

  const sshKeyId = env.DOKPLOY_SSH_KEY_ID;
  if (!sshKeyId) {
    throw new Error("DOKPLOY_SSH_KEY_ID is required to register remote servers");
  }

  await log(`[stage:provision-server] Registering server ${serverIp} in Dokploy...`);

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

  await log("[stage:provision-server] Running Dokploy server setup (Docker, Traefik, buildpacks)...");
  await client.setupServer(server.serverId);

  await log("[stage:provision-server] Validating server readiness...");
  const validation = await client.validateServer(server.serverId);

  if (!validation.docker.installed) {
    await updateServerStatus(projectId, "error");
    throw new Error("Server setup failed: Docker not installed after setup");
  }

  if (!validation.isDokployNetworkReady) {
    await updateServerStatus(projectId, "error");
    throw new Error("Server setup failed: Dokploy network not ready");
  }

  // Store mapping
  await upsertServer({
    projectId,
    providerId,
    dokployServerId: server.serverId,
    serverIp,
    instanceId,
    serverStatus: "ready",
  });

  await log(`[stage:provision-server] ✓ Server ready: ${serverIp} (${server.serverId})`);
  return {
    dokployServerId: server.serverId,
    serverIp,
  };
}

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
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionServerResult> {
  const { projectId, providerId, client, log } = params;

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

  // ─── No server available — fail with actionable guidance ───────
  await log("[stage:provision-server] ✗ No server available for deployment");
  throw new Error(
    "No server available for this project. To fix this:\n" +
    "\n" +
    "Option A (recommended for testing): Set DOKPLOY_DEFAULT_SERVER_IP in your .env\n" +
    "  to the IP address of a pre-provisioned VPS with SSH access.\n" +
    "  The server needs: Ubuntu 22.04+, SSH on port 22, root access,\n" +
    "  and the SSH key matching DOKPLOY_SSH_KEY_ID registered in Dokploy.\n" +
    "\n" +
    "Option B: Manually register a server mapping in the dokploy_servers table\n" +
    "  with server_status='ready' and a valid dokploy_server_id from your\n" +
    "  Dokploy instance.\n" +
    "\n" +
    "Option C (future): VPS auto-provisioning via AWS EC2 or GCP Compute Engine\n" +
    "  will be implemented in a follow-up task.",
  );
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

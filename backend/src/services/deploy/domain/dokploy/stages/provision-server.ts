/**
 * Stage: Provision Server
 *
 * Ensures a Dokploy Remote Server exists for the project.
 * If a healthy server already exists, reuses it.
 * If not, provisions a new VPS and registers it in Dokploy.
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

  // ─── Provision new VPS ─────────────────────────────────────────
  // TODO: Phase 2.3 full implementation — call AWS EC2 or GCP Compute API
  // to launch a new instance. For now, this throws a descriptive error
  // indicating the VPS must be pre-provisioned externally.
  //
  // The full implementation will:
  // 1. Load provider credentials (AWS/GCP keys)
  // 2. Launch a t3.small (AWS) or n2d-standard-2 (GCP)
  // 3. Wait for instance to be running
  // 4. Wait for SSH on port 22
  // 5. Register in Dokploy + run setup

  await log("[stage:provision-server] Provisioning new server...");

  // For the initial integration, expect the server IP to come from
  // a pre-provisioned VPS. The full VPS provisioning (EC2/GCE API calls)
  // will be added as a follow-up task.
  throw new Error(
    "VPS auto-provisioning not yet implemented. " +
    "Pre-provision a VPS and register it manually in Dokploy, " +
    "then store the mapping in dokploy_servers.",
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

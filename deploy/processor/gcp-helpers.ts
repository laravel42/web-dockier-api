/**
 * GCP helper functions for the deploy service.
 *
 * This module re-exports the structured GcpClient and provides backward-compatible
 * helper functions that delegate to it. New code should use GcpClient directly
 * via createGcpClient().
 */

import { extractRegionFromScript } from "../shared";
import type { AdapterContext, PushImageResult } from "./adapters/types";
import {
  GcpClient,
  GcpApiError,
  getGcpAccessToken,
  getGcpProjectId,
  createGcpClient,
  type GcpClientConfig,
} from "./gcp-client";

// Re-export the client and factory for direct use
export { GcpClient, GcpApiError, getGcpAccessToken, getGcpProjectId, createGcpClient };
export type { GcpClientConfig };

// ─── Backward-Compatible Helper Functions ───────────────────────────
// These delegate to GcpClient internally but maintain the existing API
// surface so callers don't need to change immediately.

/** Enable one or more GCP APIs (idempotent). */
export async function enableGcpApis(
  projectId: string,
  accessToken: string,
  apis: string[],
): Promise<void> {
  const client = new GcpClient(accessToken, projectId);
  await client.enableApis(apis);
}

/**
 * Create an Artifact Registry Docker repository (idempotent — 409 = already exists).
 * Polls until the repo is accessible after creation.
 */
export async function ensureArtifactRegistryRepo(
  projectId: string,
  region: string,
  repoName: string,
  accessToken: string,
): Promise<{ created: boolean; error?: string }> {
  const client = new GcpClient(accessToken, projectId);
  return client.ensureArtifactRegistryRepo(region, repoName);
}

/**
 * Push a Docker image to GCP Artifact Registry.
 * Handles login, tag, and push in one call.
 */
export async function pushToArtifactRegistry(opts: {
  localImage: string;
  arImageUri: string;
  arHost: string;
  accessToken: string;
  workDir: string;
  runCmd: (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string>; stdin?: string }) => Promise<{ code: number; output: string }>;
  env?: Record<string, string>;
}): Promise<void> {
  const { localImage, arImageUri, arHost, accessToken, workDir, runCmd, env } = opts;

  // Login (retry once)
  const loginResult = await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password-stdin", arHost], { cwd: workDir, stdin: accessToken });
  if (loginResult.code !== 0) {
    await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password-stdin", arHost], { cwd: workDir, stdin: accessToken });
  }

  const tagResult = await runCmd("docker", ["tag", localImage, arImageUri], { cwd: workDir });
  if (tagResult.code !== 0) throw new Error("Failed to tag image for Artifact Registry");

  const pushResult = await runCmd("docker", ["push", arImageUri], { cwd: workDir, env });
  if (pushResult.code !== 0) throw new Error("Failed to push image to Artifact Registry");
}

/**
 * Delete a GCP Compute Engine firewall rule by name (idempotent — ignores 404).
 */
export async function deleteGcpFirewall(
  projectId: string,
  firewallName: string,
  accessToken: string,
): Promise<boolean> {
  const client = new GcpClient(accessToken, projectId);
  return client.deleteFirewall(firewallName);
}

/**
 * Delete a GCP Compute Engine static IP address by name (idempotent — ignores 404).
 */
export async function deleteGcpAddress(
  projectId: string,
  region: string,
  addressName: string,
  accessToken: string,
): Promise<boolean> {
  const client = new GcpClient(accessToken, projectId);
  return client.deleteAddress(region, addressName);
}

/**
 * Delete a GCP Compute Engine instance by name (idempotent — ignores 404).
 */
export async function deleteGcpInstance(
  projectId: string,
  zone: string,
  instanceName: string,
  accessToken: string,
): Promise<boolean> {
  const client = new GcpClient(accessToken, projectId);
  return client.deleteInstance(zone, instanceName);
}

/**
 * Delete orphaned GCP Compute Engine resources left behind by a failed deploy.
 * Deletes instance, firewall, and static IP in order (instance first since it
 * may hold a reference to the IP). All operations are idempotent.
 */
export async function deleteOrphanedComputeResources(opts: {
  projectId: string;
  region: string;
  resName: string;
  accessToken: string;
  appendLog: (msg: string) => Promise<void>;
}): Promise<void> {
  const { projectId, region, accessToken, appendLog } = opts;
  const client = new GcpClient(accessToken, projectId);

  // GCP resource names must match [a-z]([-a-z0-9]*[a-z0-9])? — sanitize the same way
  // the Pulumi GCP provider does (underscores → hyphens, lowercase).
  const resName = opts.resName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // Try to delete instance first (it holds a reference to the static IP)
  const instance = await client.findInstance(resName);
  if (instance) {
    await appendLog(`ℹ Deleting orphaned instance ${resName} in ${instance.zone}...`);
    await client.deleteInstance(instance.zone, resName);
    // Poll until the instance is fully terminated (can take 30-60s)
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      if (!(await client.instanceExists(instance.zone, resName))) break;
    }
  }

  // Delete firewall rule
  await appendLog(`ℹ Deleting orphaned firewall ${resName}-fw...`);
  await client.deleteFirewall(`${resName}-fw`);

  // Delete static IP
  await appendLog(`ℹ Deleting orphaned address ${resName}-ip...`);
  await client.deleteAddress(region, `${resName}-ip`);

  // Wait for GCP to fully process the deletions (operations are async)
  await new Promise((r) => setTimeout(r, 10_000));

  // Verify resources are gone — retry deletion if still present
  for (let i = 0; i < 3; i++) {
    const fwExists = await client.firewallExists(`${resName}-fw`);
    const ipExists = await client.addressExists(region, `${resName}-ip`);
    if (!fwExists && !ipExists) break;
    // Resources still exist — retry deletion
    if (fwExists) await client.deleteFirewall(`${resName}-fw`);
    if (ipExists) await client.deleteAddress(region, `${resName}-ip`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

// ─── Shared Push Helper ────────────────────────────────────────────

/**
 * Configuration for the shared GCP Artifact Registry push flow.
 *
 * The only differences between Cloud Run and Compute Engine pushImage()
 * are which APIs to enable and how long to wait for API propagation.
 */
export interface GcpPushConfig {
  /** GCP APIs to enable before pushing (e.g., run.googleapis.com, compute.googleapis.com) */
  apisToEnable: string[];
  /** Milliseconds to wait after enabling APIs (Cloud Run needs 10s, Compute needs 5s) */
  apiWaitMs: number;
}

/**
 * Shared pushImage logic for GCP adapters.
 *
 * Handles the full Artifact Registry push flow:
 * 1. Get GCP access token and project ID from service account key
 * 2. Enable required APIs (Artifact Registry + strategy-specific APIs)
 * 3. Create Artifact Registry repository (idempotent)
 * 4. Tag and push Docker image to Artifact Registry
 *
 * Returns the push result and stores the access token + image URI on ctx.state
 * for downstream use by provisionInfrastructure and runPostDeploy.
 */
export async function pushToGcpArtifactRegistry(
  ctx: AdapterContext,
  localImage: string,
  config: GcpPushConfig,
): Promise<PushImageResult> {
  const { shortId, region, workDir, providerCredentials, event, runCmd, appendLog } = ctx;
  const repoName = ctx.repoName;

  // Create a structured client for this push operation
  const client = await createGcpClient(providerCredentials.apiKey);

  await appendLog("── Push Image to Artifact Registry ─");

  const arRegion = extractRegionFromScript(event.tofuScript) || region;

  // Enable APIs
  await appendLog("ℹ Enabling Artifact Registry API...");
  await client.enableApis([
    "artifactregistry.googleapis.com",
    ...config.apisToEnable,
  ]);
  await new Promise((r) => setTimeout(r, config.apiWaitMs));
  await appendLog("✓ APIs enabled");

  const arHost = `${arRegion}-docker.pkg.dev`;
  const arRepo = repoName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
  const arImageUri = `${arHost}/${client.getProjectId()}/${arRepo}/${arRepo}:${shortId}`;

  // Create Artifact Registry repository
  const repoResult = await client.ensureArtifactRegistryRepo(arRegion, arRepo);
  if (repoResult.created) {
    await appendLog("✓ Artifact Registry repository created");
  } else if (repoResult.error) {
    await appendLog(`⚠ Create repo: ${repoResult.error}`);
  } else {
    await appendLog("✓ Artifact Registry repository already exists");
  }

  // Push image
  await pushToArtifactRegistry({
    localImage,
    arImageUri,
    arHost,
    accessToken: client.getAccessToken(),
    workDir,
    runCmd,
  });
  await appendLog(`✓ Image pushed: ${arImageUri}`);

  // Store the access token and image URI for downstream use
  ctx.state.gcpAccessToken = client.getAccessToken();
  ctx.state.arImageUri = arImageUri;

  return { remoteImageUri: arImageUri, skipped: false };
}

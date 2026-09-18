/**
 * GCP helper functions for the deploy service.
 *
 * Re-exports the structured GcpClient and provides backward-compatible
 * helper functions. New code should use GcpClient directly via createGcpClient().
 */

import type { AdapterContext, PushImageResult } from "../adapters/types.js";
import { toGcpServiceAccountKey } from "../../../../lib/provider-credentials.js";
import {
  GcpClient,
  GcpApiError,
  getGcpAccessToken,
  getGcpProjectId,
  createGcpClient,
  type GcpClientConfig,
} from "./gcp-client.js";

// Re-export the client and factory for direct use
export { GcpClient, GcpApiError, getGcpAccessToken, getGcpProjectId, createGcpClient };
export type { GcpClientConfig };

// ─── Backward-Compatible Helper Functions ───────────────────────────

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
 * Create an Artifact Registry Docker repository (idempotent).
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
  const { localImage, arImageUri, arHost, accessToken, workDir, runCmd } = opts;

  const loginResult = await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password-stdin", arHost], { cwd: workDir, stdin: accessToken });
  if (loginResult.code !== 0) {
    await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password-stdin", arHost], { cwd: workDir, stdin: accessToken });
  }

  const tagResult = await runCmd("docker", ["tag", localImage, arImageUri], { cwd: workDir });
  if (tagResult.code !== 0) throw new Error("Failed to tag image for Artifact Registry");

  const pushResult = await runCmd("docker", ["push", arImageUri], { cwd: workDir, env: opts.env });
  if (pushResult.code !== 0) throw new Error("Failed to push image to Artifact Registry");
}

/** Delete a GCP Compute Engine firewall rule by name (idempotent). */
export async function deleteGcpFirewall(projectId: string, firewallName: string, accessToken: string): Promise<boolean> {
  const client = new GcpClient(accessToken, projectId);
  return client.deleteFirewall(firewallName);
}

/** Delete a GCP Compute Engine static IP address by name (idempotent). */
export async function deleteGcpAddress(projectId: string, region: string, addressName: string, accessToken: string): Promise<boolean> {
  const client = new GcpClient(accessToken, projectId);
  return client.deleteAddress(region, addressName);
}

/** Delete a GCP Compute Engine instance by name (idempotent). */
export async function deleteGcpInstance(projectId: string, zone: string, instanceName: string, accessToken: string): Promise<boolean> {
  const client = new GcpClient(accessToken, projectId);
  return client.deleteInstance(zone, instanceName);
}

/** Delete orphaned GCP Compute Engine resources. */
export async function deleteOrphanedComputeResources(opts: {
  projectId: string;
  region: string;
  resName: string;
  accessToken: string;
  appendLog: (msg: string) => Promise<void>;
}): Promise<void> {
  const { projectId, region, accessToken, appendLog } = opts;
  const client = new GcpClient(accessToken, projectId);
  const resName = opts.resName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const instance = await client.findInstance(resName);
  if (instance) {
    await appendLog(`ℹ Deleting orphaned instance ${resName} in ${instance.zone}...`);
    await client.deleteInstance(instance.zone, resName);
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      if (!(await client.instanceExists(instance.zone, resName))) break;
    }
  }

  await appendLog(`ℹ Deleting orphaned firewall ${resName}-fw...`);
  await client.deleteFirewall(`${resName}-fw`);

  await appendLog(`ℹ Deleting orphaned address ${resName}-ip...`);
  await client.deleteAddress(region, `${resName}-ip`);

  await new Promise((r) => setTimeout(r, 10_000));

  for (let i = 0; i < 3; i++) {
    const fwExists = await client.firewallExists(`${resName}-fw`);
    const ipExists = await client.addressExists(region, `${resName}-ip`);
    if (!fwExists && !ipExists) break;
    if (fwExists) await client.deleteFirewall(`${resName}-fw`);
    if (ipExists) await client.deleteAddress(region, `${resName}-ip`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

// ─── Shared Push Helper ────────────────────────────────────────────

export interface GcpPushConfig {
  apisToEnable: string[];
  apiWaitMs: number;
}

/**
 * Shared pushImage logic for GCP adapters.
 */
export async function pushToGcpArtifactRegistry(
  ctx: AdapterContext,
  localImage: string,
  config: GcpPushConfig,
): Promise<PushImageResult> {
  const { shortId, region, workDir, credential, event, runCmd, appendLog } = ctx;
  const repoName = ctx.repoName;

  const client = await createGcpClient(toGcpServiceAccountKey(credential));

  await appendLog("── Push Image to Artifact Registry ─");

  const arRegion = extractRegionFromScript(event.tofuScript) || region;

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

  const repoResult = await client.ensureArtifactRegistryRepo(arRegion, arRepo);
  if (repoResult.created) {
    await appendLog("✓ Artifact Registry repository created");
  } else if (repoResult.error) {
    await appendLog(`⚠ Create repo: ${repoResult.error}`);
  } else {
    await appendLog("✓ Artifact Registry repository already exists");
  }

  await pushToArtifactRegistry({
    localImage,
    arImageUri,
    arHost,
    accessToken: client.getAccessToken(),
    workDir,
    runCmd,
  });
  await appendLog(`✓ Image pushed: ${arImageUri}`);

  ctx.state.gcpAccessToken = client.getAccessToken();
  ctx.state.arImageUri = arImageUri;

  return { remoteImageUri: arImageUri, skipped: false };
}

// ─── Utility ────────────────────────────────────────────────────────

/**
 * Extract the region from a Pulumi/tofu script.
 * Looks for region="..." or region: "..." patterns.
 */
export function extractRegionFromScript(script: string): string {
  if (!script) return "";
  const match = script.match(/region[=:]\s*["']([^"']+)["']/);
  return match?.[1] || "";
}

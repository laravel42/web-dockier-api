import { createSign } from "node:crypto";

/** Retry a fetch call with exponential backoff for transient network errors. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      // Exponential backoff: 2s, 4s, 8s
      await new Promise((r) => setTimeout(r, 2_000 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}

/**
 * Get a GCP access token from a service account JSON key.
 * Centralizes the JWT → OAuth2 token exchange used across deploy, destroy, and AR push flows.
 */
export async function getGcpAccessToken(
  apiKey: string,
  scope = "https://www.googleapis.com/auth/cloud-platform"
): Promise<string> {
  const saKey = JSON.parse(apiKey || "{}");
  if (!saKey.client_email || !saKey.private_key) return "";

  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const jwtClaim = Buffer.from(JSON.stringify({
    iss: saKey.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  const signInput = `${jwtHeader}.${jwtClaim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signInput);
  const signature = signer.sign(saKey.private_key, "base64url");

  const tokenRes = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signInput}.${signature}`,
  });
  const tokenData = await tokenRes.json() as { access_token?: string };
  return tokenData.access_token || "";
}

/** Extract the GCP project ID from a service account JSON key. */
export function getGcpProjectId(apiKey: string): string {
  try {
    return JSON.parse(apiKey || "{}").project_id || "";
  } catch {
    return "";
  }
}

/** Enable one or more GCP APIs (idempotent). */
export async function enableGcpApis(
  projectId: string,
  accessToken: string,
  apis: string[]
): Promise<void> {
  for (const api of apis) {
    try {
      await fetchWithRetry(
        `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}:enable`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
    } catch {}
  }
}

/**
 * Create an Artifact Registry Docker repository (idempotent — 409 = already exists).
 * Polls until the repo is accessible after creation.
 */
export async function ensureArtifactRegistryRepo(
  projectId: string,
  region: string,
  repoName: string,
  accessToken: string
): Promise<{ created: boolean; error?: string }> {
  try {
    const createRes = await fetchWithRetry(
      `https://artifactregistry.googleapis.com/v1/projects/${projectId}/locations/${region}/repositories?repositoryId=${repoName}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ format: "DOCKER" }),
      }
    );
    if (createRes.ok) {
      // Poll until accessible
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5_000));
        const checkRes = await fetchWithRetry(
          `https://artifactregistry.googleapis.com/v1/projects/${projectId}/locations/${region}/repositories/${repoName}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (checkRes.ok) break;
      }
      return { created: true };
    } else if (createRes.status === 409) {
      return { created: false }; // already exists
    } else {
      const body = await createRes.text();
      return { created: false, error: `${createRes.status} ${body.slice(0, 200)}` };
    }
  } catch (e: any) {
    return { created: false, error: e.message };
  }
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
  runCmd: (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<{ code: number; output: string }>;
  env?: Record<string, string>;
}): Promise<void> {
  const { localImage, arImageUri, arHost, accessToken, workDir, runCmd, env } = opts;

  // Login (retry once)
  const loginResult = await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password", accessToken, arHost], { cwd: workDir });
  if (loginResult.code !== 0) {
    await runCmd("docker", ["login", "-u", "oauth2accesstoken", "--password", accessToken, arHost], { cwd: workDir });
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
  try {
    const res = await fetchWithRetry(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/firewalls/${firewallName}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
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
  try {
    const res = await fetchWithRetry(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${region}/addresses/${addressName}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
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
  try {
    const res = await fetchWithRetry(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
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
  const { projectId, region, resName, accessToken, appendLog } = opts;

  // Try to delete instance first (it holds a reference to the static IP)
  // We don't know the exact zone, so find it via aggregated list
  try {
    const listRes = await fetchWithRetry(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/instances?filter=name="${resName}"`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (listRes.ok) {
      const data = await listRes.json() as { items?: Record<string, { instances?: Array<{ zone: string; name: string }> }> };
      for (const [scopeKey, scope] of Object.entries(data.items || {})) {
        for (const inst of scope.instances || []) {
          if (inst.name === resName) {
            const zone = scopeKey.replace("zones/", "");
            await appendLog(`ℹ Deleting orphaned instance ${resName} in ${zone}...`);
            await deleteGcpInstance(projectId, zone, resName, accessToken);
            // Wait a bit for the instance to release the IP
            await new Promise((r) => setTimeout(r, 10_000));
          }
        }
      }
    }
  } catch {
    // Instance may not exist, that's fine
  }

  // Delete firewall rule
  await appendLog(`ℹ Deleting orphaned firewall ${resName}-fw...`);
  await deleteGcpFirewall(projectId, `${resName}-fw`, accessToken);

  // Delete static IP
  await appendLog(`ℹ Deleting orphaned address ${resName}-ip...`);
  await deleteGcpAddress(projectId, region, `${resName}-ip`, accessToken);

  // Give GCP a moment to fully release the resources
  await new Promise((r) => setTimeout(r, 5_000));
}

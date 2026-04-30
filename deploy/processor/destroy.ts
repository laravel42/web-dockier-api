/**
 * Deployment destroy orchestrator.
 *
 * Contains all destroy logic extracted from deploy/endpoints/deployments.ts.
 * Handles Pulumi-based destroys (GCP, AWS with state), GCP no-state API cleanup,
 * and AWS CloudFormation + ECR + S3 cleanup.
 */

import { db, extractRegionFromScript } from "../shared";
import { getGcpAccessToken, getGcpProjectId } from "./gcp-helpers";
import { runCmd } from "./run-cmd";
import { setupPulumiWorkspace } from "./pulumi-workspace";

// ─── Types ─────────────────────────────────────────────────────────

export interface DestroyOpts {
  deploymentId: string;
  providerRow: { provider: string; region: string; api_key: string; api_secret: string };
  deploymentRow: { repo: string; deploy_strategy: string; docker_image: string };
}

export interface DestroyResult {
  success: boolean;
  message: string;
}

// ─── Main Orchestrator ─────────────────────────────────────────────

export async function destroy(opts: DestroyOpts): Promise<DestroyResult> {
  const { deploymentId, providerRow, deploymentRow } = opts;

  const repoName = deploymentRow.repo.split("/").pop() || "app";
  const rawAppName = deploymentRow.docker_image
    ? deploymentRow.docker_image.split(":")[0]
    : repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const appName = rawAppName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const region = providerRow.region || "us-east-1";
  const errors: string[] = [];

  const tofuRow = await db.queryRow<{ tofu_script: string }>`
    SELECT tofu_script FROM deployments WHERE id = ${deploymentId}`;
  const tofuScript = tofuRow?.tofu_script || "";
  const stateMarker = tofuScript.indexOf("/* STATE */\n");

  // Clean up local Docker image to prevent stale image reuse on next deploy
  if (deploymentRow.docker_image) {
    try {
      const { execSync } = await import("node:child_process");
      execSync(`docker rmi ${JSON.stringify(deploymentRow.docker_image)} 2>/dev/null`, { timeout: 15_000, stdio: "pipe" });
    } catch {}
  }

  // Pulumi-based providers (GCP, AWS with saved Pulumi state)
  if (providerRow.provider !== "aws" || stateMarker !== -1) {
    if (stateMarker === -1) {
      return destroyGcpNoState(deploymentId, providerRow, deploymentRow, repoName, tofuScript);
    }
    return destroyWithPulumiState(deploymentId, providerRow, deploymentRow, repoName, tofuScript, stateMarker, region, errors);
  }

  // AWS-specific destroy (CloudFormation pipeline)
  return destroyAwsResources(deploymentId, providerRow, appName, region, errors);
}

// ─── Helpers ───────────────────────────────────────────────────────

function destroyTs(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function markDestroyed(deploymentId: string, logMessage: string): Promise<void> {
  await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', tofu_script = '', docker_image = '', logs = logs || ${logMessage}, updated_at = NOW() WHERE id = ${deploymentId}`;
}

// ─── GCP No-State Destroy ──────────────────────────────────────────

async function destroyGcpNoState(
  deploymentId: string,
  providerRow: { provider: string; region: string; api_key: string; api_secret: string },
  row: { deploy_strategy: string },
  repoName: string,
  tofuScript: string,
): Promise<DestroyResult> {
  if (providerRow.provider === "gcp" && row.deploy_strategy === "managed") {
    return destroyGcpManagedNoState(deploymentId, providerRow, repoName, tofuScript);
  }
  if (providerRow.provider === "gcp" && row.deploy_strategy === "static") {
    return destroyGcpStaticNoState(deploymentId, providerRow, tofuScript);
  }

  const t = destroyTs();
  await markDestroyed(deploymentId, `\n[${t}] ⚠ No Pulumi state found — marked as destroyed but resources may still exist in cloud`);
  return { success: true, message: "Marked as destroyed (no Pulumi state to clean up)" };
}

async function destroyGcpManagedNoState(
  deploymentId: string,
  providerRow: { region: string; api_key: string },
  repoName: string,
  tofuScript: string,
): Promise<DestroyResult> {
  const noStateErrors: string[] = [];
  try {
    const gcpProjectId = getGcpProjectId(providerRow.api_key);
    const accessToken = await getGcpAccessToken(providerRow.api_key);

    if (accessToken && gcpProjectId) {
      const arRepo = repoName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
      const arRegion = extractRegionFromScript(tofuScript) || providerRow.region || "us-central1";
      const serviceNameMatch = tofuScript.match(/new gcp\.cloudrunv2\.Service\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
      const serviceName = serviceNameMatch?.[1] || arRepo;
      const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

      try {
        const res = await fetch(`https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${arRegion}/services/${serviceName}`, { method: "DELETE", headers: authHeaders });
        if (!res.ok && res.status !== 404) noStateErrors.push(`Cloud Run delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
      } catch (e: any) { noStateErrors.push(`Cloud Run delete: ${e.message}`); }

      const dbMatch = tofuScript.match(/new gcp\.sql\.DatabaseInstance\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
      if (dbMatch) {
        try {
          const res = await fetch(`https://sqladmin.googleapis.com/v1/projects/${gcpProjectId}/instances/${dbMatch[1]}`, { method: "DELETE", headers: authHeaders });
          if (!res.ok && res.status !== 404) noStateErrors.push(`Cloud SQL delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
        } catch (e: any) { noStateErrors.push(`Cloud SQL delete: ${e.message}`); }
      }

      await deleteGcsBucket(tofuScript, gcpProjectId, authHeaders, noStateErrors, /new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);

      try {
        const res = await fetch(`https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories/${arRepo}`, { method: "DELETE", headers: authHeaders });
        if (!res.ok && res.status !== 404) noStateErrors.push(`AR repo delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
      } catch (e: any) { noStateErrors.push(`AR repo delete: ${e.message}`); }
    }
  } catch (e: any) { noStateErrors.push(`GCP cleanup: ${e.message}`); }

  const t = destroyTs();
  const log = noStateErrors.length > 0
    ? `\n[${t}] ⚠ No Pulumi state — direct API cleanup attempted. Errors: ${noStateErrors.join("; ")}`
    : `\n[${t}] ✓ No Pulumi state — Cloud Run resources destroyed via direct API`;
  await markDestroyed(deploymentId, log);
  return {
    success: noStateErrors.length === 0,
    message: noStateErrors.length > 0 ? `Partially destroyed: ${noStateErrors.join("; ")}` : "Cloud Run resources destroyed via direct GCP API",
  };
}

async function destroyGcpStaticNoState(
  deploymentId: string,
  providerRow: { region: string; api_key: string },
  tofuScript: string,
): Promise<DestroyResult> {
  const noStateErrors: string[] = [];
  try {
    const gcpProjectId = getGcpProjectId(providerRow.api_key);
    const accessToken = await getGcpAccessToken(providerRow.api_key);

    if (accessToken && gcpProjectId) {
      const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

      const bucketPattern = /new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*`([^`]+)`/s;
      const bucketPatternAlt = /new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s;
      await deleteGcsBucket(tofuScript, gcpProjectId, authHeaders, noStateErrors, bucketPattern, bucketPatternAlt);

      const resourceNames = [
        { type: "globalForwardingRules", match: tofuScript.match(/new gcp\.compute\.GlobalForwardingRule\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "targetHttpProxies", match: tofuScript.match(/new gcp\.compute\.TargetHttpProxy\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "urlMaps", match: tofuScript.match(/new gcp\.compute\.URLMap\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "backendBuckets", match: tofuScript.match(/new gcp\.compute\.BackendBucket\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "globalAddresses", match: tofuScript.match(/new gcp\.compute\.GlobalAddress\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
      ];
      for (const { type, match } of resourceNames) {
        if (match) {
          let name = match[1] || match[2] || "";
          name = name.replace(/\$\{[^}]+\}/g, "").replace(/-+$/, "");
          if (!name) continue;
          try {
            const listRes = await fetch(`https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/${type}`, { headers: authHeaders });
            if (listRes.ok) {
              const listData = await listRes.json() as { items?: { name: string }[] };
              const matching = (listData.items || []).filter((r: { name: string }) => r.name.startsWith(name));
              for (const r of matching) {
                const delRes = await fetch(`https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/${type}/${r.name}`, { method: "DELETE", headers: authHeaders });
                if (!delRes.ok && delRes.status !== 404) noStateErrors.push(`${type} delete ${r.name}: ${(await delRes.text()).slice(0, 150)}`);
                await new Promise(r => setTimeout(r, 2_000));
              }
            }
          } catch (e: any) { noStateErrors.push(`${type} delete: ${e.message}`); }
        }
      }
    }
  } catch (e: any) { noStateErrors.push(`GCP static cleanup: ${e.message}`); }

  const t = destroyTs();
  const log = noStateErrors.length > 0
    ? `\n[${t}] ⚠ No Pulumi state — direct API cleanup attempted. Errors: ${noStateErrors.join("; ")}`
    : `\n[${t}] ✓ No Pulumi state — Cloud Storage + CDN resources destroyed via direct API`;
  await markDestroyed(deploymentId, log);
  return {
    success: noStateErrors.length === 0,
    message: noStateErrors.length > 0 ? `Partially destroyed: ${noStateErrors.join("; ")}` : "Cloud Storage + CDN resources destroyed via direct GCP API",
  };
}

// ─── GCS Bucket Cleanup ────────────────────────────────────────────

async function deleteGcsBucket(
  tofuScript: string,
  _gcpProjectId: string,
  authHeaders: Record<string, string>,
  errors: string[],
  ...patterns: RegExp[]
): Promise<void> {
  let bucketName: string | null = null;
  for (const pattern of patterns) {
    const match = tofuScript.match(pattern);
    if (match) { bucketName = match[1]; break; }
  }
  if (!bucketName) return;

  try {
    const listRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o`, { headers: authHeaders });
    if (listRes.ok) {
      const objData = await listRes.json() as { items?: { name: string }[] };
      for (const obj of objData.items || []) {
        await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(obj.name)}`, { method: "DELETE", headers: authHeaders });
      }
    }
    const deleteRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, { method: "DELETE", headers: authHeaders });
    if (!deleteRes.ok && deleteRes.status !== 404) {
      errors.push(`Bucket delete: ${(await deleteRes.text()).slice(0, 150)}`);
    }
  } catch (e: any) { errors.push(`Bucket delete: ${e.message}`); }
}

// ─── Pulumi State Destroy ──────────────────────────────────────────

async function destroyWithPulumiState(
  deploymentId: string,
  providerRow: { provider: string; region: string; api_key: string; api_secret: string },
  row: { repo: string; deploy_strategy: string },
  repoName: string,
  tofuScript: string,
  stateMarker: number,
  _region: string,
  errors: string[],
): Promise<DestroyResult> {
  const savedState = tofuScript.slice(stateMarker + "/* STATE */\n".length);
  const pulumiScript = tofuScript.slice(0, stateMarker).trim();

  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const workDir = await mkdtemp(join(tmpdir(), `destroy-${deploymentId.slice(0, 8)}-`));

  try {
    const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
      workDir, appName: repoName, provider: providerRow.provider,
      region: providerRow.region || "us-east-1", providerRow, indexTs: pulumiScript,
    });

    await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });

    const stackName = `destroy-${deploymentId.slice(0, 8)}`;
    await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

    if (providerRow.provider === "gcp") {
      const gcpProjectId = getGcpProjectId(providerRow.api_key);
      if (gcpProjectId) await runCmd("pulumi", ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }

    const stateFile = join(pulumiDir, "state.json");
    await writeFile(stateFile, savedState, "utf-8");
    const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--force", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
    if (importResult.code !== 0) {
      errors.push(`State import failed: ${importResult.output.split("\n").slice(-3).join(" ")}`);
    } else {
      const destroyResult = await runCmd("pulumi", ["destroy", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
      if (destroyResult.code !== 0) {
        errors.push(`Pulumi destroy failed: ${destroyResult.output.split("\n").filter(l => l.includes("error")).slice(-3).join(" ")}`);
      }
    }

    // GCP Cloud Run: clean up Artifact Registry images & repo via API
    if (providerRow.provider === "gcp" && row.deploy_strategy === "managed") {
      try {
        const gcpProjectId = getGcpProjectId(providerRow.api_key);
        const accessToken = await getGcpAccessToken(providerRow.api_key);
        if (accessToken && gcpProjectId) {
          const arRepo = repoName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
          const arRegion = extractRegionFromScript(pulumiScript) || providerRow.region || "us-central1";
          const arBase = `https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories/${arRepo}`;
          try {
            const listRes = await fetch(`${arBase}/dockerImages`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (listRes.ok) {
              const listData = await listRes.json() as { dockerImages?: { name: string; tags: string[] }[] };
              for (const img of listData.dockerImages || []) {
                try { await fetch(`https://artifactregistry.googleapis.com/v1/${img.name}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }); } catch {}
              }
            }
          } catch {}
          try {
            const deleteRes = await fetch(arBase, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
            if (!deleteRes.ok && deleteRes.status !== 404) errors.push(`AR repo delete: ${deleteRes.status} ${(await deleteRes.text()).slice(0, 150)}`);
          } catch (e: any) { errors.push(`AR repo delete: ${e.message}`); }
        }
      } catch (e: any) { errors.push(`GCP Cloud Run cleanup: ${e.message}`); }
    }
  } catch (e: any) {
    errors.push(e.message || "Unknown error during destroy");
  } finally {
    try { await rm(workDir, { recursive: true, force: true }); } catch {}
  }

  const t = destroyTs();
  const log = errors.length > 0
    ? `\n[${t}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
    : `\n[${t}] ✓ Infrastructure destroyed via Pulumi`;
  await markDestroyed(deploymentId, log);

  if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
  return { success: true, message: "Infrastructure destroyed via Pulumi." };
}

// ─── AWS Destroy ───────────────────────────────────────────────────

async function destroyAwsResources(
  deploymentId: string,
  providerRow: { api_key: string; api_secret: string },
  appName: string,
  region: string,
  errors: string[],
): Promise<DestroyResult> {
  const credentials = { accessKeyId: providerRow.api_key, secretAccessKey: providerRow.api_secret };
  const stackName = `image-builder-app-${appName}`;

  try {
    const { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });
    try {
      await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    } catch (e: any) { if (!e.message?.includes("does not exist")) throw e; }
  } catch (e: any) { errors.push(`CloudFormation: ${e.message}`); }

  await deleteEcrRepo(appName, region, credentials, errors);
  await deleteEcrRepo(`${appName}-cache`, region, credentials, []);

  try {
    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region, credentials });
    const bucketName = `${appName}-static-site`;
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucketName }));
    if (listed.Contents && listed.Contents.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: listed.Contents.map(o => ({ Key: o.Key! })) } }));
    }
    await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
  } catch {}

  const t = destroyTs();
  const log = errors.length > 0
    ? `\n[${t}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
    : `\n[${t}] ✓ Infrastructure destroyed (stack: ${stackName}, ECR: ${appName})`;
  await markDestroyed(deploymentId, log);

  if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
  return { success: true, message: `Destroyed stack ${stackName}, ECR repo ${appName}.` };
}

async function deleteEcrRepo(
  repoName: string,
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string },
  errors: string[],
): Promise<void> {
  try {
    const { ECRClient, DeleteRepositoryCommand, BatchDeleteImageCommand, ListImagesCommand } = await import("@aws-sdk/client-ecr");
    const ecr = new ECRClient({ region, credentials });
    try {
      const listed = await ecr.send(new ListImagesCommand({ repositoryName: repoName }));
      if (listed.imageIds && listed.imageIds.length > 0) {
        await ecr.send(new BatchDeleteImageCommand({ repositoryName: repoName, imageIds: listed.imageIds }));
      }
    } catch {}
    await ecr.send(new DeleteRepositoryCommand({ repositoryName: repoName, force: true }));
  } catch (e: any) {
    if (!e.name?.includes("RepositoryNotFoundException")) errors.push(`ECR: ${e.message}`);
  }
}

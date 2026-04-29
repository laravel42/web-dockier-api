import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, deployTopic, type Deployment, type DeploymentRow, rowToDeployment, extractRegionFromScript } from "../shared";
import { getGcpAccessToken, getGcpProjectId } from "../processor/gcp-helpers";
import { runCmd } from "../processor/run-cmd";
import { setupPulumiWorkspace } from "../processor/pulumi-workspace";

export const createDeployment = api(
  { expose: true, method: "POST", path: "/deploy/deployments", auth: true },
  async (params: {
    providerId: string;
    gitConnectionId: string;
    projectId?: string;
    repo: string;
    branch: string;
    tofuScript?: string;
    techStack?: string[];
    primaryLanguage?: string;
    registryUrl?: string;
    deployStrategy?: string;
    buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
    skipPipeline?: boolean;
    templateId?: string;
    envVars?: Array<{ name: string; value: string }>;
    services?: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  }): Promise<Deployment> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const script = params.tofuScript || "";

    await db.exec`
      INSERT INTO deployments (id, app_id, provider_id, git_connection_id, project_id, repo, branch, status, logs, tofu_script, deploy_strategy, created_at, updated_at)
      VALUES (${id}, ${authData.appId}, ${params.providerId}, ${params.gitConnectionId},
              ${params.projectId || ""}, ${params.repo}, ${params.branch}, 'pending', '', ${script}, ${params.deployStrategy || "managed"}, NOW(), NOW())`;

    if (!params.skipPipeline) {
      await deployTopic.publish({
        deploymentId: id,
        appId: authData.appId,
        providerId: params.providerId,
        gitConnectionId: params.gitConnectionId,
        projectId: params.projectId || "",
        repo: params.repo,
        branch: params.branch,
        tofuScript: script,
        techStack: params.techStack || [],
        primaryLanguage: params.primaryLanguage || "",
        registryUrl: params.registryUrl || "",
        deployStrategy: params.deployStrategy || "managed",
        buildMethod: params.buildMethod || "dockerfile",
        templateId: params.templateId || undefined,
        envVars: params.envVars || undefined,
        services: params.services || undefined,
      });
    }

    return {
      id, providerId: params.providerId,
      gitConnectionId: params.gitConnectionId, projectId: params.projectId || "",
      repo: params.repo,
      branch: params.branch, status: "pending", logs: "", appUrl: "",
      commitHash: "", dockerImage: "", deployStrategy: params.deployStrategy || "managed",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

export const listDeployments = api(
  { expose: true, method: "GET", path: "/deploy/deployments", auth: true },
  async (params: { providerId?: string }): Promise<{ deployments: Deployment[] }> => {
    const authData = getAuthData()!;
    const rows = params.providerId
      ? db.query<DeploymentRow>`SELECT * FROM deployments WHERE app_id = ${authData.appId} AND provider_id = ${params.providerId} ORDER BY created_at DESC LIMIT 50`
      : db.query<DeploymentRow>`SELECT * FROM deployments WHERE app_id = ${authData.appId} ORDER BY created_at DESC LIMIT 50`;

    const deployments: Deployment[] = [];
    for await (const row of rows) {
      deployments.push(rowToDeployment(row));
    }
    return { deployments };
  }
);

export const getDeployment = api(
  { expose: true, method: "GET", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: { deploymentId: string }): Promise<Deployment> => {
    const row = await db.queryRow<DeploymentRow>`SELECT * FROM deployments WHERE id = ${params.deploymentId}`;
    if (!row) throw APIError.notFound("Deployment not found");
    return rowToDeployment(row);
  }
);

export const updateDeployment = api(
  { expose: true, method: "PUT", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: {
    deploymentId: string;
    status?: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
    logs?: string;
    appUrl?: string;
  }): Promise<{ ok: boolean }> => {
    // Build a single update to avoid multiple round-trips and ensure atomicity
    const sets: string[] = [];
    const values: any[] = [];
    if (params.status) { sets.push("status"); values.push(params.status); }
    if (params.logs) { sets.push("logs"); values.push(params.logs); }
    if (params.appUrl) { sets.push("app_url"); values.push(params.appUrl); }
    if (sets.length === 0) return { ok: true };

    // Since Encore's SQL template tags don't support dynamic column lists,
    // we handle each combination but in a single query
    if (params.status && params.logs && params.appUrl) {
      await db.exec`UPDATE deployments SET status = ${params.status}, logs = ${params.logs}, app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.status && params.logs) {
      await db.exec`UPDATE deployments SET status = ${params.status}, logs = ${params.logs}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.status && params.appUrl) {
      await db.exec`UPDATE deployments SET status = ${params.status}, app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.logs && params.appUrl) {
      await db.exec`UPDATE deployments SET logs = ${params.logs}, app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.status) {
      await db.exec`UPDATE deployments SET status = ${params.status}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.logs) {
      await db.exec`UPDATE deployments SET logs = ${params.logs}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    } else if (params.appUrl) {
      await db.exec`UPDATE deployments SET app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    }
    return { ok: true };
  }
);

export const destroyDeployment = api(
  { expose: true, method: "POST", path: "/deploy/deployments/:deploymentId/destroy", auth: true },
  async (params: { deploymentId: string }): Promise<{ success: boolean; message: string }> => {
    const authData = getAuthData()!;
    const row = await db.queryRow<{
      id: string; app_id: string; provider_id: string; repo: string; deploy_strategy: string; docker_image: string;
    }>`SELECT id, app_id, provider_id, repo, deploy_strategy, docker_image FROM deployments WHERE id = ${params.deploymentId}`;
    if (!row) throw APIError.notFound("Deployment not found");
    if (row.app_id !== authData.appId) throw APIError.permissionDenied("Not your deployment");

    const providerRow = await db.queryRow<{
      provider: string; region: string; api_key: string; api_secret: string;
    }>`SELECT provider, region, api_key, api_secret FROM server_providers WHERE id = ${row.provider_id}`;
    if (!providerRow) throw APIError.notFound("Provider not found");

    const repoName = row.repo.split("/").pop() || "app";
    const rawAppName = row.docker_image
      ? row.docker_image.split(":")[0]
      : repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const appName = rawAppName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const region = providerRow.region || "us-east-1";
    const errors: string[] = [];

    const tofuRow = await db.queryRow<{ tofu_script: string }>`
      SELECT tofu_script FROM deployments WHERE id = ${params.deploymentId}`;
    const tofuScript = tofuRow?.tofu_script || "";
    const stateMarker = tofuScript.indexOf("/* STATE */\n");

    // ── Pulumi-based providers (GCP, AWS with saved Pulumi state) ──
    if (providerRow.provider !== "aws" || stateMarker !== -1) {
      if (stateMarker === -1) {
        return destroyGcpNoState(params.deploymentId, providerRow, row, repoName, tofuScript);
      }
      return destroyWithPulumiState(params.deploymentId, providerRow, row, repoName, tofuScript, stateMarker, region, errors);
    }

    // ── AWS-specific destroy (CodeBuild pipeline) ──
    return destroyAwsResources(params.deploymentId, providerRow, appName, region, errors);
  }
);

// ─── Destroy Helpers ───

/** Timestamp for destroy logs. */
function destroyTs(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Mark deployment as destroyed in DB with a log message. */
async function markDestroyed(deploymentId: string, logMessage: string): Promise<void> {
  await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', tofu_script = '', logs = logs || ${logMessage}, updated_at = NOW() WHERE id = ${deploymentId}`;
}

/** GCP no-state destroy: clean up resources via direct API calls. */
async function destroyGcpNoState(
  deploymentId: string,
  providerRow: { provider: string; region: string; api_key: string; api_secret: string },
  row: { deploy_strategy: string },
  repoName: string,
  tofuScript: string
): Promise<{ success: boolean; message: string }> {
  if (providerRow.provider === "gcp" && row.deploy_strategy === "managed") {
    return destroyGcpManagedNoState(deploymentId, providerRow, repoName, tofuScript);
  }
  if (providerRow.provider === "gcp" && row.deploy_strategy === "static") {
    return destroyGcpStaticNoState(deploymentId, providerRow, tofuScript);
  }

  const ts = destroyTs();
  await markDestroyed(deploymentId, `\n[${ts}] ⚠ No Pulumi state found — marked as destroyed but resources may still exist in cloud`);
  return { success: true, message: "Marked as destroyed (no Pulumi state to clean up)" };
}

/** GCP Cloud Run no-state destroy. */
async function destroyGcpManagedNoState(
  deploymentId: string,
  providerRow: { region: string; api_key: string },
  repoName: string,
  tofuScript: string
): Promise<{ success: boolean; message: string }> {
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

      // 1. Delete Cloud Run service
      try {
        const res = await fetch(`https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${arRegion}/services/${serviceName}`, { method: "DELETE", headers: authHeaders });
        if (!res.ok && res.status !== 404) noStateErrors.push(`Cloud Run delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
      } catch (e: any) { noStateErrors.push(`Cloud Run delete: ${e.message}`); }

      // 2. Delete Cloud SQL instance (if present)
      const dbMatch = tofuScript.match(/new gcp\.sql\.DatabaseInstance\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
      if (dbMatch) {
        try {
          const res = await fetch(`https://sqladmin.googleapis.com/v1/projects/${gcpProjectId}/instances/${dbMatch[1]}`, { method: "DELETE", headers: authHeaders });
          if (!res.ok && res.status !== 404) noStateErrors.push(`Cloud SQL delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
        } catch (e: any) { noStateErrors.push(`Cloud SQL delete: ${e.message}`); }
      }

      // 3. Delete Cloud Storage bucket (if present)
      await deleteGcsBucket(tofuScript, gcpProjectId, authHeaders, noStateErrors, /new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);

      // 4. Delete Artifact Registry repository
      try {
        const res = await fetch(`https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories/${arRepo}`, { method: "DELETE", headers: authHeaders });
        if (!res.ok && res.status !== 404) noStateErrors.push(`AR repo delete: ${res.status} ${(await res.text()).slice(0, 150)}`);
      } catch (e: any) { noStateErrors.push(`AR repo delete: ${e.message}`); }
    }
  } catch (e: any) { noStateErrors.push(`GCP cleanup: ${e.message}`); }

  const ts = destroyTs();
  const log = noStateErrors.length > 0
    ? `\n[${ts}] ⚠ No Pulumi state — direct API cleanup attempted. Errors: ${noStateErrors.join("; ")}`
    : `\n[${ts}] ✓ No Pulumi state — Cloud Run resources destroyed via direct API`;
  await markDestroyed(deploymentId, log);
  return {
    success: noStateErrors.length === 0,
    message: noStateErrors.length > 0 ? `Partially destroyed: ${noStateErrors.join("; ")}` : "Cloud Run resources destroyed via direct GCP API",
  };
}

/** GCP Cloud Storage + CDN no-state destroy. */
async function destroyGcpStaticNoState(
  deploymentId: string,
  providerRow: { region: string; api_key: string },
  tofuScript: string
): Promise<{ success: boolean; message: string }> {
  const noStateErrors: string[] = [];
  try {
    const gcpProjectId = getGcpProjectId(providerRow.api_key);
    const accessToken = await getGcpAccessToken(providerRow.api_key);

    if (accessToken && gcpProjectId) {
      const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

      // 1. Delete Cloud Storage bucket
      const bucketPattern = /new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*`([^`]+)`/s;
      const bucketPatternAlt = /new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s;
      await deleteGcsBucket(tofuScript, gcpProjectId, authHeaders, noStateErrors, bucketPattern, bucketPatternAlt);

      // 2. Delete CDN / LB resources (match both "quoted" and `template` name patterns)
      const resourceNames = [
        { type: "globalForwardingRules", match: tofuScript.match(/new gcp\.compute\.GlobalForwardingRule\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "targetHttpProxies", match: tofuScript.match(/new gcp\.compute\.TargetHttpProxy\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "urlMaps", match: tofuScript.match(/new gcp\.compute\.URLMap\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "backendBuckets", match: tofuScript.match(/new gcp\.compute\.BackendBucket\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
        { type: "globalAddresses", match: tofuScript.match(/new gcp\.compute\.GlobalAddress\([^,]+,\s*\{[^}]*name:\s*(?:"([^"]+)"|`([^`]+)`)/s) },
      ];
      for (const { type, match } of resourceNames) {
        if (match) {
          // Use the first captured group (double-quoted) or second (template literal)
          let name = match[1] || match[2] || "";
          // Strip template expressions like ${suffix ? "-" + suffix : ""} to get the base name
          name = name.replace(/\$\{[^}]+\}/g, "").replace(/-+$/, "");
          if (!name) continue;

          // For template-based names, list matching resources via API since the suffix is dynamic
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

  const ts = destroyTs();
  const log = noStateErrors.length > 0
    ? `\n[${ts}] ⚠ No Pulumi state — direct API cleanup attempted. Errors: ${noStateErrors.join("; ")}`
    : `\n[${ts}] ✓ No Pulumi state — Cloud Storage + CDN resources destroyed via direct API`;
  await markDestroyed(deploymentId, log);
  return {
    success: noStateErrors.length === 0,
    message: noStateErrors.length > 0 ? `Partially destroyed: ${noStateErrors.join("; ")}` : "Cloud Storage + CDN resources destroyed via direct GCP API",
  };
}

/** Helper to empty and delete a GCS bucket found via regex in the tofu script. */
async function deleteGcsBucket(
  tofuScript: string,
  gcpProjectId: string,
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

/** Destroy with saved Pulumi state (works for both GCP and AWS Pulumi deploys). */
async function destroyWithPulumiState(
  deploymentId: string,
  providerRow: { provider: string; region: string; api_key: string; api_secret: string },
  row: { repo: string; deploy_strategy: string },
  repoName: string,
  tofuScript: string,
  stateMarker: number,
  region: string,
  errors: string[]
): Promise<{ success: boolean; message: string }> {
  const savedState = tofuScript.slice(stateMarker + "/* STATE */\n".length);
  const pulumiScript = tofuScript.slice(0, stateMarker).trim();

  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const workDir = await mkdtemp(join(tmpdir(), `destroy-${deploymentId.slice(0, 8)}-`));

  try {
    const { pulumiDir, providerEnv } = await setupPulumiWorkspace({
      workDir,
      appName: repoName,
      provider: providerRow.provider,
      region: providerRow.region || "us-east-1",
      providerRow,
      indexTs: pulumiScript,
    });

    await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });

    const stackName = `destroy-${deploymentId.slice(0, 8)}`;
    await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

    // Set GCP project if needed
    if (providerRow.provider === "gcp") {
      const gcpProjectId = getGcpProjectId(providerRow.api_key);
      if (gcpProjectId) await runCmd("pulumi", ["config", "set", "gcp:project", gcpProjectId, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
    }

    // Import saved state
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

          // Delete all Docker images
          try {
            const listRes = await fetch(`${arBase}/dockerImages`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (listRes.ok) {
              const listData = await listRes.json() as { dockerImages?: { name: string; tags: string[] }[] };
              for (const img of listData.dockerImages || []) {
                try { await fetch(`https://artifactregistry.googleapis.com/v1/${img.name}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }); } catch {}
              }
            }
          } catch {}

          // Delete the repository
          try {
            const deleteRes = await fetch(arBase, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
            if (!deleteRes.ok && deleteRes.status !== 404) {
              errors.push(`AR repo delete: ${deleteRes.status} ${(await deleteRes.text()).slice(0, 150)}`);
            }
          } catch (e: any) { errors.push(`AR repo delete: ${e.message}`); }
        }
      } catch (e: any) { errors.push(`GCP Cloud Run cleanup: ${e.message}`); }
    }
  } catch (e: any) {
    errors.push(e.message || "Unknown error during destroy");
  } finally {
    try { await rm(workDir, { recursive: true, force: true }); } catch {}
  }

  const ts = destroyTs();
  const log = errors.length > 0
    ? `\n[${ts}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
    : `\n[${ts}] ✓ Infrastructure destroyed via Pulumi`;
  await markDestroyed(deploymentId, log);

  if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
  return { success: true, message: "Infrastructure destroyed via Pulumi." };
}

/** AWS-specific destroy (CloudFormation + ECR + S3). */
async function destroyAwsResources(
  deploymentId: string,
  providerRow: { api_key: string; api_secret: string },
  appName: string,
  region: string,
  errors: string[]
): Promise<{ success: boolean; message: string }> {
  const credentials = { accessKeyId: providerRow.api_key, secretAccessKey: providerRow.api_secret };
  const stackName = `image-builder-app-${appName}`;

  // Delete CloudFormation stack
  try {
    const { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
    const cfn = new CloudFormationClient({ region, credentials });
    try {
      await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    } catch (e: any) { if (!e.message?.includes("does not exist")) throw e; }
  } catch (e: any) { errors.push(`CloudFormation: ${e.message}`); }

  // Delete ECR repos (main + cache)
  await deleteEcrRepo(appName, region, credentials, errors);
  await deleteEcrRepo(`${appName}-cache`, region, credentials, []);  // cache repo errors are non-critical

  // Delete S3 static site bucket
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

  const ts = destroyTs();
  const log = errors.length > 0
    ? `\n[${ts}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
    : `\n[${ts}] ✓ Infrastructure destroyed (stack: ${stackName}, ECR: ${appName})`;
  await markDestroyed(deploymentId, log);

  if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
  return { success: true, message: `Destroyed stack ${stackName}, ECR repo ${appName}.` };
}

/** Delete an ECR repository (empty images first). */
async function deleteEcrRepo(
  repoName: string,
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string },
  errors: string[]
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

import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, deployTopic, type Deployment } from "../shared";

export const createDeployment = api(
  { method: "POST", path: "/deploy/deployments", auth: true },
  async (params: {
    providerId: string;
    gitConnectionId: string;
    repo: string;
    branch: string;
    tofuScript?: string;
    techStack?: string[];
    primaryLanguage?: string;
    registryUrl?: string;
    deployStrategy?: string;
    buildMethod?: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
    skipPipeline?: boolean;
  }): Promise<Deployment> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const script = params.tofuScript || "";

    await db.exec`
      INSERT INTO deployments (id, app_id, provider_id, git_connection_id, repo, branch, status, logs, tofu_script, deploy_strategy, created_at, updated_at)
      VALUES (${id}, ${authData.appId}, ${params.providerId}, ${params.gitConnectionId},
              ${params.repo}, ${params.branch}, 'pending', '', ${script}, ${params.deployStrategy || "managed"}, NOW(), NOW())`;

    if (!params.skipPipeline) {
      await deployTopic.publish({
        deploymentId: id,
        appId: authData.appId,
        providerId: params.providerId,
        gitConnectionId: params.gitConnectionId,
        repo: params.repo,
        branch: params.branch,
        tofuScript: script,
        techStack: params.techStack || [],
        primaryLanguage: params.primaryLanguage || "",
        registryUrl: params.registryUrl || "",
        deployStrategy: params.deployStrategy || "managed",
        buildMethod: params.buildMethod || "dockerfile",
      });
    }

    return {
      id, providerId: params.providerId,
      gitConnectionId: params.gitConnectionId, repo: params.repo,
      branch: params.branch, status: "pending", logs: "", appUrl: "",
      commitHash: "", dockerImage: "", deployStrategy: params.deployStrategy || "managed",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }
);

export const listDeployments = api(
  { method: "GET", path: "/deploy/deployments", auth: true },
  async (params: { providerId?: string }): Promise<{ deployments: Deployment[] }> => {
    const authData = getAuthData()!;
    const rows = params.providerId
      ? db.query<{
          id: string; provider_id: string; git_connection_id: string;
          repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE app_id = ${authData.appId} AND provider_id = ${params.providerId} ORDER BY created_at DESC LIMIT 50`
      : db.query<{
          id: string; provider_id: string; git_connection_id: string;
          repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
        }>`SELECT * FROM deployments WHERE app_id = ${authData.appId} ORDER BY created_at DESC LIMIT 50`;

    const deployments: Deployment[] = [];
    for await (const row of rows) {
      deployments.push({
        id: row.id, providerId: row.provider_id,
        gitConnectionId: row.git_connection_id, repo: row.repo, branch: row.branch,
        status: row.status as Deployment["status"], logs: row.logs, appUrl: row.app_url,
        commitHash: row.commit_hash, dockerImage: row.docker_image,
        deployStrategy: row.deploy_strategy || "managed",
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      });
    }
    return { deployments };
  }
);

export const getDeployment = api(
  { method: "GET", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: { deploymentId: string }): Promise<Deployment> => {
    const row = await db.queryRow<{
      id: string; provider_id: string; git_connection_id: string;
      repo: string; branch: string; status: string; logs: string; app_url: string; commit_hash: string; docker_image: string; deploy_strategy: string; created_at: Date; updated_at: Date;
    }>`SELECT * FROM deployments WHERE id = ${params.deploymentId}`;
    if (!row) throw APIError.notFound("Deployment not found");
    return {
      id: row.id, providerId: row.provider_id,
      gitConnectionId: row.git_connection_id, repo: row.repo, branch: row.branch,
      status: row.status as Deployment["status"], logs: row.logs, appUrl: row.app_url,
      commitHash: row.commit_hash, dockerImage: row.docker_image,
      deployStrategy: row.deploy_strategy || "managed",
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  }
);

export const updateDeployment = api(
  { method: "PUT", path: "/deploy/deployments/:deploymentId", auth: true },
  async (params: {
    deploymentId: string;
    status?: "pending" | "building" | "deploying" | "success" | "failed" | "destroyed";
    logs?: string;
    appUrl?: string;
  }): Promise<{ ok: boolean }> => {
    if (params.status) await db.exec`UPDATE deployments SET status = ${params.status}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    if (params.logs) await db.exec`UPDATE deployments SET logs = ${params.logs}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    if (params.appUrl) await db.exec`UPDATE deployments SET app_url = ${params.appUrl}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
    return { ok: true };
  }
);

export const destroyDeployment = api(
  { method: "POST", path: "/deploy/deployments/:deploymentId/destroy", auth: true },
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
    const appName = row.docker_image || repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
    const region = providerRow.region || "us-east-1";
    const errors: string[] = [];

    // ── Pulumi-based providers (GCP, Hetzner, DigitalOcean, Vultr, Linode, etc.) ──
    if (providerRow.provider !== "aws") {
      const tofuRow = await db.queryRow<{ tofu_script: string }>`
        SELECT tofu_script FROM deployments WHERE id = ${params.deploymentId}`;
      const tofuScript = tofuRow?.tofu_script || "";
      const stateMarker = tofuScript.indexOf("/* STATE */\n");

      if (stateMarker === -1) {
        // No saved state — can't run pulumi destroy
        // For GCP Cloud Run, try to clean up all resources via direct API calls
        if (providerRow.provider === "gcp" && row.deploy_strategy === "managed") {
          const noStateErrors: string[] = [];
          try {
            const saKey = JSON.parse(providerRow.api_key || "{}");
            const gcpProjectId = saKey.project_id || "";
            if (gcpProjectId && saKey.client_email && saKey.private_key) {
              const { createSign } = await import("node:crypto");
              const now = Math.floor(Date.now() / 1000);
              const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
              const jwtClaim = Buffer.from(JSON.stringify({
                iss: saKey.client_email,
                scope: "https://www.googleapis.com/auth/cloud-platform",
                aud: "https://oauth2.googleapis.com/token",
                iat: now, exp: now + 3600,
              })).toString("base64url");
              const signInput = `${jwtHeader}.${jwtClaim}`;
              const signer = createSign("RSA-SHA256");
              signer.update(signInput);
              const signature = signer.sign(saKey.private_key, "base64url");
              const accessToken = ((await (await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signInput}.${signature}`,
              })).json()) as { access_token?: string }).access_token || "";

              if (accessToken) {
                const arRepo = repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
                let arRegion = providerRow.region || "us-central1";
                const regionMatch = tofuScript.match(/config\.get\("region"\)\s*\|\|\s*"([^"]+)"/);
                if (regionMatch) arRegion = regionMatch[1];

                // Extract the Cloud Run service name from the Pulumi script
                const serviceNameMatch = tofuScript.match(/new gcp\.cloudrunv2\.Service\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
                const serviceName = serviceNameMatch?.[1] || arRepo;

                const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

                // 1. Delete Cloud Run service
                try {
                  const deleteServiceRes = await fetch(
                    `https://run.googleapis.com/v2/projects/${gcpProjectId}/locations/${arRegion}/services/${serviceName}`,
                    { method: "DELETE", headers: authHeaders }
                  );
                  if (deleteServiceRes.ok || deleteServiceRes.status === 404) {
                    noStateErrors.length; // no-op, success or already gone
                  } else {
                    const body = await deleteServiceRes.text();
                    noStateErrors.push(`Cloud Run delete: ${deleteServiceRes.status} ${body.slice(0, 150)}`);
                  }
                } catch (e: any) { noStateErrors.push(`Cloud Run delete: ${e.message}`); }

                // 2. Delete Cloud SQL instance (if present in script)
                const dbInstanceMatch = tofuScript.match(/new gcp\.sql\.DatabaseInstance\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
                if (dbInstanceMatch) {
                  try {
                    // Cloud SQL requires disabling deletion protection first, but our templates set it to false
                    const deleteDbRes = await fetch(
                      `https://sqladmin.googleapis.com/v1/projects/${gcpProjectId}/instances/${dbInstanceMatch[1]}`,
                      { method: "DELETE", headers: authHeaders }
                    );
                    if (!deleteDbRes.ok && deleteDbRes.status !== 404) {
                      const body = await deleteDbRes.text();
                      noStateErrors.push(`Cloud SQL delete: ${deleteDbRes.status} ${body.slice(0, 150)}`);
                    }
                  } catch (e: any) { noStateErrors.push(`Cloud SQL delete: ${e.message}`); }
                }

                // 3. Delete Cloud Storage bucket (if present in script)
                const bucketMatch = tofuScript.match(/new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
                if (bucketMatch) {
                  try {
                    // List and delete all objects first
                    const listObjRes = await fetch(
                      `https://storage.googleapis.com/storage/v1/b/${bucketMatch[1]}/o`,
                      { headers: authHeaders }
                    );
                    if (listObjRes.ok) {
                      const objData = await listObjRes.json() as { items?: { name: string }[] };
                      for (const obj of objData.items || []) {
                        await fetch(
                          `https://storage.googleapis.com/storage/v1/b/${bucketMatch[1]}/o/${encodeURIComponent(obj.name)}`,
                          { method: "DELETE", headers: authHeaders }
                        );
                      }
                    }
                    const deleteBucketRes = await fetch(
                      `https://storage.googleapis.com/storage/v1/b/${bucketMatch[1]}`,
                      { method: "DELETE", headers: authHeaders }
                    );
                    if (!deleteBucketRes.ok && deleteBucketRes.status !== 404) {
                      const body = await deleteBucketRes.text();
                      noStateErrors.push(`Storage delete: ${deleteBucketRes.status} ${body.slice(0, 150)}`);
                    }
                  } catch (e: any) { noStateErrors.push(`Storage delete: ${e.message}`); }
                }

                // 4. Delete Artifact Registry repository
                try {
                  const arBase = `https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories/${arRepo}`;
                  const deleteArRes = await fetch(arBase, { method: "DELETE", headers: authHeaders });
                  if (!deleteArRes.ok && deleteArRes.status !== 404) {
                    const body = await deleteArRes.text();
                    noStateErrors.push(`AR repo delete: ${deleteArRes.status} ${body.slice(0, 150)}`);
                  }
                } catch (e: any) { noStateErrors.push(`AR repo delete: ${e.message}`); }
              }
            }
          } catch (e: any) { noStateErrors.push(`GCP cleanup: ${e.message}`); }

          const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
          const destroyLog = noStateErrors.length > 0
            ? `\n[${ts}] ⚠ No Pulumi state — direct API cleanup attempted. Errors: ${noStateErrors.join("; ")}`
            : `\n[${ts}] ✓ No Pulumi state — Cloud Run resources destroyed via direct API`;
          await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${destroyLog}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
          return { success: noStateErrors.length === 0, message: noStateErrors.length > 0 ? `Partially destroyed: ${noStateErrors.join("; ")}` : "Cloud Run resources destroyed via direct GCP API" };
        }

        // For GCP Cloud Storage + CDN, try to clean up via direct API calls
        if (providerRow.provider === "gcp" && row.deploy_strategy === "static") {
          const noStateErrors: string[] = [];
          try {
            const saKey = JSON.parse(providerRow.api_key || "{}");
            const gcpProjectId = saKey.project_id || "";
            if (gcpProjectId && saKey.client_email && saKey.private_key) {
              const { createSign } = await import("node:crypto");
              const now = Math.floor(Date.now() / 1000);
              const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
              const jwtClaim = Buffer.from(JSON.stringify({
                iss: saKey.client_email,
                scope: "https://www.googleapis.com/auth/cloud-platform",
                aud: "https://oauth2.googleapis.com/token",
                iat: now, exp: now + 3600,
              })).toString("base64url");
              const signInput = `${jwtHeader}.${jwtClaim}`;
              const signer = createSign("RSA-SHA256");
              signer.update(signInput);
              const signature = signer.sign(saKey.private_key, "base64url");
              const accessToken = ((await (await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signInput}.${signature}`,
              })).json()) as { access_token?: string }).access_token || "";

              if (accessToken) {
                const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

                // 1. Delete Cloud Storage bucket (empty it first)
                const bucketMatch = tofuScript.match(/new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*`([^`]+)`/s)
                  || tofuScript.match(/new gcp\.storage\.Bucket\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s);
                if (bucketMatch) {
                  const bucketName = bucketMatch[1];
                  try {
                    const listObjRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o`, { headers: authHeaders });
                    if (listObjRes.ok) {
                      const objData = await listObjRes.json() as { items?: { name: string }[] };
                      for (const obj of objData.items || []) {
                        await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(obj.name)}`, { method: "DELETE", headers: authHeaders });
                      }
                    }
                    const deleteBucketRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, { method: "DELETE", headers: authHeaders });
                    if (!deleteBucketRes.ok && deleteBucketRes.status !== 404) {
                      noStateErrors.push(`Bucket delete: ${(await deleteBucketRes.text()).slice(0, 150)}`);
                    }
                  } catch (e: any) { noStateErrors.push(`Bucket delete: ${e.message}`); }
                }

                // 2. Delete CDN / LB resources (forwarding rule, proxy, url map, backend bucket, global IP)
                const resourceNames = [
                  { type: "globalForwardingRules", match: tofuScript.match(/new gcp\.compute\.GlobalForwardingRule\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s) },
                  { type: "targetHttpProxies", match: tofuScript.match(/new gcp\.compute\.TargetHttpProxy\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s) },
                  { type: "urlMaps", match: tofuScript.match(/new gcp\.compute\.URLMap\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s) },
                  { type: "backendBuckets", match: tofuScript.match(/new gcp\.compute\.BackendBucket\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s) },
                  { type: "globalAddresses", match: tofuScript.match(/new gcp\.compute\.GlobalAddress\([^,]+,\s*\{[^}]*name:\s*"([^"]+)"/s) },
                ];
                for (const { type, match } of resourceNames) {
                  if (match) {
                    try {
                      const deleteRes = await fetch(`https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/global/${type}/${match[1]}`, { method: "DELETE", headers: authHeaders });
                      if (!deleteRes.ok && deleteRes.status !== 404) {
                        noStateErrors.push(`${type} delete: ${(await deleteRes.text()).slice(0, 150)}`);
                      }
                      // Wait briefly between dependent resource deletions
                      await new Promise(r => setTimeout(r, 2_000));
                    } catch (e: any) { noStateErrors.push(`${type} delete: ${e.message}`); }
                  }
                }
              }
            }
          } catch (e: any) { noStateErrors.push(`GCP static cleanup: ${e.message}`); }

          const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
          const destroyLog = noStateErrors.length > 0
            ? `\n[${ts}] ⚠ No Pulumi state — direct API cleanup attempted. Errors: ${noStateErrors.join("; ")}`
            : `\n[${ts}] ✓ No Pulumi state — Cloud Storage + CDN resources destroyed via direct API`;
          await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${destroyLog}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
          return { success: noStateErrors.length === 0, message: noStateErrors.length > 0 ? `Partially destroyed: ${noStateErrors.join("; ")}` : "Cloud Storage + CDN resources destroyed via direct GCP API" };
        }

        const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
        await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${`\n[${ts}] ⚠ No Pulumi state found — marked as destroyed but resources may still exist in cloud`}, updated_at = NOW() WHERE id = ${params.deploymentId}`;
        return { success: true, message: "Marked as destroyed (no Pulumi state to clean up)" };
      }

      const savedState = tofuScript.slice(stateMarker + "/* STATE */\n".length);
      const pulumiScript = tofuScript.slice(0, stateMarker).trim();

      const { mkdtemp, writeFile, rm, mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { tmpdir, homedir } = await import("node:os");
      const { spawn } = await import("node:child_process");

      const pulumiHome = join(homedir(), ".pulumi", "bin");
      const pathSep = process.platform === "win32" ? ";" : ":";
      const extraPaths = process.platform === "win32"
        ? [pulumiHome, "C:\\Program Files\\Pulumi", "C:\\Program Files (x86)\\Pulumi"]
        : [pulumiHome, "/usr/local/bin"];
      const augmentedPath = [...extraPaths, process.env.PATH || ""].join(pathSep);

      const runCmd = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<{ code: number; output: string }> => {
        return new Promise((resolve) => {
          const proc = spawn(cmd, args, { cwd: opts?.cwd, env: { ...process.env, PATH: augmentedPath, ...opts?.env }, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
          let output = "";
          proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
          proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });
          proc.on("close", (code) => resolve({ code: code ?? 1, output }));
          proc.on("error", (err) => resolve({ code: 1, output: err.message }));
        });
      };

      const workDir = await mkdtemp(join(tmpdir(), `destroy-${params.deploymentId.slice(0, 8)}-`));
      const pulumiDir = join(workDir, "pulumi");
      await mkdir(pulumiDir, { recursive: true });

      try {
        const { generatePulumiProject, generatePackageJson, generateTsConfig } = await import("../pulumi-templates/index");
        await writeFile(join(pulumiDir, "index.ts"), pulumiScript, "utf-8");
        await writeFile(join(pulumiDir, "Pulumi.yaml"), generatePulumiProject(repoName, providerRow.provider), "utf-8");
        await writeFile(join(pulumiDir, "package.json"), generatePackageJson(repoName, providerRow.provider), "utf-8");
        await writeFile(join(pulumiDir, "tsconfig.json"), generateTsConfig(), "utf-8");

        // Provider env vars
        const providerEnv: Record<string, string> = {};
        if (providerRow.provider === "digitalocean") providerEnv.DIGITALOCEAN_TOKEN = providerRow.api_key || "";
        else if (providerRow.provider === "hetzner") providerEnv.HCLOUD_TOKEN = providerRow.api_key || "";
        else if (providerRow.provider === "vultr") providerEnv.VULTR_API_KEY = providerRow.api_key || "";
        else if (providerRow.provider === "linode") providerEnv.LINODE_TOKEN = providerRow.api_key || "";
        else if (providerRow.provider === "gcp") {
          const credPath = join(pulumiDir, "gcp-credentials.json");
          await writeFile(credPath, providerRow.api_key || "{}", "utf-8");
          providerEnv.GOOGLE_CREDENTIALS = providerRow.api_key || "";
          providerEnv.GOOGLE_APPLICATION_CREDENTIALS = credPath;
        }
        const stateDir = join(pulumiDir, ".pulumi-state");
        await mkdir(stateDir, { recursive: true });
        const stateUrl = process.platform === "win32"
          ? `file://${stateDir.replace(/\\/g, "/")}`
          : `file://${stateDir}`;
        providerEnv.PULUMI_BACKEND_URL = stateUrl;
        providerEnv.PULUMI_CONFIG_PASSPHRASE = "";

        // Install deps
        await runCmd("npm", ["install", "--no-audit", "--no-fund"], { cwd: pulumiDir, env: providerEnv });

        // Init stack and import state
        const stackName = `destroy-${params.deploymentId.slice(0, 8)}`;
        await runCmd("pulumi", ["stack", "init", stackName, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });

        // Set GCP project if needed
        if (providerRow.provider === "gcp") {
          try {
            const creds = JSON.parse(providerRow.api_key || "{}");
            if (creds.project_id) await runCmd("pulumi", ["config", "set", "gcp:project", creds.project_id, "--non-interactive"], { cwd: pulumiDir, env: providerEnv });
          } catch {}
        }

        // Import saved state
        const stateFile = join(pulumiDir, "state.json");
        await writeFile(stateFile, savedState, "utf-8");
        const importResult = await runCmd("pulumi", ["stack", "import", "--non-interactive", "--force", "--file", stateFile], { cwd: pulumiDir, env: providerEnv });
        if (importResult.code !== 0) {
          errors.push(`State import failed: ${importResult.output.split("\n").slice(-3).join(" ")}`);
        } else {
          // Run pulumi destroy
          const destroyResult = await runCmd("pulumi", ["destroy", "--yes", "--non-interactive", "--skip-preview"], { cwd: pulumiDir, env: providerEnv });
          if (destroyResult.code !== 0) {
            errors.push(`Pulumi destroy failed: ${destroyResult.output.split("\n").filter(l => l.includes("error")).slice(-3).join(" ")}`);
          }
        }

        // ── GCP Cloud Run: clean up Artifact Registry images & repo via API ──
        if (providerRow.provider === "gcp" && row.deploy_strategy === "managed") {
          try {
            const saKey = JSON.parse(providerRow.api_key || "{}");
            const gcpProjectId = saKey.project_id || "";
            if (gcpProjectId && saKey.client_email && saKey.private_key) {
              // Get access token from service account key
              const { createSign } = await import("node:crypto");
              const now = Math.floor(Date.now() / 1000);
              const jwtHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
              const jwtClaim = Buffer.from(JSON.stringify({
                iss: saKey.client_email,
                scope: "https://www.googleapis.com/auth/cloud-platform",
                aud: "https://oauth2.googleapis.com/token",
                iat: now, exp: now + 3600,
              })).toString("base64url");
              const signInput = `${jwtHeader}.${jwtClaim}`;
              const signer = createSign("RSA-SHA256");
              signer.update(signInput);
              const signature = signer.sign(saKey.private_key, "base64url");
              const jwt = `${signInput}.${signature}`;

              const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
              });
              const tokenData = await tokenRes.json() as { access_token?: string };
              const accessToken = tokenData.access_token || "";

              if (accessToken) {
                // Derive the AR repo name the same way the deploy processor does
                const arRepo = repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
                // Extract region from the Pulumi script
                let arRegion = providerRow.region || "us-central1";
                const regionMatch = pulumiScript.match(/config\.get\("region"\)\s*\|\|\s*"([^"]+)"/);
                if (regionMatch) arRegion = regionMatch[1];

                const arBase = `https://artifactregistry.googleapis.com/v1/projects/${gcpProjectId}/locations/${arRegion}/repositories/${arRepo}`;

                // List and delete all Docker images in the repo
                try {
                  const listRes = await fetch(`${arBase}/dockerImages`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                  });
                  if (listRes.ok) {
                    const listData = await listRes.json() as { dockerImages?: { name: string; tags: string[] }[] };
                    for (const img of listData.dockerImages || []) {
                      // Delete each tagged version (package version, not docker image)
                      // The name format is projects/P/locations/L/repositories/R/dockerImages/IMG@sha256:...
                      // We need to delete the underlying package versions
                      try {
                        await fetch(`https://artifactregistry.googleapis.com/v1/${img.name}`, {
                          method: "DELETE",
                          headers: { Authorization: `Bearer ${accessToken}` },
                        });
                      } catch {}
                    }
                  }
                } catch {}

                // Delete the Artifact Registry repository itself
                try {
                  const deleteRes = await fetch(arBase, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${accessToken}` },
                  });
                  if (!deleteRes.ok && deleteRes.status !== 404) {
                    const body = await deleteRes.text();
                    errors.push(`AR repo delete: ${deleteRes.status} ${body.slice(0, 150)}`);
                  }
                } catch (e: any) {
                  errors.push(`AR repo delete: ${e.message}`);
                }
              }
            }
          } catch (e: any) {
            errors.push(`GCP Cloud Run cleanup: ${e.message}`);
          }
        }
      } catch (e: any) {
        errors.push(e.message || "Unknown error during destroy");
      } finally {
        try { await rm(workDir, { recursive: true, force: true }); } catch {}
      }

      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      const destroyLog = errors.length > 0
        ? `\n[${ts}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
        : `\n[${ts}] ✓ Infrastructure destroyed via Pulumi`;
      await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${destroyLog}, updated_at = NOW() WHERE id = ${params.deploymentId}`;

      if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
      return { success: true, message: "Infrastructure destroyed via Pulumi." };
    }

    // ── AWS-specific destroy ──
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

    try {
      const { ECRClient, DeleteRepositoryCommand, BatchDeleteImageCommand, ListImagesCommand } = await import("@aws-sdk/client-ecr");
      const ecr = new ECRClient({ region, credentials });

      // Delete all images from the ECR repo before removing it
      try {
        const listed = await ecr.send(new ListImagesCommand({ repositoryName: appName }));
        if (listed.imageIds && listed.imageIds.length > 0) {
          await ecr.send(new BatchDeleteImageCommand({ repositoryName: appName, imageIds: listed.imageIds }));
        }
      } catch {}

      await ecr.send(new DeleteRepositoryCommand({ repositoryName: appName, force: true }));
    } catch (e: any) { if (!e.name?.includes("RepositoryNotFoundException")) errors.push(`ECR: ${e.message}`); }

    try {
      const { ECRClient, DeleteRepositoryCommand, BatchDeleteImageCommand, ListImagesCommand } = await import("@aws-sdk/client-ecr");
      const ecr = new ECRClient({ region, credentials });

      // Delete all images from the cache repo before removing it
      try {
        const listed = await ecr.send(new ListImagesCommand({ repositoryName: `${appName}-cache` }));
        if (listed.imageIds && listed.imageIds.length > 0) {
          await ecr.send(new BatchDeleteImageCommand({ repositoryName: `${appName}-cache`, imageIds: listed.imageIds }));
        }
      } catch {}

      await ecr.send(new DeleteRepositoryCommand({ repositoryName: `${appName}-cache`, force: true }));
    } catch {}

    // 4. Delete S3 static site bucket (for S3 + CloudFront deploys)
    try {
      const { S3Client, ListObjectsV2Command, DeleteObjectsCommand, DeleteBucketCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({ region, credentials });
      const bucketName = `${appName}-static-site`;
      // Empty the bucket first
      const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucketName }));
      if (listed.Contents && listed.Contents.length > 0) {
        await s3.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: listed.Contents.map(o => ({ Key: o.Key! })) } }));
      }
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
    } catch {}

    const destroyTs = new Date().toISOString().replace("T", " ").slice(0, 19);
    const destroyLog = errors.length > 0
      ? `\n[${destroyTs}] ⚠ Partially destroyed. Errors: ${errors.join("; ")}`
      : `\n[${destroyTs}] ✓ Infrastructure destroyed (stack: ${stackName}, ECR: ${appName})`;
    await db.exec`UPDATE deployments SET status = 'destroyed', app_url = '', logs = logs || ${destroyLog}, updated_at = NOW() WHERE id = ${params.deploymentId}`;

    if (errors.length > 0) return { success: false, message: `Partially destroyed. Errors: ${errors.join("; ")}` };
    return { success: true, message: `Destroyed stack ${stackName}, ECR repo ${appName}.` };
  }
);

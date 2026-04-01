import { db, DeployCallbackUrl, type DeployEvent } from "../shared";
import { git_integration } from "~encore/clients";
import { appendLog, ts, generateAwsBuildspec } from "./helpers";

type RunCmd = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<{ code: number; output: string }>;

export async function handleAwsDeploy(
  event: DeployEvent,
  ctx: {
    deploymentId: string;
    repoName: string;
    shortId: string;
    provider: string;
    region: string;
    providerRow: { api_key: string; api_secret: string; app_runner_connection_arn: string };
    repoDir: string;
    workDir: string;
    commitHash: string;
    repoConfig: { port: number; packageManager: string };
    writeFile: (path: string, data: string, enc: string) => Promise<void>;
    rm: (path: string, opts: { recursive: boolean; force: boolean }) => Promise<void>;
  }
) {
  const { deploymentId, repoName, repoDir, workDir, commitHash } = ctx;
  const { region } = ctx;

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── AWS Pipeline (CodeBuild → CloudFormation) ──`);

  const accessKeyId = ctx.providerRow.api_key || "";
  const secretAccessKey = ctx.providerRow.api_secret || "";
  if (!accessKeyId || !secretAccessKey) throw new Error("AWS credentials not configured on provider.");

  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const sts = new STSClient({ region, credentials: { accessKeyId, secretAccessKey } });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account || "";

  const codebuildProject = "image-builder";
  const imageRepoName = repoName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const cacheRepoName = `${imageRepoName}-cache`;
  const bucketName = `${codebuildProject}-source-${accountId}`;

  const buildspecContent = generateAwsBuildspec();
  await ctx.writeFile(`${repoDir}/buildspec.yml`, buildspecContent, "utf-8");

  await ctx.rm(`${repoDir}/.git`, { recursive: true, force: true });
  const { default: AdmZip } = await import("adm-zip");
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const zip = new AdmZip();
  const skipDirs = new Set(["node_modules", ".git", ".pnpm-store", ".turbo", ".cache", "__pycache__", ".venv", "venv", "vendor"]);
  const addDir = (dirPath: string, zipPrefix: string) => {
    const items = readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory() && skipDirs.has(item.name)) continue;
      const fullPath = join(dirPath, item.name);
      if (item.isDirectory()) addDir(fullPath, zipPrefix ? `${zipPrefix}/${item.name}` : item.name);
      else zip.addLocalFile(fullPath, zipPrefix || undefined);
    }
  };
  addDir(repoDir, "");
  const zipBuffer = zip.toBuffer();
  await appendLog(deploymentId, `[${ts()}] ℹ Source bundle: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  const s3Key = `${deploymentId}.zip`;
  await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: s3Key, Body: zipBuffer, ContentType: "application/zip" }));
  await appendLog(deploymentId, `[${ts()}] ✓ Source uploaded to S3 (${bucketName}/${s3Key})`);

  const deployTargetMap: Record<string, string> = { vps: "ec2", managed: "ecs", serverless: "apprunner" };
  const deployTarget = deployTargetMap[event.deployStrategy] || "ec2";
  const deployParams: Record<string, any> = { appName: repoName, containerPort: ctx.repoConfig.port || 3000 };
  if (deployTarget === "ecs") { deployParams.cpu = "512"; deployParams.memory = "1024"; }
  if (deployTarget === "ec2") { deployParams.instanceType = "t3.small"; }

  const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns");
  const sns = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });
  const buildRequestTopicArn = `arn:aws:sns:${region}:${accountId}:${codebuildProject}-build-request`;

  let callbackUrl = "";
  try { callbackUrl = DeployCallbackUrl(); } catch {}

  await sns.send(new PublishCommand({
    TopicArn: buildRequestTopicArn, Subject: "build-request",
    Message: JSON.stringify({
      buildId: deploymentId, sourceRepo: event.repo, sourceRef: event.branch, commitSha: commitHash,
      imageRepoName, cacheRepoName, s3Bucket: bucketName, s3Key, accountId, region, codebuildProject,
      deployTarget, deployParams, callbackUrl,
    }),
  }));
  await appendLog(deploymentId, `[${ts()}] ✓ Build queued (CodeBuild → ECR → CloudFormation)`);
  await appendLog(deploymentId, `[${ts()}] ℹ Deploy target: ${deployTarget}`);

  try { await ctx.rm(workDir, { recursive: true, force: true }); } catch {}

  await db.exec`UPDATE deployments SET status = 'deploying', docker_image = ${imageRepoName}, updated_at = NOW() WHERE id = ${deploymentId}`;
  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Handed off to AWS ───────────────`);
  await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild will build the image, push to ECR, then CloudFormation deploys infrastructure.`);

  // ── Poll CodeBuild + CloudFormation ──
  const { CodeBuildClient, ListBuildsForProjectCommand, BatchGetBuildsCommand } = await import("@aws-sdk/client-codebuild");
  const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
  const cbClient = new CodeBuildClient({ region, credentials: { accessKeyId, secretAccessKey } });
  const cfnClient = new CloudFormationClient({ region, credentials: { accessKeyId, secretAccessKey } });

  const cfnStackName = `${codebuildProject}-app-${repoName}`;
  let codebuildId = "";
  let buildSucceeded = false;

  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(r => setTimeout(r, 15_000));
    if (!codebuildId) {
      try {
        const listResult = await cbClient.send(new ListBuildsForProjectCommand({ projectName: codebuildProject, sortOrder: "DESCENDING" }));
        const buildIds = (listResult.ids || []).slice(0, 10);
        if (buildIds.length > 0) {
          const batchResult = await cbClient.send(new BatchGetBuildsCommand({ ids: buildIds }));
          const match = (batchResult.builds || []).find(b => (b.source?.location || "").includes(`${deploymentId}.zip`));
          if (match?.id) { codebuildId = match.id; await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild started: ${codebuildId}`); }
        }
      } catch {}
    }
    if (codebuildId) {
      try {
        const batchResult = await cbClient.send(new BatchGetBuildsCommand({ ids: [codebuildId] }));
        const cbBuild = batchResult.builds?.[0];
        if (cbBuild) {
          const cbStatus = cbBuild.buildStatus || "";
          if (cbStatus === "SUCCEEDED") { buildSucceeded = true; await appendLog(deploymentId, `[${ts()}] ✓ CodeBuild succeeded — image pushed to ECR`); break; }
          else if (["FAILED", "FAULT", "TIMED_OUT", "STOPPED"].includes(cbStatus)) {
            const reason = cbBuild.phases?.find(p => p.phaseStatus === "FAILED")?.contexts?.[0]?.message || cbStatus;
            await appendLog(deploymentId, `[${ts()}] ✗ CodeBuild failed: ${reason}`);
            await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
            return;
          } else if (attempt % 4 === 0) { await appendLog(deploymentId, `[${ts()}] ℹ CodeBuild: ${cbBuild.currentPhase || "QUEUED"}...`); }
        }
      } catch {}
    } else if (attempt % 4 === 0) { await appendLog(deploymentId, `[${ts()}] ℹ Waiting for CodeBuild to start...`); }
  }

  if (!buildSucceeded) {
    await appendLog(deploymentId, `[${ts()}] ⚠ CodeBuild did not complete within timeout`);
    await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
    return;
  }

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── CloudFormation Deploy ──────────`);

  let appUrl = "";
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(r => setTimeout(r, 15_000));
    try {
      const stackResult = await cfnClient.send(new DescribeStacksCommand({ StackName: cfnStackName }));
      const stack = stackResult.Stacks?.[0];
      if (!stack) { if (attempt % 4 === 0) await appendLog(deploymentId, `[${ts()}] ℹ Waiting for CloudFormation stack...`); continue; }
      const stackStatus = stack.StackStatus || "";
      if (stackStatus === "CREATE_COMPLETE" || stackStatus === "UPDATE_COMPLETE") {
        const outputs = Object.fromEntries((stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]));
        appUrl = outputs.AppUrl || "";
        await appendLog(deploymentId, `[${ts()}] ✓ CloudFormation stack: ${stackStatus}`);
        if (appUrl) await appendLog(deploymentId, `[${ts()}] ✓ App URL: ${appUrl}`);
        break;
      } else if (stackStatus.includes("ROLLBACK_COMPLETE") || stackStatus.includes("FAILED") || stackStatus === "DELETE_COMPLETE") {
        await appendLog(deploymentId, `[${ts()}] ✗ CloudFormation failed: ${stackStatus}`);
        await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
        return;
      } else if (attempt % 4 === 0) { await appendLog(deploymentId, `[${ts()}] ℹ CloudFormation: ${stackStatus}...`); }
    } catch { if (attempt % 4 === 0) await appendLog(deploymentId, `[${ts()}] ℹ Waiting for CloudFormation stack...`); }
  }

  await appendLog(deploymentId, `[${ts()}]`);
  await appendLog(deploymentId, `[${ts()}] ── Complete ───────────────────────`);
  await appendLog(deploymentId, `[${ts()}] ✓ Docker image: ${imageRepoName}`);
  await appendLog(deploymentId, `[${ts()}] ✓ Infrastructure deployed via CloudFormation`);
  if (appUrl) {
    await appendLog(deploymentId, `[${ts()}] ✓ Application URL: ${appUrl}`);
    await db.exec`UPDATE deployments SET status = 'success', app_url = ${appUrl}, updated_at = NOW() WHERE id = ${deploymentId}`;
  } else {
    await appendLog(deploymentId, `[${ts()}] ⚠ Could not determine app URL — check AWS console`);
    await db.exec`UPDATE deployments SET status = 'success', updated_at = NOW() WHERE id = ${deploymentId}`;
  }
}

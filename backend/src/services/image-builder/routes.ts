import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { buildCredentialsSchema, buildSchema } from "./schemas.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import type { Database } from "../../shared/supabase/types.js";
import { composeDeployingReason } from "./domain/orchestrator.js";
import { fetchBuildLogs, lookupCodeBuildId, refreshBuildStatus } from "./domain/aws-runtime.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { getAwsAccountId } from "../../lib/aws.js";
import { resolveAwsCredentials } from "../../lib/provider-credentials.js";
import { requireWebhookSignature } from "../../shared/security.js";
import { rowToBuild } from "./domain/mappers.js";
import {
  ImageBuilderError,
  createBuild,
  getBuild,
  listBuilds,
  cancelBuild,
  resolveImageByRevision,
} from "./domain/builds.js";

/**
 * Map domain error codes to Fastify HTTP errors.
 */
function throwDomainError(app: FastifyInstance, error: ImageBuilderError): never {
  const msg = error.message;
  app.log.error(error);
  switch (error.code) {
    case "not_found":
      throw app.httpErrors.notFound(msg);
    case "forbidden":
      throw app.httpErrors.forbidden(msg);
    case "bad_request":
      throw app.httpErrors.badRequest(msg);
    case "precondition_failed":
      throw app.httpErrors.preconditionFailed(msg);
    case "internal":
      throw app.httpErrors.internalServerError("An internal server error occurred");
    default:
      throw app.httpErrors.internalServerError("An unexpected error occurred");
  }
}

export async function registerImageBuilderRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const db = supabaseAdmin;

  typed.post(
    "/image-builder/builds",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_CREATE),
      schema: {
        tags: ["image-builder"],
        summary: "Start image build",
        body: z.object({
          sourceRepo: z.string().min(1),
          sourceRef: z.string().optional(),
          commitSha: z.string().optional(),
          imageRepo: z.string().optional(),
          dockerfilePath: z.string().optional(),
          buildContext: z.string().optional(),
          tags: z.array(z.string()).optional(),
          projectId: z.string().optional(),
          gitConnectionId: z.string().optional(),
          deployTarget: z.enum(["ecs", "ec2", "s3"]).optional(),
          providerId: z.string().optional(),
          credentials: buildCredentialsSchema.optional(),
          deployParams: z.record(z.string(), z.any()).optional(),
        }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        return await createBuild({
          tenantId: auth.tenantId,
          sourceRepo: request.body.sourceRepo,
          sourceRef: request.body.sourceRef,
          commitSha: request.body.commitSha,
          imageRepo: request.body.imageRepo,
          dockerfilePath: request.body.dockerfilePath,
          buildContext: request.body.buildContext,
          tags: request.body.tags,
          projectId: request.body.projectId,
          gitConnectionId: request.body.gitConnectionId,
          deployTarget: request.body.deployTarget,
          providerId: request.body.providerId,
          deployParams: request.body.deployParams,
        });
      } catch (err) {
        if (err instanceof ImageBuilderError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.get(
    "/image-builder/builds/:buildId",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Get build status",
        params: z.object({ buildId: z.string().uuid() }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      let row: any;
      try {
        row = await getBuild(request.params.buildId, auth.tenantId);
      } catch (err) {
        if (err instanceof ImageBuilderError) throwDomainError(app, err);
        throw err;
      }

      if (!row.codebuild_id && row.provider_id) {
        const credentials = await resolveAwsCredentials(row.provider_id);
        if (credentials) {
          const codebuildId = await lookupCodeBuildId(credentials, request.params.buildId);
          if (codebuildId) {
            await db.from("builds").update({ codebuild_id: codebuildId, updated_at: new Date().toISOString() }).eq("id", request.params.buildId);
            row = { ...row, codebuild_id: codebuildId };
          }
        }
      }
      if (row.codebuild_id && ["submitted", "in_progress", "pending"].includes(row.status)) {
        row = await refreshBuildStatus(row);
      }
      return rowToBuild(row);
    },
  );

  typed.get(
    "/image-builder/builds/:buildId/logs",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Get build logs",
        params: z.object({ buildId: z.string().uuid() }),
        querystring: z.object({ nextToken: z.string().optional() }),
        response: {
          200: z.object({ buildId: z.string().uuid(), logs: z.array(z.string()), nextToken: z.string().optional() }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db
        .from("builds")
        .select("id,organization_id,provider_id,codebuild_id,status,status_reason,updated_at")
        .eq("id", request.params.buildId)
        .single();
      if (error || !data) throw app.httpErrors.notFound("Build not found");
      if (data.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your build");
      let row = data;
      if (!row.codebuild_id && row.provider_id) {
        const credentials = await resolveAwsCredentials(row.provider_id);
        if (credentials) {
          const codebuildId = await lookupCodeBuildId(credentials, request.params.buildId);
          if (codebuildId) {
            await db.from("builds").update({ codebuild_id: codebuildId, updated_at: new Date().toISOString() }).eq("id", request.params.buildId);
            row = { ...row, codebuild_id: codebuildId };
          }
        }
      }
      const cloudwatch = await fetchBuildLogs(app, row, request.query.nextToken);
      return {
        buildId: request.params.buildId,
        logs: cloudwatch.logs.length > 0 ? cloudwatch.logs : [`[${row.updated_at}] status=${row.status}`, row.status_reason || "No logs available yet"],
        nextToken: cloudwatch.nextToken,
      };
    },
  );

  typed.get(
    "/image-builder/builds",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "List builds",
        querystring: z.object({
          sourceRepo: z.string().optional(),
          status: z.string().optional(),
          limit: z.coerce.number().int().positive().max(100).optional(),
        }),
        response: { 200: z.object({ builds: z.array(buildSchema) }) },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        const builds = await listBuilds({
          tenantId: auth.tenantId,
          sourceRepo: request.query.sourceRepo,
          status: request.query.status,
          limit: request.query.limit,
        });
        return { builds };
      } catch (err) {
        if (err instanceof ImageBuilderError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.post(
    "/image-builder/builds/:buildId/cancel",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_MANAGE),
      schema: {
        tags: ["image-builder"],
        summary: "Cancel build",
        params: z.object({ buildId: z.string().uuid() }),
        response: { 200: buildSchema },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        return await cancelBuild(request.params.buildId, auth.tenantId);
      } catch (err) {
        if (err instanceof ImageBuilderError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.get(
    "/image-builder/images/:revision",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Resolve image by git revision",
        params: z.object({ revision: z.string().min(1) }),
        response: {
          200: z.object({
            imageUri: z.string(),
            buildId: z.string().uuid(),
            commitSha: z.string(),
            status: z.string(),
            createdAt: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      try {
        return await resolveImageByRevision(request.params.revision, auth.tenantId);
      } catch (err) {
        if (err instanceof ImageBuilderError) throwDomainError(app, err);
        throw err;
      }
    },
  );

  typed.get(
    "/image-builder/builds/:buildId/deploy-status",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["image-builder"],
        summary: "Get deploy status for build",
        params: z.object({ buildId: z.string().uuid() }),
        response: { 200: z.object({ status: z.string(), appUrl: z.string(), stackName: z.string() }) },
      },
    },
    async (request) => {
      app.log.debug(` HIT — buildId=${request.params.buildId}`);
      const auth = request.auth!;
      const { data, error } = await db.from("builds").select("*").eq("id", request.params.buildId).single();
      if (error || !data) { app.log.debug(` Build not found`); throw app.httpErrors.notFound("Build not found"); }
      if (data.organization_id !== auth.tenantId) { app.log.debug(` Forbidden`); throw app.httpErrors.forbidden("Not your build"); }
      const build = rowToBuild(data);

      // If we already have the appUrl cached, return immediately
      if (build.buildMetadata.appUrl) {
        return {
          status: "success",
          appUrl: build.buildMetadata.appUrl,
          stackName: build.buildMetadata.stackName ?? "",
        };
      }
      if (build.status === "failed") return { status: "failed", appUrl: "", stackName: "" };

      // Derive the CloudFormation stack name from the source repo
      const appName = build.sourceRepo.split("/").pop()?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "";
      const stackName = `image-builder-app-${appName}`;

      // Poll CloudFormation directly for real-time status
      const credentials = await resolveAwsCredentials(data.provider_id || "");
      if (!credentials) {
        if (build.status === "succeeded") return { status: "success", appUrl: "", stackName };
        return { status: "deploying", appUrl: "", stackName };
      }

      try {
        const { CloudFormationClient, DescribeStacksCommand, CreateStackCommand, UpdateStackCommand } = await import("@aws-sdk/client-cloudformation");
        const cfn = new CloudFormationClient({
          region: credentials.region,
          credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
        });

        let stack: any = null;
        try {
          const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
          stack = result.Stacks?.[0] || null;
        } catch {
          // Stack doesn't exist
        }

        if (!stack) {
          // Stack doesn't exist — if CodeBuild succeeded and image is available, create it directly.
          // This handles the case where the DeployLambda failed or SNS didn't fire.
          // Note: if the frontend is polling deploy-status, CodeBuild has already succeeded
          // even if the DB status hasn't been updated yet.
          app.log.debug(` No stack found. build.status=${build.status}, image_uri=${data.image_uri || ""}, buildMetadata.imageUri=${build.buildMetadata.imageUri || ""}`);
          if (build.buildMetadata.imageUri || data.image_uri || build.status === "succeeded" || build.status === "submitted" || build.status === "in_progress") {
            // Derive image URI: if not cached, construct from account/region/repo
            let imageUri = build.buildMetadata.imageUri || data.image_uri || "";
            if (!imageUri && build.status === "succeeded") {
              const accountId = await getAwsAccountId(credentials.region, { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey });
              const imageRepoName = appName; // same sanitization as appName
              const commitSha = build.commitSha || data.commit_sha || "";
              const shortTag = commitSha ? commitSha.slice(0, 12) : "latest";
              imageUri = `${accountId}.dkr.ecr.${credentials.region}.amazonaws.com/${imageRepoName}:${shortTag}`;
            }
            const buildMetadata: Record<string, unknown> = data.build_metadata
              ? JSON.parse(data.build_metadata)
              : {};
            const containerPort = (buildMetadata.containerPort as string) || "3000";
            const deployParams: Record<string, unknown> = buildMetadata.deployParams
              ? JSON.parse(buildMetadata.deployParams as string)
              : {};
            app.log.debug(`deployParams keys: ${Object.keys(deployParams).join(",")}, envVars count: ${((deployParams.envVars as unknown[]) || []).length}, raw deployParams field: ${buildMetadata.deployParams ? "present" : "MISSING"}`);

            // Only attempt creation if the build finished (give Lambda a few seconds)
            const finishedAt = data.finished_at ? new Date(data.finished_at).getTime() : 0;
            const elapsed = finishedAt > 0 ? Math.abs(Date.now() - finishedAt) : 999_999;
            if (elapsed > 30_000 && imageUri) {
              app.log.debug(` Fallback triggered — imageUri=${imageUri}, elapsed=${elapsed}ms`);
              try {
                // Get VPC and subnet
                const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand } = await import("@aws-sdk/client-ec2");
                const ec2 = new EC2Client({ region: credentials.region, credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey } });
                const vpcsResult = await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: "is-default", Values: ["true"] }] }));
                const vpcId = vpcsResult.Vpcs?.[0]?.VpcId || "";
                const subnetsResult = vpcId ? await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [vpcId] }] })) : { Subnets: [] };
                const subnetId = (subnetsResult.Subnets || [])[0]?.SubnetId || "";

                if (vpcId && subnetId) {
                  // Read and upload template
                  const { readFileSync } = await import("node:fs");
                  const { join } = await import("node:path");
                  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

                  const accountId = await getAwsAccountId(credentials.region, { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey });
                  const templateBucket = `image-builder-templates-${accountId}`;

                  let templateBody: string;
                  try {
                    templateBody = readFileSync(join(__dirname, "../deploy/domain/cfn-templates/ec2.yml"), "utf-8");
                  } catch {
                    templateBody = readFileSync(join(process.cwd(), "src/services/deploy/domain/cfn-templates/ec2.yml"), "utf-8");
                  }

                  const s3 = new S3Client({ region: credentials.region, credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey } });
                  await s3.send(new PutObjectCommand({ Bucket: templateBucket, Key: "ec2.yml", Body: templateBody, ContentType: "text/yaml" }));
                  const templateUrl = `https://${templateBucket}.s3.amazonaws.com/ec2.yml`;

                  const params = [
                    { ParameterKey: "AppName", ParameterValue: appName },
                    { ParameterKey: "ImageUri", ParameterValue: imageUri },
                    { ParameterKey: "ContainerPort", ParameterValue: String(containerPort) },
                    { ParameterKey: "InstanceType", ParameterValue: (deployParams.instanceType as string) || "t3.small" },
                    { ParameterKey: "VpcId", ParameterValue: vpcId },
                    { ParameterKey: "SubnetId", ParameterValue: subnetId },
                    { ParameterKey: "BuildId", ParameterValue: request.params.buildId },
                  ];

                  // Add env vars if present — use S3 if too large for CloudFormation parameter (4096 char limit)
                  // envVars can be either [{name, value}] objects or ["KEY=value"] strings
                  const rawEnvVars: any[] = (deployParams.envVars as any[]) || [];
                  const envVars: Array<{name: string; value: string}> = rawEnvVars.map((v: any) => {
                    if (typeof v === "string") {
                      const idx = v.indexOf("=");
                      return idx > 0 ? { name: v.slice(0, idx), value: v.slice(idx + 1) } : { name: v, value: "" };
                    }
                    return v;
                  });
                  if (envVars.length > 0) {
                    const envVarsJson = JSON.stringify(envVars);
                    if (envVarsJson.length > 4000) {
                      const envVarsKey = `env-vars/${stackName}/${request.params.buildId}.json`;
                      await s3.send(new PutObjectCommand({
                        Bucket: templateBucket,
                        Key: envVarsKey,
                        Body: envVarsJson,
                        ContentType: "application/json",
                      }));
                      params.push({ ParameterKey: "EnvVarsS3Uri", ParameterValue: `s3://${templateBucket}/${envVarsKey}` });
                      app.log.debug(`Env vars uploaded to S3 (${envVarsJson.length} chars)`);
                    } else {
                      params.push({ ParameterKey: "EnvVarsJson", ParameterValue: envVarsJson });
                    }
                  }
                  // Add self-hosted services
                  const selfHostedServices = (deployParams.selfHostedServices as string[]) || [];
                  if (selfHostedServices.length > 0) {
                    params.push({ ParameterKey: "SelfHostedServices", ParameterValue: selfHostedServices.join(",") });
                  }
                  // Add tech stack
                  const techStack = (deployParams.techStack as string[]) || [];
                  if (techStack.length > 0) {
                    params.push({ ParameterKey: "TechStack", ParameterValue: techStack.join(",") });
                  }

                  try {
                    await cfn.send(new CreateStackCommand({
                      StackName: stackName,
                      TemplateURL: templateUrl,
                      Parameters: params,
                      Capabilities: ["CAPABILITY_NAMED_IAM"],
                      Tags: [
                        { Key: "BuildId", Value: request.params.buildId },
                        { Key: "ManagedBy", Value: "image-builder" },
                      ],
                      OnFailure: "ROLLBACK",
                    }));
                    app.log.debug(`Created CloudFormation stack ${stackName} as fallback`);
                  } catch (createErr: any) {
                    if (createErr.name?.includes("AlreadyExists") || createErr.message?.includes("already exists")) {
                      // Stack exists — update it with new image and env vars
                      try {
                        const { UpdateStackCommand } = await import("@aws-sdk/client-cloudformation");
                        await cfn.send(new UpdateStackCommand({
                          StackName: stackName,
                          TemplateURL: templateUrl,
                          Parameters: params,
                          Capabilities: ["CAPABILITY_NAMED_IAM"],
                        }));
                        app.log.debug(`Updated existing CloudFormation stack ${stackName}`);
                      } catch (updateErr: any) {
                        if (updateErr.message?.includes("No updates")) {
                          app.log.debug(`Stack ${stackName} already up to date`);
                        } else {
                          app.log.debug(`Stack update failed: ${updateErr.message}`);
                        }
                      }
                    } else {
                      throw createErr;
                    }
                  }
                }
              } catch (createErr: any) {
                // If AlreadyExists, the Lambda may have just created it — that's fine
                if (!createErr.name?.includes("AlreadyExists") && !createErr.message?.includes("already exists")) {
                  app.log.debug(` Fallback stack creation failed: ${createErr.message}`);
                } else {
                  app.log.debug(` Stack already exists (race with Lambda)`);
                }
              }
            } else {
              app.log.debug(` Fallback skipped — imageUri="${imageUri}", elapsed=${elapsed}ms`);
            }
          }
          return { status: "deploying", appUrl: "", stackName };
        }

        const stackStatus = stack.StackStatus || "";
        if (stackStatus === "CREATE_COMPLETE" || stackStatus === "UPDATE_COMPLETE") {
          const outputs = Object.fromEntries((stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]));
          const appUrl = outputs.AppUrl || "";
          // Cache the result in the builds table so future polls are instant
          const existingMetadata: Record<string, unknown> = typeof data.build_metadata === "string" && data.build_metadata
            ? JSON.parse(data.build_metadata) : {};
          await db.from("builds").update({
            status: "succeeded",
            build_metadata: JSON.stringify({ ...existingMetadata, appUrl, stackName }),
            updated_at: new Date().toISOString(),
          }).eq("id", request.params.buildId);
          return { status: "success", appUrl, stackName };
        }
        if (stackStatus.includes("ROLLBACK") || stackStatus.includes("FAILED")) {
          await db.from("builds").update({
            status: "failed",
            status_reason: `CloudFormation: ${stackStatus}`,
            updated_at: new Date().toISOString(),
          }).eq("id", request.params.buildId);
          return { status: "failed", appUrl: "", stackName };
        }
        return { status: "deploying", appUrl: "", stackName };
      } catch (err: any) {
        app.log.debug(` Error: ${err.message}`);
        if (build.status === "succeeded") return { status: "success", appUrl: "", stackName };
        return { status: "deploying", appUrl: "", stackName };
      }
    },
  );

  typed.post(
    "/image-builder/builds/:buildId/run-post-deploy",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_CREATE),
      schema: {
        tags: ["image-builder"],
        summary: "Run post-deploy commands on the deployed instance",
        params: z.object({ buildId: z.string().uuid() }),
        body: z.object({
          commands: z.array(z.object({
            command: z.string().min(1).max(500),
            enabled: z.boolean(),
            continueOnFailure: z.boolean(),
          })).max(20),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            output: z.array(z.string()),
          }),
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const { data, error } = await db.from("builds").select("*").eq("id", request.params.buildId).single();
      if (error || !data) throw app.httpErrors.notFound("Build not found");
      if (data.organization_id !== auth.tenantId) throw app.httpErrors.forbidden("Not your build");

      const enabledCommands = request.body.commands.filter(c => c.enabled);
      if (enabledCommands.length === 0) return { success: true, output: ["No commands to run"] };

      // Resolve AWS credentials
      const credentials = await resolveAwsCredentials(data.provider_id || "");
      if (!credentials) throw app.httpErrors.preconditionFailed("AWS credentials not available");

      // Find the EC2 instance from CloudFormation stack
      const appName = (data.source_repo || "").split("/").pop()?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "";
      const stackName = `image-builder-app-${appName}`;

      const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      const cfn = new CloudFormationClient({
        region: credentials.region,
        credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
      });

      const stackResult = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = stackResult.Stacks?.[0];
      if (!stack) throw app.httpErrors.preconditionFailed("CloudFormation stack not found");

      const outputs = Object.fromEntries((stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]));
      const instanceId = outputs.InstanceId || "";
      if (!instanceId) throw app.httpErrors.preconditionFailed("No EC2 instance found in stack outputs");

      // Derive container name (matches what CloudFormation UserData uses)
      const containerName = appName;

      // Build the command chain
      const cmdChain = enabledCommands
        .map(cmd => {
          const escaped = cmd.command.replace(/'/g, "'\\''");
          const exec = `docker exec ${containerName} sh -c '${escaped}'`;
          return cmd.continueOnFailure ? `(${exec} || true)` : exec;
        })
        .join(" && ");

      // Laravel: copy .env into container before running commands
      const parsedMetadata: Record<string, unknown> = typeof data.build_metadata === "string" && data.build_metadata
        ? JSON.parse(data.build_metadata) : {};
      const techStack: string[] = Array.isArray(parsedMetadata.techStack)
        ? parsedMetadata.techStack as string[]
        : [];
      const isLaravel = techStack.some((s: string) => s.toLowerCase() === "laravel") ||
        (data.source_repo || "").toLowerCase().includes("laravel");

      const envSetup = isLaravel
        ? `docker cp /tmp/${containerName}.env ${containerName}:/var/www/html/.env 2>/dev/null || docker exec ${containerName} sh -c 'touch .env' && `
        : "";

      const script = [
        "#!/bin/bash",
        "CONTAINER_READY=0",
        "for i in $(seq 1 90); do",
        `  if docker ps --filter "name=^${containerName}$" --filter "status=running" -q 2>/dev/null | grep -q .; then CONTAINER_READY=1; break; fi`,
        "  sleep 2",
        "done",
        `if [ "$CONTAINER_READY" != "1" ]; then echo "ERROR: Container '${containerName}' not running after 180s"; exit 1; fi`,
        `${envSetup}${cmdChain}`,
      ].join("\n");

      // Execute via SSM SendCommand
      const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import("@aws-sdk/client-ssm");
      const ssm = new SSMClient({
        region: credentials.region,
        credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
      });

      const sendResult = await ssm.send(new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: { commands: [script] },
        TimeoutSeconds: 300,
      }));

      const commandId = sendResult.Command?.CommandId;
      if (!commandId) throw app.httpErrors.internalServerError("Failed to send SSM command");

      // Poll for completion
      const outputLines: string[] = [];
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const invocation = await ssm.send(new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          }));
          const status = invocation.Status;
          if (status === "Success") {
            if (invocation.StandardOutputContent?.trim()) {
              outputLines.push(...invocation.StandardOutputContent.trim().split("\n").slice(0, 50));
            }
            return { success: true, output: outputLines.length > 0 ? outputLines : ["Commands executed successfully"] };
          } else if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
            if (invocation.StandardErrorContent?.trim()) {
              outputLines.push(...invocation.StandardErrorContent.trim().split("\n").slice(0, 20));
            }
            if (invocation.StandardOutputContent?.trim()) {
              outputLines.push(...invocation.StandardOutputContent.trim().split("\n").slice(-20));
            }
            return { success: false, output: outputLines.length > 0 ? outputLines : [`Command ${status}`] };
          }
        } catch {
          // InvocationDoesNotExist — agent hasn't picked it up yet
        }
      }

      return { success: false, output: ["Command timed out — it may still be running on the instance"] };
    },
  );

  typed.post(
    "/image-builder/webhook",
    {
      preHandler: requireWebhookSignature,
      schema: {
        tags: ["image-builder"],
        summary: "Build/deploy callback webhook",
        body: z.object({
          buildId: z.string().uuid(),
          stackName: z.string().optional(),
          status: z.enum(["deploying", "success", "failed"]),
          appUrl: z.string().optional(),
          cfnStatus: z.string().optional(),
          deployTarget: z.string().optional(),
          codebuildId: z.string().optional(),
        }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const { data, error: fetchError } = await db.from("builds").select("*").eq("id", request.body.buildId).maybeSingle();
      if (fetchError) {
        app.log.error(fetchError);
        return { ok: false };
      }
      if (!data) return { ok: false };
      const updates: Database["public"]["Tables"]["builds"]["Update"] = { updated_at: new Date().toISOString() };
      if (request.body.codebuildId) updates.codebuild_id = request.body.codebuildId;
      if (request.body.status === "success") {
        updates.status = "succeeded";
        const existingMeta: Record<string, unknown> = typeof data.build_metadata === "string" && data.build_metadata
          ? JSON.parse(data.build_metadata) : {};
        updates.build_metadata = JSON.stringify({ ...existingMeta, appUrl: request.body.appUrl ?? "", stackName: request.body.stackName ?? "" });
      } else if (request.body.status === "failed") {
        updates.status = "failed";
        updates.status_reason = `Deploy failed: ${request.body.cfnStatus ?? "unknown"}`;
      } else {
        updates.status = "in_progress";
        updates.status_reason = composeDeployingReason(request.body.deployTarget);
      }
      const { error: updateError } = await db.from("builds").update(updates).eq("id", request.body.buildId);
      if (updateError) {
        app.log.error(updateError);
        return { ok: false };
      }
      return { ok: true };
    },
  );
}

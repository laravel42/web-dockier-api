import { BatchGetBuildsCommand, CodeBuildClient, ListBuildsForProjectCommand } from "@aws-sdk/client-codebuild";
import { CloudWatchLogsClient, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import type { FastifyInstance } from "fastify";

function imageBuilderProjectName(): string {
  return process.env.IMAGE_BUILDER_CODEBUILD_PROJECT || process.env.ImageBuilderCodeBuildProject || "image-builder";
}

export async function resolveAwsCredentials(db: any, providerId: string): Promise<{ accessKeyId: string; secretAccessKey: string; region: string } | null> {
  if (!providerId) return null;
  const { data } = await db.from("server_providers").select("api_key,api_secret,region").eq("id", providerId).maybeSingle();
  if (!data?.api_key || !data?.api_secret) return null;
  return { accessKeyId: data.api_key, secretAccessKey: data.api_secret, region: data.region || "us-east-1" };
}

export async function lookupCodeBuildId(credentials: { accessKeyId: string; secretAccessKey: string; region: string }, buildId: string): Promise<string | null> {
  const client = new CodeBuildClient({
    region: credentials.region,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
  });
  const list = await client.send(new ListBuildsForProjectCommand({ projectName: imageBuilderProjectName(), sortOrder: "DESCENDING" }));
  const ids = (list.ids || []).slice(0, 20);
  if (ids.length === 0) return null;
  const batch = await client.send(new BatchGetBuildsCommand({ ids }));
  const match = (batch.builds || []).find((entry) => (entry.source?.location || "").includes(`${buildId}.zip`));
  return match?.id ?? null;
}

export async function refreshBuildStatus(db: any, row: any) {
  if (!row.codebuild_id || !row.provider_id) return row;
  const credentials = await resolveAwsCredentials(db, row.provider_id);
  if (!credentials) return row;
  const client = new CodeBuildClient({
    region: credentials.region,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
  });
  const batch = await client.send(new BatchGetBuildsCommand({ ids: [row.codebuild_id] }));
  const build = batch.builds?.[0];
  if (!build) return row;
  const statusMap: Record<string, string> = {
    SUCCEEDED: "succeeded",
    FAILED: "failed",
    FAULT: "failed",
    TIMED_OUT: "failed",
    STOPPED: "stopped",
    IN_PROGRESS: "in_progress",
  };
  const status = statusMap[build.buildStatus || ""] ?? row.status;
  const statusReason = build.phases?.find((phase) => phase.phaseStatus === "FAILED")?.contexts?.[0]?.message || row.status_reason || "";
  await db
    .from("builds")
    .update({
      status,
      status_reason: statusReason,
      started_at: build.startTime?.toISOString() ?? row.started_at ?? null,
      finished_at: build.endTime?.toISOString() ?? row.finished_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  return { ...row, status, status_reason: statusReason };
}

export async function fetchBuildLogs(app: FastifyInstance, db: any, row: any, nextToken?: string) {
  const credentials = await resolveAwsCredentials(db, row.provider_id || "");
  if (!credentials || !row.codebuild_id) return { logs: ["Build not yet started in CodeBuild"], nextToken: undefined as string | undefined };
  try {
    const client = new CloudWatchLogsClient({
      region: credentials.region,
      credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
    });
    const logStreamName = row.codebuild_id.includes(":") ? row.codebuild_id.split(":")[1] : row.codebuild_id;
    const result = await client.send(
      new GetLogEventsCommand({
        logGroupName: `/aws/codebuild/${imageBuilderProjectName()}`,
        logStreamName,
        startFromHead: true,
        nextToken,
        limit: 200,
      }),
    );
    return {
      logs: (result.events || []).map((event) => {
        const stamp = event.timestamp ? new Date(event.timestamp).toISOString().replace("T", " ").slice(0, 19) : "";
        return `[${stamp}] ${(event.message || "").replace(/\n$/, "")}`;
      }),
      nextToken: result.nextForwardToken,
    };
  } catch (error) {
    app.log.warn({ error }, "Failed to fetch CloudWatch logs");
    return { logs: [`Unable to fetch logs: ${(error as Error).message}`], nextToken: undefined as string | undefined };
  }
}

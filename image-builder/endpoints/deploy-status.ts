// ─── Deploy Status Endpoint ───

import { api, APIError } from "encore.dev/api";
import {
  db, getAwsAccessKeyId, getAwsSecretAccessKey, getAwsRegion,
  rowToBuild,
} from "../shared";

// ─── API: Get Deploy Status (polls CloudFormation for stack status) ───

export const getDeployStatus = api(
  { expose: true, method: "GET", path: "/image-builder/builds/:buildId/deploy-status", auth: true },
  async (params: { buildId: string }): Promise<{ status: string; appUrl: string; stackName: string }> => {
    const row = await db.queryRow`SELECT * FROM builds WHERE id = ${params.buildId}`;
    if (!row) throw APIError.notFound("Build not found");
    const build = rowToBuild(row);

    // Check if webhook already set the metadata
    if (build.buildMetadata?.appUrl) {
      return { status: "success", appUrl: build.buildMetadata.appUrl, stackName: build.buildMetadata.stackName || "" };
    }
    if (build.status === "failed") {
      return { status: "failed", appUrl: "", stackName: "" };
    }

    // Poll CloudFormation directly
    const appName = build.sourceRepo.split("/").pop()?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "";
    const stackName = `image-builder-app-${appName}`;
    try {
      const { CloudFormationClient, DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      const cfn = new CloudFormationClient({
        region: getAwsRegion(),
        credentials: { accessKeyId: getAwsAccessKeyId(), secretAccessKey: getAwsSecretAccessKey() },
      });
      const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = result.Stacks?.[0];
      if (!stack) return { status: "pending", appUrl: "", stackName };

      const stackStatus = stack.StackStatus || "";
      if (stackStatus === "CREATE_COMPLETE" || stackStatus === "UPDATE_COMPLETE") {
        const outputs = Object.fromEntries((stack.Outputs || []).map((o: any) => [o.OutputKey, o.OutputValue]));
        const appUrl = outputs.AppUrl || "";
        // Update the build record so future polls are fast
        await db.exec`UPDATE builds SET status = 'succeeded', build_metadata = ${JSON.stringify({ appUrl, stackName })}, updated_at = NOW() WHERE id = ${params.buildId}`;
        return { status: "success", appUrl, stackName };
      }
      if (stackStatus.includes("ROLLBACK") || stackStatus.includes("FAILED")) {
        return { status: "failed", appUrl: "", stackName };
      }
      return { status: "deploying", appUrl: "", stackName };
    } catch {
      return { status: "pending", appUrl: "", stackName };
    }
  }
);

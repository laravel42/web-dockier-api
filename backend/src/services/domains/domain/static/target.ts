/**
 * Target resolution for static-hosting custom domains.
 *
 * A static deployment has no container and no host to SSH into — the thing a
 * domain attaches to is the CDN in front of the bucket. This resolves that CDN
 * handle, preferring the values persisted on the deployment's `InfraMetadata`
 * and falling back to provider discovery for deployments that predate it.
 */

import { getCfn } from "../../../../lib/aws-sdk.js";
import { getAwsAccountId } from "../../../../lib/aws.js";
import { deriveRepoName, stackNameFor } from "../../../../lib/naming.js";
import {
  getProviderCredentialsSafe,
  toAwsCredentials,
} from "../../../../lib/provider-credentials.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import type { ActiveDeployment } from "../../../../shared/service-clients/deployments.js";

export interface AwsStaticTarget {
  kind: "aws-static";
  projectId: string;
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  accountId: string;
  stackName: string;
  distributionId: string;
  /** The CNAME target users point their DNS at. */
  distributionDomain: string;
  websiteBucket: string;
}

export type StaticTarget = AwsStaticTarget;

export interface StaticTargetResolution {
  target: StaticTarget | null;
  errorMessage?: string;
  /**
   * false → a genuinely unsupported combination; the caller must not retry.
   * true  → transient (credentials unavailable, API error); retrying may work.
   */
  retryable?: boolean;
}

/**
 * Resolve the CDN target for a static deployment.
 *
 * Returns `retryable: false` only for combinations that cannot ever work with
 * the current implementation, so a pg-boss job does not spin on them.
 */
export async function resolveStaticTarget(params: {
  projectId: string;
  deployment: ActiveDeployment;
}): Promise<StaticTargetResolution> {
  const { projectId, deployment } = params;

  const creds = await getProviderCredentialsSafe(deployment.providerId);
  if (!creds) {
    return {
      target: null,
      retryable: true,
      errorMessage: "Could not read the cloud credentials for this project. Check the provider connection and try again.",
    };
  }

  const provider = (deployment.infra?.provider ?? creds.provider).toLowerCase();

  if (provider === "gcp") {
    return {
      target: null,
      retryable: false,
      errorMessage:
        "Custom domains for static sites are available on AWS (S3 + CloudFront) today. " +
        "Google Cloud static hosting support is in progress. In the meantime, deploying this " +
        "project with the Server target gives it a custom domain with automatic HTTPS.",
    };
  }

  if (provider !== "aws") {
    return {
      target: null,
      retryable: false,
      errorMessage: `Custom domains for static sites are not supported on provider "${provider}".`,
    };
  }

  return await resolveAwsStaticTarget({ projectId, deployment, creds });
}

async function resolveAwsStaticTarget(params: {
  projectId: string;
  deployment: ActiveDeployment;
  creds: { provider: string; region: string; credential: Parameters<typeof toAwsCredentials>[0] };
}): Promise<StaticTargetResolution> {
  const { projectId, deployment, creds } = params;

  const region = deployment.infra?.region || creds.region;
  const credentials = toAwsCredentials(creds.credential);

  const repoName = deriveRepoName(deployment.repo);
  const stackName = deployment.infra?.stackName || stackNameFor(repoName);

  let distributionId = deployment.infra?.distributionId ?? "";
  let distributionDomain = deployment.infra?.distributionDomain ?? "";
  let websiteBucket = deployment.infra?.staticBucket ?? "";

  // Deployments that predate InfraMetadata CDN persistence: recover the handle
  // from the CloudFormation stack outputs. Same pattern resolveEc2InstanceId
  // already uses for InstanceId.
  if (!distributionId || !distributionDomain) {
    const recovered = await describeStaticStackOutputs({ region, credentials, stackName });
    distributionId = distributionId || recovered.distributionId;
    distributionDomain = distributionDomain || recovered.distributionDomain;
    websiteBucket = websiteBucket || recovered.websiteBucket;
  }

  if (!distributionId || !distributionDomain) {
    return {
      target: null,
      retryable: true,
      errorMessage:
        "Could not locate the CloudFront distribution for this site. Redeploy the project and try again.",
    };
  }

  let accountId = "";
  try {
    accountId = await getAwsAccountId(region, {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    } as Parameters<typeof getAwsAccountId>[1]);
  } catch (err) {
    // Only used for diagnostics and certificate tagging; not worth failing on.
    logger.warn({ err: getErrMsg(err), projectId }, "[domains:static] could not resolve AWS account id");
  }

  return {
    target: {
      kind: "aws-static",
      projectId,
      region,
      credentials,
      accountId,
      stackName,
      distributionId,
      distributionDomain,
      websiteBucket,
    },
  };
}

/** Read the CDN handle out of the static site's CloudFormation stack outputs. */
async function describeStaticStackOutputs(params: {
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  stackName: string;
}): Promise<{ distributionId: string; distributionDomain: string; websiteBucket: string }> {
  const empty = { distributionId: "", distributionDomain: "", websiteBucket: "" };
  try {
    const { CloudFormationClient, DescribeStacksCommand } = await getCfn();
    const cfn = new CloudFormationClient({ region: params.region, credentials: params.credentials });
    const res = await cfn.send(new DescribeStacksCommand({ StackName: params.stackName }));
    const outputs = res.Stacks?.[0]?.Outputs ?? [];
    const read = (key: string) => outputs.find((o) => o.OutputKey === key)?.OutputValue || "";
    return {
      distributionId: read("DistributionId"),
      distributionDomain: read("DistributionDomain"),
      websiteBucket: read("WebsiteBucketName"),
    };
  } catch (err) {
    logger.warn(
      { err: getErrMsg(err), stackName: params.stackName },
      "[domains:static] DescribeStacks failed while recovering the CDN handle",
    );
    return empty;
  }
}

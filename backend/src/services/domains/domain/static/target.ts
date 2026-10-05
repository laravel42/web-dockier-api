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
  toGcpServiceAccountKey,
} from "../../../../lib/provider-credentials.js";
import { createGcpClient, type GcpClient } from "../../../deploy/domain/infra/gcp-client.js";
import {
  getGlobalAddressValue,
  listGlobalResourceNames,
} from "../../../deploy/domain/infra/gcp-static-lb.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import type { ActiveDeployment } from "../../../../shared/service-clients/deployments.js";

export interface GcpStaticTarget {
  kind: "gcp-static";
  projectId: string;
  gcpProjectId: string;
  client: GcpClient;
  /** The global anycast IP users point an A record at. */
  cdnIp: string;
  /** Resource-name prefix the Pulumi program emits, e.g. "myapp". */
  appName: string;
  /** Discovered and used verbatim — never reconstructed. */
  urlMapSelfLink: string;
  bucketName: string;
}

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

export type StaticTarget = AwsStaticTarget | GcpStaticTarget;

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
    return await resolveGcpStaticTarget({ projectId, deployment, creds });
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

async function resolveGcpStaticTarget(params: {
  projectId: string;
  deployment: ActiveDeployment;
  creds: { provider: string; region: string; credential: Parameters<typeof toGcpServiceAccountKey>[0] };
}): Promise<StaticTargetResolution> {
  const { projectId, deployment, creds } = params;

  let client: GcpClient;
  try {
    const serviceAccountKey = toGcpServiceAccountKey(creds.credential);
    client = await createGcpClient(serviceAccountKey);
  } catch (err) {
    return {
      target: null,
      retryable: true,
      errorMessage: `Could not authenticate with Google Cloud: ${getErrMsg(err)}`,
    };
  }

  // The Pulumi program names every LB resource `<appName>-<role>[-<suffix>]`,
  // where appName comes from the repo. Discovery uses that prefix and the
  // discovered names are used VERBATIM — reconstructing them would guess at the
  // optional suffix and miss.
  const appName = deriveRepoName(deployment.repo);

  const urlMapNames = await listGlobalResourceNames(client, "urlMaps", `${appName}-url-map`);
  if (urlMapNames.length === 0) {
    return {
      target: null,
      retryable: true,
      errorMessage:
        "Could not locate the load balancer for this site. Redeploy the project and try again.",
    };
  }
  const urlMapSelfLink = `https://www.googleapis.com/compute/v1/projects/${client.getProjectId()}/global/urlMaps/${urlMapNames[0]}`;

  // Prefer the LIVE address over the persisted one. A redeploy that took
  // gcp-storage's wipe-and-retry path can legitimately have replaced the global
  // address, and creating the :443 rule against a dead IP would either fail or
  // bind an address the user's A record does not point at — surfacing later as
  // a certificate stuck on FAILED_NOT_VISIBLE naming the wrong IP.
  let cdnIp = deployment.infra?.cdnIp ?? "";
  const addressNames = await listGlobalResourceNames(client, "addresses", `${appName}-ip`);
  if (addressNames.length > 0) {
    const live = await getGlobalAddressValue(client, addressNames[0]);
    if (live && live !== cdnIp) {
      if (cdnIp) {
        logger.warn(
          { projectId, persisted: cdnIp, live },
          "[domains:static:gcp] persisted CDN IP disagrees with the live address; using live",
        );
      }
      cdnIp = live;
    }
  }

  if (!cdnIp) {
    return {
      target: null,
      retryable: true,
      errorMessage:
        "Could not determine the load balancer's IP address for this site. Redeploy the project and try again.",
    };
  }

  return {
    target: {
      kind: "gcp-static",
      projectId,
      gcpProjectId: client.getProjectId(),
      client,
      cdnIp,
      appName,
      urlMapSelfLink,
      bucketName: deployment.infra?.staticBucket ?? "",
    },
  };
}

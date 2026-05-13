/**
 * Shared AWS utilities used by both deploy and image-builder services.
 *
 * Provides common AWS operations (STS identity lookup, credential types)
 * so that each service doesn't need its own copy.
 */

/** Standard AWS credential pair used across services. */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Get the AWS account ID for the given credentials via STS GetCallerIdentity.
 * Returns an empty string if the account cannot be determined.
 */
export async function getAwsAccountId(
  region: string,
  credentials: AwsCredentials,
): Promise<string> {
  const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
  const sts = new STSClient({ region, credentials });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  return identity.Account || "";
}

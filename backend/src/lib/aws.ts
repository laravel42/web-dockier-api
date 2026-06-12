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

function isS3BucketMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const awsErr = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    awsErr.name === "NotFound" ||
    awsErr.name === "NoSuchBucket" ||
    awsErr.$metadata?.httpStatusCode === 404
  );
}

function isS3BucketAlreadyOwnedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const awsErr = err as { name?: string };
  return (
    awsErr.name === "BucketAlreadyOwnedByYou" ||
    awsErr.name === "BucketAlreadyExists"
  );
}

/**
 * Ensure an S3 bucket exists in the target account/region before upload.
 * Creates the bucket when HeadBucket returns NotFound.
 */
export async function ensureS3Bucket(
  region: string,
  credentials: AwsCredentials,
  bucketName: string,
): Promise<void> {
  const { S3Client, HeadBucketCommand, CreateBucketCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region, credentials });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    return;
  } catch (err: unknown) {
    if (!isS3BucketMissingError(err)) {
      throw err;
    }
  }

  const createParams: { Bucket: string; CreateBucketConfiguration?: { LocationConstraint: string } } = {
    Bucket: bucketName,
  };
  if (region !== "us-east-1") {
    createParams.CreateBucketConfiguration = { LocationConstraint: region };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await s3.send(new CreateBucketCommand(createParams as any));
  } catch (err: unknown) {
    if (!isS3BucketAlreadyOwnedError(err)) {
      throw err;
    }
  }
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

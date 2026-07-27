/**
 * Cached AWS SDK Module Loader
 *
 * Lazily imports and caches AWS SDK client modules at module scope.
 * Each SDK package is resolved once per process lifetime, eliminating
 * the per-call overhead of repeated dynamic import() in hot paths
 * (deploy pipelines, post-deploy scripts, command execution).
 *
 * Usage:
 * ```ts
 * import { getS3, getCfn, getSsm, getSts, getEc2, getSns, getCodeBuild, getEcs } from "../../lib/aws-sdk.js";
 *
 * const { S3Client, PutObjectCommand } = await getS3();
 * const s3 = new S3Client({ region, credentials });
 * ```
 */

// ─── Cached module references ──────────────────────────────────────

let _s3: typeof import("@aws-sdk/client-s3") | null = null;
let _cfn: typeof import("@aws-sdk/client-cloudformation") | null = null;
let _ssm: typeof import("@aws-sdk/client-ssm") | null = null;
let _sts: typeof import("@aws-sdk/client-sts") | null = null;
let _ec2: typeof import("@aws-sdk/client-ec2") | null = null;
let _sns: typeof import("@aws-sdk/client-sns") | null = null;
let _codebuild: typeof import("@aws-sdk/client-codebuild") | null = null;
let _ecs: typeof import("@aws-sdk/client-ecs") | null = null;
let _secretsManager: typeof import("@aws-sdk/client-secrets-manager") | null = null;
let _cloudwatchLogs: typeof import("@aws-sdk/client-cloudwatch-logs") | null = null;

// ─── Lazy loaders ──────────────────────────────────────────────────

export async function getS3() {
  return (_s3 ??= await import("@aws-sdk/client-s3"));
}

export async function getCfn() {
  return (_cfn ??= await import("@aws-sdk/client-cloudformation"));
}

export async function getSsm() {
  return (_ssm ??= await import("@aws-sdk/client-ssm"));
}

export async function getSts() {
  return (_sts ??= await import("@aws-sdk/client-sts"));
}

export async function getEc2() {
  return (_ec2 ??= await import("@aws-sdk/client-ec2"));
}

export async function getSns() {
  return (_sns ??= await import("@aws-sdk/client-sns"));
}

export async function getCodeBuild() {
  return (_codebuild ??= await import("@aws-sdk/client-codebuild"));
}

export async function getEcs() {
  return (_ecs ??= await import("@aws-sdk/client-ecs"));
}

export async function getSecretsManager() {
  return (_secretsManager ??= await import("@aws-sdk/client-secrets-manager"));
}

export async function getCloudWatchLogs() {
  return (_cloudwatchLogs ??= await import("@aws-sdk/client-cloudwatch-logs"));
}

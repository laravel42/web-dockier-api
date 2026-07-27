/**
 * Load secrets from AWS at runtime into process.env.
 * Used in production instead of (or on top of) gitignored .env files.
 */

import { applyEnvRecord, parseSecretString } from "./apply-env-record.js";
import { getSecretsManager, getSsm } from "../../lib/aws-sdk.js";

function shouldLoadAwsSecrets(): boolean {
  if (process.env.LOAD_SECRETS_FROM === "file") return false;
  if (process.env.LOAD_SECRETS_FROM === "cloudflare") return false;
  if (process.env.LOAD_SECRETS_FROM === "aws") return true;
  if (process.env.AWS_SECRETS_MANAGER_SECRET_ID) return true;
  if (process.env.AWS_SSM_PARAMETER_PATH) return true;
  return false;
}

async function loadSecretsManagerSecret(secretId: string): Promise<void> {
  const { SecretsManagerClient, GetSecretValueCommand } = await getSecretsManager();
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION,
  });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!response.SecretString) {
    throw new Error(`Secrets Manager secret "${secretId}" has no SecretString payload`);
  }
  applyEnvRecord(parseSecretString(response.SecretString), `Secrets Manager (${secretId})`, {
    override: process.env.AWS_SECRETS_OVERRIDE === "true",
  });
}

function parameterNameToEnvKey(name: string, pathPrefix: string): string {
  const prefix = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`;
  if (name.startsWith(prefix)) {
    const suffix = name.slice(prefix.length);
    const segment = suffix.split("/").filter(Boolean).pop();
    if (segment) return segment;
  }
  const parts = name.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? name;
}

async function loadSsmParameters(pathPrefix: string): Promise<void> {
  const { SSMClient, GetParametersByPathCommand } = await getSsm();
  const client = new SSMClient({
    region: process.env.AWS_REGION,
  });

  const record: Record<string, unknown> = {};
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new GetParametersByPathCommand({
        Path: pathPrefix,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );

    for (const param of response.Parameters ?? []) {
      if (!param.Name || param.Value === undefined) continue;
      record[parameterNameToEnvKey(param.Name, pathPrefix)] = param.Value;
    }

    nextToken = response.NextToken;
  } while (nextToken);

  applyEnvRecord(record, `SSM (${pathPrefix})`, {
    override: process.env.AWS_SECRETS_OVERRIDE === "true",
  });
}

export async function loadAwsSecretsIfConfigured(): Promise<void> {
  if (!shouldLoadAwsSecrets()) return;

  const secretId = process.env.AWS_SECRETS_MANAGER_SECRET_ID;
  const parameterPath = process.env.AWS_SSM_PARAMETER_PATH;

  if (secretId) {
    await loadSecretsManagerSecret(secretId);
  }

  if (parameterPath) {
    await loadSsmParameters(parameterPath);
  }

  if (process.env.LOAD_SECRETS_FROM === "aws" && !secretId && !parameterPath) {
    throw new Error(
      "LOAD_SECRETS_FROM=aws requires AWS_SECRETS_MANAGER_SECRET_ID and/or AWS_SSM_PARAMETER_PATH",
    );
  }
}

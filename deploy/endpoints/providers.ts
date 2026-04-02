import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, type ProviderResponse } from "../shared";

export const addProvider = api(
  { method: "POST", path: "/deploy/providers", auth: true },
  async (params: {
    provider: "digitalocean" | "hetzner" | "vultr" | "linode" | "aws" | "upcloud" | "katapult" | "hostinger";
    label: string;
    apiKey: string;
    apiSecret: string;
    region?: string;
    appRunnerConnectionArn?: string;
  }): Promise<ProviderResponse> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const region = params.region || "";
    const arn = params.appRunnerConnectionArn?.trim() || "";

    await db.exec`
      INSERT INTO server_providers (id, app_id, provider, label, api_key, api_secret, region, app_runner_connection_arn, created_at)
      VALUES (${id}, ${authData.appId}, ${params.provider}, ${params.label}, ${params.apiKey}, ${params.apiSecret}, ${region}, ${arn}, NOW())`;

    return {
      id, provider: params.provider,
      label: params.label, region, createdAt: new Date().toISOString(),
    };
  }
);

export const listProviders = api(
  { method: "GET", path: "/deploy/providers", auth: true },
  async (): Promise<{ providers: ProviderResponse[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{
      id: string; provider: string; label: string; region: string; app_runner_connection_arn: string; created_at: Date;
    }>`SELECT id, provider, label, region, COALESCE(app_runner_connection_arn, '') as app_runner_connection_arn, created_at
       FROM server_providers WHERE app_id = ${authData.appId}`;

    const providers: ProviderResponse[] = [];
    for await (const row of rows) {
      providers.push({
        id: row.id, provider: row.provider,
        label: row.label, region: row.region, appRunnerConnectionArn: row.app_runner_connection_arn || undefined, createdAt: row.created_at.toISOString(),
      });
    }
    return { providers };
  }
);

export const deleteProvider = api(
  { method: "DELETE", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM deployments WHERE provider_id = ${params.providerId}`;
    await db.exec`DELETE FROM server_providers WHERE id = ${params.providerId}`;
    return { success: true };
  }
);

export const updateProvider = api(
  { method: "PUT", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string; label?: string; appRunnerConnectionArn?: string; apiSecret?: string }): Promise<ProviderResponse> => {
    const row = await db.queryRow<{
      id: string; provider: string; label: string; region: string; app_runner_connection_arn: string; created_at: Date;
    }>`SELECT id, provider, label, region, COALESCE(app_runner_connection_arn, '') as app_runner_connection_arn, created_at FROM server_providers WHERE id = ${params.providerId}`;
    if (!row) throw APIError.notFound("Provider not found");

    if (params.label !== undefined) await db.exec`UPDATE server_providers SET label = ${params.label} WHERE id = ${params.providerId}`;
    if (params.appRunnerConnectionArn !== undefined) await db.exec`UPDATE server_providers SET app_runner_connection_arn = ${params.appRunnerConnectionArn.trim()} WHERE id = ${params.providerId}`;
    if (params.apiSecret !== undefined) await db.exec`UPDATE server_providers SET api_secret = ${params.apiSecret.trim()} WHERE id = ${params.providerId}`;

    return {
      id: row.id, provider: row.provider,
      label: params.label ?? row.label, region: row.region, appRunnerConnectionArn: (params.appRunnerConnectionArn !== undefined ? params.appRunnerConnectionArn : row.app_runner_connection_arn) || undefined, createdAt: row.created_at.toISOString(),
    };
  }
);

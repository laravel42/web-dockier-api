import { api, APIError } from "encore.dev/api";
import { v4 as uuidv4 } from "uuid";
import { getAuthData } from "~encore/auth";
import { db, type ProviderResponse, type DeployProvider, isSupportedProvider } from "../shared";

export const addProvider = api(
  { expose: true, method: "POST", path: "/deploy/providers", auth: true },
  async (params: {
    provider: DeployProvider;
    label: string;
    apiKey: string;
    apiSecret: string;
    region?: string;
  }): Promise<ProviderResponse> => {
    const authData = getAuthData()!;
    const id = uuidv4();
    const region = params.region || "";

    await db.exec`
      INSERT INTO server_providers (id, app_id, provider, label, api_key, api_secret, region, app_runner_connection_arn, created_at)
      VALUES (${id}, ${authData.appId}, ${params.provider}, ${params.label}, ${params.apiKey}, ${params.apiSecret}, ${region}, ${""},  NOW())`;

    return {
      id, provider: params.provider,
      label: params.label, region, createdAt: new Date().toISOString(),
    };
  }
);

export const listProviders = api(
  { expose: true, method: "GET", path: "/deploy/providers", auth: true },
  async (): Promise<{ providers: ProviderResponse[] }> => {
    const authData = getAuthData()!;
    const rows = db.query<{
      id: string; provider: string; label: string; region: string; created_at: Date;
    }>`SELECT id, provider, label, region, created_at
       FROM server_providers WHERE app_id = ${authData.appId}`;

    const providers: ProviderResponse[] = [];
    for await (const row of rows) {
      providers.push({
        id: row.id, provider: row.provider,
        label: row.label, region: row.region, createdAt: row.created_at.toISOString(),
      });
    }
    return { providers };
  }
);

export const deleteProvider = api(
  { expose: true, method: "DELETE", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string }): Promise<{ success: boolean }> => {
    await db.exec`DELETE FROM deployments WHERE provider_id = ${params.providerId}`;
    await db.exec`DELETE FROM server_providers WHERE id = ${params.providerId}`;
    return { success: true };
  }
);

export const updateProvider = api(
  { expose: true, method: "PUT", path: "/deploy/providers/:providerId", auth: true },
  async (params: { providerId: string; label?: string; apiSecret?: string }): Promise<ProviderResponse> => {
    const row = await db.queryRow<{
      id: string; provider: string; label: string; region: string; created_at: Date;
    }>`SELECT id, provider, label, region, created_at FROM server_providers WHERE id = ${params.providerId}`;
    if (!row) throw APIError.notFound("Provider not found");

    if (params.label !== undefined) await db.exec`UPDATE server_providers SET label = ${params.label} WHERE id = ${params.providerId}`;
    if (params.apiSecret !== undefined) await db.exec`UPDATE server_providers SET api_secret = ${params.apiSecret.trim()} WHERE id = ${params.providerId}`;

    return {
      id: row.id, provider: row.provider,
      label: params.label ?? row.label, region: row.region, createdAt: row.created_at.toISOString(),
    };
  }
);

export const getProviderCredentials = api(
  { expose: false, method: "GET", path: "/deploy/providers/:providerId/credentials", auth: false },
  async (params: { providerId: string }): Promise<{ provider: string; region: string; apiKey: string; apiSecret: string }> => {
    const row = await db.queryRow<{
      provider: string; region: string; api_key: string; api_secret: string;
    }>`SELECT provider, region, api_key, api_secret FROM server_providers WHERE id = ${params.providerId}`;
    if (!row) throw APIError.notFound("Provider not found");
    return { provider: row.provider, region: row.region, apiKey: row.api_key, apiSecret: row.api_secret };
  }
);

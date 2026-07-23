/**
 * Unified provider credential resolution.
 *
 * Owns the raw DB lookup for server_providers credentials.
 * This is the single source of truth for credential access —
 * both the deploy service routes and image-builder consume this.
 */

import { supabaseAdmin } from "../shared/supabase/client.js";
import { createDomainErrorClass } from "../shared/supabase/errors.js";
import { unwrapQuery } from "../shared/supabase/query.js";

const CredentialError = createDomainErrorClass<"not_found" | "internal">("CredentialError");

export interface ProviderCredentials {
  provider: string;
  region: string;
  apiKey: string;
  apiSecret: string;
}

export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Fetch provider credentials from the server_providers table.
 *
 * Throws if the provider is not found or the query fails.
 * Used by the deploy routes' internal credentials endpoint.
 */
export async function getProviderCredentials(providerId: string): Promise<ProviderCredentials> {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("provider,region,api_key,api_secret")
    .eq("id", providerId)
    .single();

  const row = unwrapQuery(data, error, CredentialError, {
    notFoundMsg: "Provider not found",
    internalMsg: "Failed to fetch provider credentials",
  });

  return {
    provider: row.provider,
    region: row.region ?? "",
    apiKey: row.api_key,
    apiSecret: row.api_secret,
  };
}

/**
 * Resolve AWS credentials for a given providerId.
 *
 * Returns null if the providerId is empty, the provider is not found,
 * or the credentials are incomplete. Used by image-builder and other
 * services that want graceful degradation on missing/invalid providers.
 */
export async function resolveAwsCredentials(providerId: string): Promise<ResolvedCredentials | null> {
  if (!providerId) return null;

  const creds = await getProviderCredentialsSafe(providerId);
  if (!creds || !creds.apiKey || !creds.apiSecret) return null;

  return {
    accessKeyId: creds.apiKey,
    secretAccessKey: creds.apiSecret,
    region: creds.region || "us-east-1",
  };
}

/**
 * Fetch provider credentials without throwing on failure.
 *
 * Returns null if the providerId is empty, the provider is not found,
 * or the query fails. Use this in background workers and pipeline stages
 * where a missing provider should not crash the process.
 */
export async function getProviderCredentialsSafe(providerId: string): Promise<ProviderCredentials | null> {
  if (!providerId) return null;

  try {
    return await getProviderCredentials(providerId);
  } catch {
    return null;
  }
}

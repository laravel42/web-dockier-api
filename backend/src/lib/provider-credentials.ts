/**
 * Unified provider credential resolution.
 *
 * Owns the raw DB lookup for server_providers credentials.
 * This is the single source of truth for credential access —
 * both the deploy service routes and image-builder consume this.
 */

import { supabaseAdmin } from "../shared/supabase/client.js";
import { DomainError } from "../shared/supabase/errors.js";

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

  if (error) {
    if (error.code === "PGRST116") {
      throw new DomainError("Provider not found", "not_found", error);
    }
    throw new DomainError("Failed to fetch provider credentials", "internal", error);
  }
  if (!data) {
    throw new DomainError("Provider not found", "not_found");
  }

  return {
    provider: data.provider,
    region: data.region ?? "",
    apiKey: data.api_key,
    apiSecret: data.api_secret,
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

  try {
    const creds = await getProviderCredentials(providerId);
    if (!creds.apiKey || !creds.apiSecret) return null;

    return {
      accessKeyId: creds.apiKey,
      secretAccessKey: creds.apiSecret,
      region: creds.region || "us-east-1",
    };
  } catch {
    // Provider not found or DB error — return null for graceful degradation
    return null;
  }
}

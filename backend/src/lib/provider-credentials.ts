/**
 * Unified AWS credential resolution.
 *
 * Thin wrapper around the deploy domain's getProviderCredentials() that
 * returns null instead of throwing — used by image-builder and other
 * services that want graceful degradation on missing/invalid providers.
 */

import { getProviderCredentials } from "../services/deploy/domain/providers.js";

export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Resolve AWS credentials for a given providerId.
 *
 * Returns null if the providerId is empty, the provider is not found,
 * or the credentials are incomplete.
 *
 * Delegates to the deploy domain's getProviderCredentials() — single
 * source of truth for server_providers table access.
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

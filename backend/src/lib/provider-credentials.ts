/**
 * Unified AWS credential resolution.
 *
 * Single source of truth for fetching AWS credentials from the
 * server_providers table. Used by deploy pipeline, image-builder,
 * and codebuild-builder.
 */

import { supabaseAdmin } from "../shared/supabase/client.js";

export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Resolve AWS credentials for a given providerId by querying the server_providers table.
 *
 * Returns null if the providerId is empty, the provider is not found,
 * or the credentials are incomplete.
 */
export async function resolveAwsCredentials(providerId: string): Promise<ResolvedCredentials | null> {
  if (!providerId) return null;

  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("api_key,api_secret,region")
    .eq("id", providerId)
    .maybeSingle();

  if (error) {
    console.warn(`Failed to fetch provider credentials for ${providerId}: ${error.message}`);
    return null;
  }

  if (!data?.api_key || !data?.api_secret) return null;

  return {
    accessKeyId: data.api_key,
    secretAccessKey: data.api_secret,
    region: data.region || "us-east-1",
  };
}

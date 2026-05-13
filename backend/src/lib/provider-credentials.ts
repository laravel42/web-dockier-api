/**
 * Unified provider credential resolution.
 *
 * Looks up cloud provider credentials by providerId via the deploy service's
 * internal API, with a fallback to environment variables. Used by both the
 * deploy service (directly from DB) and image-builder (via internal call).
 */

export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface CredentialFallback {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Resolve AWS credentials for a given providerId.
 *
 * Strategy:
 * 1. If providerId is provided, fetch credentials from the deploy service
 * 2. Fall back to the supplied fallback values (typically from env vars)
 *
 * The `fetchCredentials` function is injected to avoid hard-coding the
 * lookup mechanism — each service provides its own implementation.
 */
export async function resolveAwsCredentials(opts: {
  providerId: string;
  fallback: CredentialFallback;
  fetchCredentials: (providerId: string) => Promise<{ apiKey: string; apiSecret: string; region?: string } | null>;
}): Promise<ResolvedCredentials> {
  const { providerId, fallback, fetchCredentials } = opts;

  if (providerId) {
    try {
      const creds = await fetchCredentials(providerId);
      if (creds && creds.apiKey && creds.apiSecret) {
        return {
          accessKeyId: creds.apiKey,
          secretAccessKey: creds.apiSecret,
          region: creds.region || fallback.region,
        };
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to fetch provider credentials for ${providerId}: ${message}`);
    }
  }

  // Fall back to provided defaults
  return fallback;
}

/**
 * Unified provider credential resolution.
 *
 * Owns the raw DB lookup for server_providers credentials and the per-provider
 * credential model. This is the single source of truth for credential access —
 * the deploy service, commands, network, and image-builder all consume it.
 *
 * Credentials are stored as a JSONB `credentials` blob whose shape is
 * discriminated on `kind` (which mirrors the `provider` column):
 *   AWS: { kind: "aws", accessKeyId, secretAccessKey }
 *   GCP: { kind: "gcp", serviceAccountKey }  // full service-account JSON string
 */

import { supabaseAdmin } from "../shared/supabase/client.js";
import { createDomainErrorClass } from "../shared/supabase/errors.js";
import { unwrapQuery } from "../shared/supabase/query.js";

const CredentialError = createDomainErrorClass<"not_found" | "internal" | "bad_request">("CredentialError");

// ─── Credential model ──────────────────────────────────────────────

export interface AwsCredentials {
  kind: "aws";
  accessKeyId: string;
  secretAccessKey: string;
}

export interface GcpCredentials {
  kind: "gcp";
  /** The full service-account JSON key, as a string. */
  serviceAccountKey: string;
}

/** Discriminated union of every supported provider's credential shape. */
export type ProviderCredential = AwsCredentials | GcpCredentials;

/** A resolved provider: metadata plus its typed credential. */
export interface ResolvedProvider {
  provider: string;
  region: string;
  credential: ProviderCredential;
}

/** The AWS SDK credential shape (optionally carrying a region). */
export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

// ─── Parsing / serialization ───────────────────────────────────────

/**
 * Parse a stored `credentials` JSONB blob into the typed union, using the
 * provider column as the authority for the expected kind. Throws on a shape
 * that doesn't match the provider so callers fail loudly rather than silently
 * deploying with empty credentials.
 */
export function parseProviderCredential(provider: string, raw: unknown): ProviderCredential {
  const blob = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = provider.toLowerCase();

  if (kind === "aws") {
    const accessKeyId = typeof blob.accessKeyId === "string" ? blob.accessKeyId : "";
    const secretAccessKey = typeof blob.secretAccessKey === "string" ? blob.secretAccessKey : "";
    return { kind: "aws", accessKeyId, secretAccessKey };
  }

  if (kind === "gcp") {
    const serviceAccountKey = typeof blob.serviceAccountKey === "string" ? blob.serviceAccountKey : "";
    return { kind: "gcp", serviceAccountKey };
  }

  throw new CredentialError(`Unsupported cloud provider: "${provider}". Expected "aws" or "gcp".`, "bad_request");
}

/**
 * Build the stored JSONB blob for a provider from raw credential input.
 * `fields` uses the same key names as the typed union. Missing fields become
 * empty strings; unknown provider kinds throw.
 */
export function buildProviderCredential(
  provider: string,
  fields: { accessKeyId?: string; secretAccessKey?: string; serviceAccountKey?: string },
): ProviderCredential {
  const kind = provider.toLowerCase();

  if (kind === "aws") {
    return {
      kind: "aws",
      accessKeyId: (fields.accessKeyId ?? "").trim(),
      secretAccessKey: (fields.secretAccessKey ?? "").trim(),
    };
  }

  if (kind === "gcp") {
    return { kind: "gcp", serviceAccountKey: (fields.serviceAccountKey ?? "").trim() };
  }

  throw new CredentialError(`Unsupported cloud provider: "${provider}". Expected "aws" or "gcp".`, "bad_request");
}

// ─── AWS/GCP accessors ─────────────────────────────────────────────

/**
 * Map a resolved credential to the AWS SDK's credential shape. Throws if the
 * credential is not AWS, so misrouted providers fail loudly. Pass a `region`
 * to get the region-carrying shape used when constructing SDK clients.
 */
export function toAwsCredentials(credential: ProviderCredential): { accessKeyId: string; secretAccessKey: string };
export function toAwsCredentials(credential: ProviderCredential, region: string): ResolvedCredentials;
export function toAwsCredentials(
  credential: ProviderCredential,
  region?: string,
): { accessKeyId: string; secretAccessKey: string } | ResolvedCredentials {
  if (credential.kind !== "aws") {
    throw new CredentialError(`Expected AWS credentials but got "${credential.kind}".`, "bad_request");
  }
  const base = { accessKeyId: credential.accessKeyId, secretAccessKey: credential.secretAccessKey };
  return region === undefined ? base : { ...base, region };
}

/**
 * Whether a credential has all the fields it needs to authenticate. AWS needs
 * both keys; GCP needs a non-empty service-account key.
 */
export function hasUsableCredential(credential: ProviderCredential): boolean {
  if (credential.kind === "aws") {
    return Boolean(credential.accessKeyId && credential.secretAccessKey);
  }
  return Boolean(credential.serviceAccountKey);
}

/**
 * Extract the GCP service-account JSON key string. Throws if the credential is
 * not GCP.
 */
export function toGcpServiceAccountKey(credential: ProviderCredential): string {
  if (credential.kind !== "gcp") {
    throw new CredentialError(`Expected GCP credentials but got "${credential.kind}".`, "bad_request");
  }
  return credential.serviceAccountKey;
}

// ─── DB lookups ────────────────────────────────────────────────────

/**
 * Fetch and parse a provider's credentials from the server_providers table.
 *
 * Throws if the provider is not found, the query fails, or the stored
 * credential shape doesn't match the provider.
 */
export async function getProviderCredentials(providerId: string): Promise<ResolvedProvider> {
  const { data, error } = await supabaseAdmin
    .from("server_providers")
    .select("provider,region,credentials")
    .eq("id", providerId)
    .single();

  const row = unwrapQuery(data, error, CredentialError, {
    notFoundMsg: "Provider not found",
    internalMsg: "Failed to fetch provider credentials",
  });

  return {
    provider: row.provider,
    region: row.region ?? "",
    credential: parseProviderCredential(row.provider, row.credentials),
  };
}

/**
 * Fetch provider credentials without throwing on failure.
 *
 * Returns null if the providerId is empty, the provider is not found, the query
 * fails, or the stored credential is malformed. Use this in background workers
 * and pipeline stages where a missing provider should not crash the process.
 */
export async function getProviderCredentialsSafe(providerId: string): Promise<ResolvedProvider | null> {
  if (!providerId) return null;

  try {
    return await getProviderCredentials(providerId);
  } catch {
    return null;
  }
}

/**
 * Resolve AWS credentials for a given providerId.
 *
 * Returns null if the providerId is empty, the provider is not found/not AWS,
 * or the credentials are incomplete. Used by image-builder and other services
 * that want graceful degradation on missing/invalid providers.
 */
export async function resolveAwsCredentials(providerId: string): Promise<ResolvedCredentials | null> {
  if (!providerId) return null;

  const resolved = await getProviderCredentialsSafe(providerId);
  if (!resolved || resolved.credential.kind !== "aws") return null;

  const { accessKeyId, secretAccessKey } = resolved.credential;
  if (!accessKeyId || !secretAccessKey) return null;

  return {
    accessKeyId,
    secretAccessKey,
    region: resolved.region || "us-east-1",
  };
}

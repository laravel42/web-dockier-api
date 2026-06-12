const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

export function isSupabasePublishableKey(value: string): boolean {
  return value.startsWith(PUBLISHABLE_PREFIX);
}

export function isSupabaseSecretKey(value: string): boolean {
  return value.startsWith(SECRET_PREFIX);
}

export function resolveSupabaseSecretKey(env: {
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}): string {
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (secretKey) return secretKey;

  const legacyKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (legacyKey) return legacyKey;

  throw new Error(
    "Missing Supabase secret key. Set SUPABASE_SECRET_KEY (sb_secret_...) in .env.",
  );
}

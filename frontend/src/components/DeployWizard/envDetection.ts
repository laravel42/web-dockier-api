/**
 * Smart service detection from environment variables.
 * Parses user-provided env vars to auto-determine managed vs self-hosted defaults
 * for each detected infrastructure service.
 */

/** Env var key patterns that indicate a service type */
const SERVICE_ENV_PATTERNS: Record<string, RegExp[]> = {
  database: [
    /^DATABASE_URL$/i,
    /^DB_HOST$/i,
    /^DB_CONNECTION$/i,
    /^DB_DATABASE$/i,
  ],
  cache: [
    /^REDIS_URL$/i,
    /^REDIS_HOST$/i,
    /^CACHE_DRIVER$/i,
    /^CACHE_STORE$/i,
  ],
  queue: [
    /^QUEUE_CONNECTION$/i,
    /^QUEUE_DRIVER$/i,
    /^SQS_/i,
    /^RABBITMQ_/i,
  ],
  storage: [
    /^AWS_BUCKET$/i,
    /^S3_/i,
    /^FILESYSTEM_DISK$/i,
    /^STORAGE_/i,
  ],
  mail: [
    /^MAIL_HOST$/i,
    /^MAIL_MAILER$/i,
    /^SMTP_/i,
    /^SES_/i,
  ],
  search: [
    /^ELASTICSEARCH_/i,
    /^MEILISEARCH_/i,
    /^ALGOLIA_/i,
  ],
};

/** Known managed provider URL patterns with display names */
const MANAGED_PROVIDER_PATTERNS: Array<{ pattern: RegExp; name: string; serviceType: string }> = [
  // Database
  { pattern: /neon\.tech/i, name: "Neon", serviceType: "database" },
  { pattern: /planetscale/i, name: "PlanetScale", serviceType: "database" },
  { pattern: /supabase/i, name: "Supabase", serviceType: "database" },
  { pattern: /amazonaws\.com\/rds/i, name: "Amazon RDS", serviceType: "database" },
  { pattern: /cloud\.google\.com\/sql/i, name: "Cloud SQL", serviceType: "database" },
  { pattern: /aiven\.io/i, name: "Aiven", serviceType: "database" },
  // Cache / Redis
  { pattern: /upstash\.io/i, name: "Upstash", serviceType: "cache" },
  { pattern: /redis\.cloud/i, name: "Redis Cloud", serviceType: "cache" },
  { pattern: /cache\.amazonaws\.com/i, name: "ElastiCache", serviceType: "cache" },
  { pattern: /memorystore/i, name: "Memorystore", serviceType: "cache" },
  // Queue
  { pattern: /sqs\.amazonaws\.com/i, name: "Amazon SQS", serviceType: "queue" },
  { pattern: /cloudamqp\.com/i, name: "CloudAMQP", serviceType: "queue" },
  // Storage
  { pattern: /s3\.amazonaws\.com/i, name: "Amazon S3", serviceType: "storage" },
  { pattern: /storage\.googleapis\.com/i, name: "Google Cloud Storage", serviceType: "storage" },
  { pattern: /r2\.cloudflarestorage/i, name: "Cloudflare R2", serviceType: "storage" },
  // Mail
  { pattern: /ses\.amazonaws\.com/i, name: "Amazon SES", serviceType: "mail" },
  { pattern: /smtp\.sendgrid/i, name: "SendGrid", serviceType: "mail" },
  { pattern: /smtp\.mailgun/i, name: "Mailgun", serviceType: "mail" },
  { pattern: /smtp\.postmarkapp/i, name: "Postmark", serviceType: "mail" },
  // Search
  { pattern: /es\.amazonaws\.com/i, name: "Amazon OpenSearch", serviceType: "search" },
  { pattern: /meilisearch\.com/i, name: "Meilisearch Cloud", serviceType: "search" },
  { pattern: /algolia\.net/i, name: "Algolia", serviceType: "search" },
];

export interface EnvDetectionResult {
  mode: "vps" | "managed";
  hint: string;
}

/**
 * Detect service modes from user-provided environment variables.
 *
 * @param envVars - The user's env vars (from the editable .env pane)
 * @param detectedServiceTypes - Service types detected in the codebase (e.g. ["database", "cache"])
 * @returns A map of service type → detection result (mode + UI hint)
 */
export function detectServiceModes(
  envVars: Array<{ name: string; value: string }>,
  detectedServiceTypes: string[],
): Record<string, EnvDetectionResult> {
  const results: Record<string, EnvDetectionResult> = {};

  for (const serviceType of detectedServiceTypes) {
    const patterns = SERVICE_ENV_PATTERNS[serviceType];
    if (!patterns) {
      // Unknown service type — default to self-hosted, no hint
      results[serviceType] = { mode: "vps", hint: "" };
      continue;
    }

    // Find all env vars that match this service type
    const matchingVars = envVars.filter((ev) =>
      patterns.some((p) => p.test(ev.name))
    );

    if (matchingVars.length === 0) {
      // Key not present at all
      results[serviceType] = {
        mode: "vps",
        hint: "⚠️ No credentials provided — will be self-hosted",
      };
      continue;
    }

    // Check if any matching var has a value that matches a known managed provider
    let detectedProvider: string | null = null;
    for (const ev of matchingVars) {
      if (!ev.value || ev.value === "null" || ev.value === "your-value-here") {
        continue; // empty/placeholder
      }
      const match = MANAGED_PROVIDER_PATTERNS.find(
        (mp) => mp.serviceType === serviceType && mp.pattern.test(ev.value)
      );
      if (match) {
        detectedProvider = match.name;
        break;
      }
    }

    if (detectedProvider) {
      results[serviceType] = {
        mode: "managed",
        hint: `🔗 Detected: ${detectedProvider} from your .env`,
      };
    } else {
      // Key exists but value is empty/placeholder or doesn't match a known provider
      const hasRealValue = matchingVars.some(
        (ev) => ev.value && ev.value !== "null" && ev.value !== "your-value-here" && ev.value.length > 3
      );
      if (hasRealValue) {
        // Has a value but we can't identify the provider — still default to managed
        // since they clearly have credentials for something
        results[serviceType] = {
          mode: "managed",
          hint: "🔗 Credentials detected from your .env",
        };
      } else {
        results[serviceType] = {
          mode: "vps",
          hint: "⚠️ No credentials provided — will be self-hosted",
        };
      }
    }
  }

  return results;
}

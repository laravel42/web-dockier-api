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

/** Values that indicate a local/self-hosted setup */
const SELF_HOSTED_PATTERNS = [
  /^127\.0\.0\.1$/,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^host\.docker\.internal$/i,
  /^172\.\d+\.\d+\.\d+$/,  // Docker network
  /^10\.\d+\.\d+\.\d+$/,   // Private network
  /^192\.168\.\d+\.\d+$/,  // Private network
  /^mysql$/i,               // Docker service name
  /^postgres$/i,            // Docker service name
  /^redis$/i,               // Docker service name
  /^mariadb$/i,             // Docker service name
];

/** Display names for DB connection drivers */
const DB_DRIVER_NAMES: Record<string, string> = {
  mysql: "MySQL",
  pgsql: "PostgreSQL",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  sqlite: "SQLite",
  sqlsrv: "SQL Server",
  mariadb: "MariaDB",
};

/** Display names for cache/queue drivers */
const CACHE_DRIVER_NAMES: Record<string, string> = {
  redis: "Redis",
  memcached: "Memcached",
  file: "File",
  array: "Array",
  database: "Database",
};

/**
 * Drivers/values that mean "no separate infrastructure needed" for a service type.
 * If the connection driver is one of these, the service doesn't need provisioning.
 */
const NO_INFRA_DRIVERS: Record<string, Set<string>> = {
  queue: new Set(["sync", "database", "null"]),
  cache: new Set(["file", "array", "null", "database"]),
  storage: new Set(["local", "public"]),
  mail: new Set(["log", "array", "null", "failover"]),
};

/**
 * Get the raw driver value for a service type from env vars.
 */
function getRawDriver(
  envVars: Array<{ name: string; value: string }>,
  serviceType: string,
): string | null {
  if (serviceType === "queue") {
    const v = envVars.find((ev) => /^QUEUE_CONNECTION$/i.test(ev.name) || /^QUEUE_DRIVER$/i.test(ev.name));
    return v?.value?.toLowerCase() || null;
  }
  if (serviceType === "cache") {
    const v = envVars.find((ev) => /^CACHE_DRIVER$/i.test(ev.name) || /^CACHE_STORE$/i.test(ev.name));
    return v?.value?.toLowerCase() || null;
  }
  if (serviceType === "storage") {
    const v = envVars.find((ev) => /^FILESYSTEM_DISK$/i.test(ev.name));
    return v?.value?.toLowerCase() || null;
  }
  if (serviceType === "mail") {
    const v = envVars.find((ev) => /^MAIL_MAILER$/i.test(ev.name));
    return v?.value?.toLowerCase() || null;
  }
  return null;
}

export interface EnvDetectionResult {
  mode: "vps" | "managed";
  hint: string;
}

/**
 * Check if a value looks like a local/self-hosted address.
 */
function isSelfHostedValue(value: string): boolean {
  return SELF_HOSTED_PATTERNS.some((p) => p.test(value.trim()));
}

/**
 * Extract a human-readable driver/engine name from env vars for a given service type.
 */
function getDriverName(
  envVars: Array<{ name: string; value: string }>,
  serviceType: string,
): string | null {
  if (serviceType === "database") {
    const conn = envVars.find((ev) => /^DB_CONNECTION$/i.test(ev.name));
    if (conn?.value) return DB_DRIVER_NAMES[conn.value.toLowerCase()] || conn.value;
  }
  if (serviceType === "cache") {
    const driver = envVars.find((ev) => /^CACHE_DRIVER$/i.test(ev.name) || /^CACHE_STORE$/i.test(ev.name));
    if (driver?.value) return CACHE_DRIVER_NAMES[driver.value.toLowerCase()] || driver.value;
  }
  if (serviceType === "queue") {
    const driver = envVars.find((ev) => /^QUEUE_CONNECTION$/i.test(ev.name) || /^QUEUE_DRIVER$/i.test(ev.name));
    if (driver?.value) return driver.value.charAt(0).toUpperCase() + driver.value.slice(1);
  }
  if (serviceType === "mail") {
    const mailer = envVars.find((ev) => /^MAIL_MAILER$/i.test(ev.name));
    if (mailer?.value) return mailer.value.charAt(0).toUpperCase() + mailer.value.slice(1);
  }
  return null;
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

    // Check if the driver means "no separate infrastructure needed"
    const rawDriver = getRawDriver(envVars, serviceType);
    const noInfraSet = NO_INFRA_DRIVERS[serviceType];
    if (rawDriver && noInfraSet?.has(rawDriver)) {
      const driverDisplay = rawDriver.charAt(0).toUpperCase() + rawDriver.slice(1);
      results[serviceType] = {
        mode: "vps",
        hint: `ℹ️ Driver: ${driverDisplay} — no separate infrastructure needed`,
      };
      continue;
    }

    const driverName = getDriverName(envVars, serviceType);
    const driverLabel = driverName ? `${driverName} ` : "";

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
        hint: `🔗 Detected: ${detectedProvider} (${driverLabel || serviceType}) from your .env`,
      };
      continue;
    }

    // Check if any host/URL value points to localhost or a private IP → self-hosted
    const hostVars = matchingVars.filter((ev) =>
      /_(HOST|URL)$/i.test(ev.name) || /^DATABASE_URL$/i.test(ev.name)
    );
    const isLocal = hostVars.some((ev) => ev.value && isSelfHostedValue(ev.value));

    if (isLocal) {
      results[serviceType] = {
        mode: "vps",
        hint: `🖥️ ${driverLabel}— local credentials detected, will be self-hosted`,
      };
      continue;
    }

    // Key exists but value is empty/placeholder or doesn't match a known provider
    const hasRealValue = matchingVars.some(
      (ev) => ev.value && ev.value !== "null" && ev.value !== "your-value-here" && ev.value.length > 3
    );

    if (hasRealValue) {
      // Has a value but we can't identify the provider — could be an external host
      // we don't recognize. Default to managed since they have real credentials.
      // But if the host is clearly local, we already caught that above.
      results[serviceType] = {
        mode: "managed",
        hint: `🔗 ${driverLabel}credentials detected from your .env`,
      };
    } else {
      results[serviceType] = {
        mode: "vps",
        hint: `⚠️ No ${driverLabel}credentials provided — will be self-hosted`,
      };
    }
  }

  return results;
}

import type { SensitiveField } from "@/components/DeployWizard";

/**
 * Static scan of an uploaded schema for fields that hold personal, sensitive
 * or secret data.
 *
 * Lives here rather than in the project-detail surface that renders it: it is a
 * parser with no React in it, it is the fallback the AI path falls back *to*,
 * and a silent regression in it reads as "this schema stores nothing sensitive"
 * — the one failure mode nobody would notice on screen.
 */

const FRAMEWORK_TABLES = new Set([
  "migrations", "jobs", "failed_jobs", "sessions", "cache", "cache_locks",
  "password_resets", "password_reset_tokens", "personal_access_tokens",
  "oauth_access_tokens", "oauth_auth_codes", "oauth_clients",
  "oauth_personal_access_clients", "oauth_refresh_tokens",
  "telescope_entries", "telescope_entries_tags", "telescope_monitoring",
  "pulse_aggregates", "pulse_entries", "pulse_values",
  "notifications", "job_batches",
]);

const SKIP_FIELDS = new Set([
  "id", "uuid", "ulid", "created_at", "updated_at", "deleted_at",
  "remember_token", "email_verified_at",
]);

/** One-way password hashes — storing these does not expose recoverable credentials. */
const HASHED_CREDENTIAL_FIELDS =
  /^(password|passwd|passphrase|encrypted_password|password_hash|hashed_password|password_digest|passwd_hash|pass_hash|bcrypt)$/i;

const PLAINTEXT_CREDENTIAL_FIELDS =
  /plain(_)?password|password_(plain|raw|cleartext)|raw_password|cleartext_password/i;

type SensitivityLevel = SensitiveField["sensitivity"];

/**
 * Split a column name into space-padded lower-case words.
 *
 * The rules below have to match whole words, and `\b` cannot express that for
 * a column name: `_` counts as a word character, so `/\bcity\b/` would never
 * match `billing_city`. Matching raw substrings instead is what made
 * `capacity` a city, `tokenized_at` an auth token and `secretary_name` a
 * secret. Digits and camelCase humps are split too, so `address2` and
 * `ipAddress` read the same as `address_2` and `ip_address`.
 */
function words(field: string): string {
  return ` ${field
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/[_\-\s]+/g, " ")
    .trim()
    .toLowerCase()} `;
}

/**
 * Compile a rule into a whole-word matcher over `words()` output. `_` in the
 * source stands for a word separator, and an optional trailing `s`/`es` keeps
 * plural columns (`emails`, `addresses`) matching.
 */
function wholeWords(source: string): RegExp {
  return new RegExp(` (?:${source.replace(/_/g, " ")})(?:e?s)? `, "i");
}

/**
 * Field-name rules, first match wins — so a specific rule must precede the
 * generic one that would otherwise swallow it (`secret_key` before `secret`,
 * `ip_address` before `address`).
 *
 * Plaintext credentials are not listed: `PLAINTEXT_CREDENTIAL_FIELDS` above
 * already returns before this table is consulted.
 *
 * shortcut: matches on the column name alone, so a real word used in another
 * sense still matches (`street_cred_points` reads as a street address).
 * Upgrade to column type or sampled values if that noise gets reported.
 */
const FIELD_RULES: Array<{ match: string; sensitivity: SensitivityLevel; reason: string }> = [
  // Secret (recoverable credentials only — hashed passwords are excluded above)
  { match: "api_key",            sensitivity: "secret",    reason: "API key" },
  { match: "private_key",        sensitivity: "secret",    reason: "Private key" },
  { match: "access_key",         sensitivity: "secret",    reason: "Access key" },
  { match: "secret_key",         sensitivity: "secret",    reason: "Secret key" },
  { match: "encryption_key",     sensitivity: "secret",    reason: "Encryption key" },
  { match: "secret",             sensitivity: "secret",    reason: "Secret value" },
  { match: "token",              sensitivity: "secret",    reason: "Authentication token" },
  // Sensitive
  { match: "credit_card",        sensitivity: "sensitive", reason: "Credit card data" },
  { match: "card_number",        sensitivity: "sensitive", reason: "Card number" },
  { match: "cvv",                sensitivity: "sensitive", reason: "CVV code" },
  { match: "ssn",                sensitivity: "sensitive", reason: "Social Security Number" },
  { match: "social_security",    sensitivity: "sensitive", reason: "Social Security Number" },
  { match: "bank_account",       sensitivity: "sensitive", reason: "Bank account info" },
  { match: "routing_number",     sensitivity: "sensitive", reason: "Routing number" },
  { match: "salary",             sensitivity: "sensitive", reason: "Financial data" },
  { match: "income",             sensitivity: "sensitive", reason: "Financial data" },
  { match: "tax_id",             sensitivity: "sensitive", reason: "Tax identifier" },
  { match: "passport",           sensitivity: "sensitive", reason: "Passport data" },
  { match: "driver_license",     sensitivity: "sensitive", reason: "Driver license" },
  { match: "health|healthcare",  sensitivity: "sensitive", reason: "Health data" },
  { match: "medical",            sensitivity: "sensitive", reason: "Medical data" },
  { match: "diagnosis",          sensitivity: "sensitive", reason: "Medical diagnosis" },
  { match: "biometric",          sensitivity: "sensitive", reason: "Biometric data" },
  // Personal
  { match: "email",              sensitivity: "personal",  reason: "Email address" },
  { match: "(?:tele)?phone",     sensitivity: "personal",  reason: "Phone number" },
  { match: "ip_address",         sensitivity: "personal",  reason: "IP address" },
  { match: "address",            sensitivity: "personal",  reason: "Physical address" },
  { match: "street",             sensitivity: "personal",  reason: "Street address" },
  { match: "city",               sensitivity: "personal",  reason: "City" },
  { match: "zip_?code",          sensitivity: "personal",  reason: "Zip code" },
  { match: "postal",             sensitivity: "personal",  reason: "Postal code" },
  { match: "first_?name",        sensitivity: "personal",  reason: "First name" },
  { match: "last_?name",         sensitivity: "personal",  reason: "Last name" },
  { match: "full_?name",         sensitivity: "personal",  reason: "Full name" },
  { match: "birth_?date",        sensitivity: "personal",  reason: "Date of birth" },
  { match: "date_of_birth",      sensitivity: "personal",  reason: "Date of birth" },
  { match: "dob",                sensitivity: "personal",  reason: "Date of birth" },
  { match: "gender",             sensitivity: "personal",  reason: "Gender" },
  { match: "nationality",        sensitivity: "personal",  reason: "Nationality" },
  { match: "ethnicity",          sensitivity: "personal",  reason: "Ethnicity" },
  { match: "religion",           sensitivity: "personal",  reason: "Religion" },
  { match: "latitude",           sensitivity: "personal",  reason: "Location data" },
  { match: "longitude",          sensitivity: "personal",  reason: "Location data" },
  { match: "geo_?location",      sensitivity: "personal",  reason: "Geolocation" },
];

const FIELD_PATTERNS = FIELD_RULES.map((rule) => ({ ...rule, pattern: wholeWords(rule.match) }));

/**
 * Classify one column name, or null when it holds nothing worth flagging.
 *
 * Hashed password columns return null on purpose: reporting them as a leak
 * trains users to ignore the list. Only plaintext credential columns are
 * `secret`.
 */
export function classifyField(field: string): { sensitivity: SensitivityLevel; reason: string } | null {
  if (SKIP_FIELDS.has(field)) return null;
  if (HASHED_CREDENTIAL_FIELDS.test(field)) return null;
  if (PLAINTEXT_CREDENTIAL_FIELDS.test(field)) {
    return { sensitivity: "secret", reason: "Plaintext credential storage" };
  }
  const haystack = words(field);
  for (const { pattern, sensitivity, reason } of FIELD_PATTERNS) {
    if (pattern.test(haystack)) return { sensitivity, reason };
  }
  return null;
}

/** Flagged columns from SQL `CREATE TABLE` and Laravel `Schema::create` sources. */
export function parseSqlSchema(sql: string): SensitiveField[] {
  const results: SensitiveField[] = [];

  // Parse SQL CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;|\))/gi;
  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    if (FRAMEWORK_TABLES.has(tableName)) continue;
    const body = match[2];
    const columnRegex = /[`"']?(\w+)[`"']?\s+(?:VARCHAR|CHAR|TEXT|INT|INTEGER|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|BOOLEAN|BOOL|DATE|DATETIME|TIMESTAMP|TIME|YEAR|BLOB|BINARY|VARBINARY|JSON|JSONB|UUID|SERIAL|ENUM|SET)/gi;
    let colMatch: RegExpExecArray | null;
    while ((colMatch = columnRegex.exec(body)) !== null) {
      const field = colMatch[1];
      if (SKIP_FIELDS.has(field)) continue;
      const classification = classifyField(field);
      if (classification) {
        results.push({ entity: tableName, field, ...classification });
      }
    }
  }

  // Parse Laravel Schema::create PHP migrations
  const laravelRegex = /Schema::create\s*\(\s*['"](\w+)['"]\s*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\)/gi;
  while ((match = laravelRegex.exec(sql)) !== null) {
    const tableName = match[1];
    if (FRAMEWORK_TABLES.has(tableName)) continue;
    const body = match[2];
    const colRegex = /\$table->(?:string|text|integer|bigInteger|smallInteger|tinyInteger|decimal|float|double|boolean|date|dateTime|timestamp|time|year|binary|json|jsonb|uuid|enum|char|longText|mediumText)\s*\(\s*['"](\w+)['"]/gi;
    let colMatch: RegExpExecArray | null;
    while ((colMatch = colRegex.exec(body)) !== null) {
      const field = colMatch[1];
      if (SKIP_FIELDS.has(field)) continue;
      const classification = classifyField(field);
      if (classification) {
        results.push({ entity: tableName, field, ...classification });
      }
    }
  }

  return results;
}

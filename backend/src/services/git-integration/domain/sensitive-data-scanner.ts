export interface SensitiveField {
  entity: string;
  field: string;
  sensitivity: "personal" | "sensitive" | "secret";
  reason: string;
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /secret|api_?key|private_?key|token|jwt|encryption/i, reason: "Credential or secret material" },
];
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /credit_?card|iban|bank_?account|ssn|tax_?id|passport|salary|billing/i, reason: "Financial or regulated identifier" },
];
const PERSONAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /email|phone|name|address|birth|dob|ip_?address|location/i, reason: "Personally identifiable information" },
];

const SKIP_FIELDS = /^(id|uuid|_id|created_?at|updated_?at|deleted_?at|remember_token|email_verified_at)$/i;

/** One-way password hashes — storing these does not expose recoverable credentials. */
const HASHED_CREDENTIAL_FIELDS =
  /^(password|passwd|passphrase|encrypted_password|password_hash|hashed_password|password_digest|passwd_hash|pass_hash|bcrypt)$/i;

const PLAINTEXT_CREDENTIAL_FIELDS =
  /plain(_)?password|password_(plain|raw|cleartext)|raw_password|cleartext_password/i;

const FRAMEWORK_TABLES = new Set([
  "migrations", "jobs", "failed_jobs", "sessions", "cache", "cache_locks",
  "password_resets", "password_reset_tokens", "personal_access_tokens",
  "oauth_access_tokens", "oauth_auth_codes", "oauth_clients",
  "oauth_personal_access_clients", "oauth_refresh_tokens",
  "telescope_entries", "telescope_entries_tags", "telescope_monitoring",
  "pulse_aggregates", "pulse_entries", "pulse_values",
  "notifications", "job_batches",
]);

const SQL_COLUMN_TYPE =
  /(?:VARCHAR|CHAR|TEXT|INT|INTEGER|BIGINT|SMALLINT|TINYINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|BOOLEAN|BOOL|DATE|DATETIME|TIMESTAMP|TIME|YEAR|BLOB|BINARY|VARBINARY|JSON|JSONB|UUID|SERIAL|ENUM|SET|BYTEA)/i;

const CREATE_TABLE_REGEX =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;|\))/gi;

const SQL_COLUMN_REGEX = new RegExp(
  String.raw`[\`"']?(\w+)[\`"']?\s+${SQL_COLUMN_TYPE.source}`,
  "gi",
);

function classifyField(fieldName: string): { sensitivity: "personal" | "sensitive" | "secret"; reason: string } | null {
  if (SKIP_FIELDS.test(fieldName)) return null;
  if (HASHED_CREDENTIAL_FIELDS.test(fieldName)) return null;
  if (PLAINTEXT_CREDENTIAL_FIELDS.test(fieldName)) {
    return { sensitivity: "secret", reason: "Plaintext credential storage" };
  }
  for (const pattern of SECRET_PATTERNS) if (pattern.pattern.test(fieldName)) return { sensitivity: "secret", reason: pattern.reason };
  for (const pattern of SENSITIVE_PATTERNS) if (pattern.pattern.test(fieldName)) return { sensitivity: "sensitive", reason: pattern.reason };
  for (const pattern of PERSONAL_PATTERNS) if (pattern.pattern.test(fieldName)) return { sensitivity: "personal", reason: pattern.reason };
  return null;
}

function parseSql(contents: Record<string, string>): SensitiveField[] {
  const results: SensitiveField[] = [];
  for (const sql of Object.values(contents)) {
    let tableMatch: RegExpExecArray | null;
    CREATE_TABLE_REGEX.lastIndex = 0;
    while ((tableMatch = CREATE_TABLE_REGEX.exec(sql)) !== null) {
      const table = tableMatch[1];
      if (FRAMEWORK_TABLES.has(table)) continue;
      const body = tableMatch[2];
      SQL_COLUMN_REGEX.lastIndex = 0;
      let columnMatch: RegExpExecArray | null;
      while ((columnMatch = SQL_COLUMN_REGEX.exec(body)) !== null) {
        const field = columnMatch[1];
        const classified = classifyField(field);
        if (classified) {
          results.push({ entity: table, field, ...classified });
        }
      }
    }
  }
  return results;
}

export function scanSensitiveData(schemaFiles: Record<string, string>, modelFiles: Record<string, string>): SensitiveField[] {
  const sqlFindings = parseSql(schemaFiles);
  const modelFindings: SensitiveField[] = [];
  for (const [path, content] of Object.entries(modelFiles)) {
    const entity = path.split("/").pop()?.replace(/\.(ts|js|py|rb|php|prisma)$/, "") || "Unknown";
    const propRegex = /(?:readonly\s+)?(\w+)\s*[?:]?\s*[:=]/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRegex.exec(content)) !== null) {
      const field = propMatch[1];
      const classified = classifyField(field);
      if (classified) {
        modelFindings.push({ entity, field, ...classified });
      }
    }
  }

  const merged = [...sqlFindings, ...modelFindings];
  const seen = new Set<string>();
  return merged.filter((entry) => {
    const key = `${entry.entity}:${entry.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

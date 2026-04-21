/**
 * Code-based sensitive data scanner.
 * Parses migration SQL, model files, and schema definitions to detect
 * personal, sensitive, and secret data fields — no AI needed.
 */

export interface SensitiveField {
  entity: string;
  field: string;
  sensitivity: "personal" | "sensitive" | "secret";
  reason: string;
}

// Patterns that indicate sensitivity, ordered by priority
const SECRET_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /password/i, reason: "Password / credential" },
  { pattern: /passwd/i, reason: "Password" },
  { pattern: /secret/i, reason: "Secret key" },
  { pattern: /api_?key/i, reason: "API key" },
  { pattern: /private_?key/i, reason: "Private key" },
  { pattern: /access_?token/i, reason: "Access token" },
  { pattern: /refresh_?token/i, reason: "Refresh token" },
  { pattern: /auth_?token/i, reason: "Auth token" },
  { pattern: /jwt/i, reason: "JWT token" },
  { pattern: /totp/i, reason: "TOTP secret" },
  { pattern: /two_?factor/i, reason: "2FA secret" },
  { pattern: /encryption/i, reason: "Encryption key" },
  { pattern: /salt$/i, reason: "Cryptographic salt" },
  { pattern: /pin_?code/i, reason: "PIN code" },
];

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /credit_?card/i, reason: "Credit card" },
  { pattern: /card_?number/i, reason: "Card number" },
  { pattern: /cvv/i, reason: "CVV code" },
  { pattern: /iban/i, reason: "Bank account (IBAN)" },
  { pattern: /bank_?account/i, reason: "Bank account" },
  { pattern: /routing_?number/i, reason: "Routing number" },
  { pattern: /ssn/i, reason: "Social Security Number" },
  { pattern: /social_?security/i, reason: "Social Security Number" },
  { pattern: /tax_?id/i, reason: "Tax ID" },
  { pattern: /national_?id/i, reason: "National ID" },
  { pattern: /passport_?number/i, reason: "Passport number" },
  { pattern: /driver_?licen/i, reason: "Driver's license" },
  { pattern: /health_?insurance/i, reason: "Health insurance" },
  { pattern: /medical/i, reason: "Medical data" },
  { pattern: /diagnosis/i, reason: "Medical diagnosis" },
  { pattern: /salary/i, reason: "Salary information" },
  { pattern: /income/i, reason: "Income data" },
  { pattern: /stripe_?id/i, reason: "Payment provider ID" },
  { pattern: /payment_?method/i, reason: "Payment method" },
  { pattern: /billing/i, reason: "Billing information" },
];

const PERSONAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bemail\b/i, reason: "Email address" },
  { pattern: /e_?mail/i, reason: "Email address" },
  { pattern: /phone/i, reason: "Phone number" },
  { pattern: /mobile/i, reason: "Mobile number" },
  { pattern: /telephone/i, reason: "Telephone" },
  { pattern: /\bname\b/i, reason: "Person name" },
  { pattern: /first_?name/i, reason: "First name" },
  { pattern: /last_?name/i, reason: "Last name" },
  { pattern: /full_?name/i, reason: "Full name" },
  { pattern: /display_?name/i, reason: "Display name" },
  { pattern: /username/i, reason: "Username" },
  { pattern: /user_?name/i, reason: "Username" },
  { pattern: /address/i, reason: "Physical address" },
  { pattern: /street/i, reason: "Street address" },
  { pattern: /city\b/i, reason: "City" },
  { pattern: /zip_?code/i, reason: "ZIP code" },
  { pattern: /postal/i, reason: "Postal code" },
  { pattern: /country/i, reason: "Country" },
  { pattern: /date_?of_?birth/i, reason: "Date of birth" },
  { pattern: /birth_?date/i, reason: "Date of birth" },
  { pattern: /\bdob\b/i, reason: "Date of birth" },
  { pattern: /gender/i, reason: "Gender" },
  { pattern: /avatar/i, reason: "Profile photo" },
  { pattern: /photo/i, reason: "Photo" },
  { pattern: /ip_?address/i, reason: "IP address" },
  { pattern: /user_?agent/i, reason: "User agent" },
  { pattern: /latitude/i, reason: "Geolocation" },
  { pattern: /longitude/i, reason: "Geolocation" },
  { pattern: /\bgeo\b/i, reason: "Geolocation" },
  { pattern: /location/i, reason: "Location data" },
  { pattern: /signature/i, reason: "Signature" },
  { pattern: /biometric/i, reason: "Biometric data" },
  { pattern: /cookie/i, reason: "Cookie data" },
  { pattern: /session_?id/i, reason: "Session identifier" },
];

// Fields to always skip
const SKIP_FIELDS = /^(id|uuid|_id|created_?at|updated_?at|deleted_?at|remember_token|email_verified_at)$/i;
const SKIP_TABLES = /^(migrations?|jobs|failed_jobs|job_batches|sessions|cache|cache_locks|password_reset_tokens|personal_access_tokens|telescope_|pulse_|oauth_|nova_)/i;

function classifyField(fieldName: string): { sensitivity: "personal" | "sensitive" | "secret"; reason: string } | null {
  if (SKIP_FIELDS.test(fieldName)) return null;

  for (const { pattern, reason } of SECRET_PATTERNS) {
    if (pattern.test(fieldName)) return { sensitivity: "secret", reason };
  }
  for (const { pattern, reason } of SENSITIVE_PATTERNS) {
    if (pattern.test(fieldName)) return { sensitivity: "sensitive", reason };
  }
  for (const { pattern, reason } of PERSONAL_PATTERNS) {
    if (pattern.test(fieldName)) return { sensitivity: "personal", reason };
  }
  return null;
}

// ─── SQL Migration Parser ───

function parseSqlMigrations(contents: Record<string, string>): SensitiveField[] {
  const results: SensitiveField[] = [];
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\);/gi;
  const columnRegex = /^\s*["`]?(\w+)["`]?\s+\w+/gm;

  for (const [, sql] of Object.entries(contents)) {
    let match;
    while ((match = createTableRegex.exec(sql)) !== null) {
      const tableName = match[1];
      if (SKIP_TABLES.test(tableName)) continue;

      const body = match[2];
      let colMatch;
      const colRegex = /^\s*["`]?(\w+)["`]?\s+(?:VARCHAR|TEXT|INT|INTEGER|BIGINT|BOOLEAN|BOOL|TIMESTAMP|DATE|DATETIME|DECIMAL|FLOAT|DOUBLE|JSON|JSONB|UUID|CHAR|BLOB|ENUM|SET|SERIAL|SMALLINT|NUMERIC|REAL|BYTEA|INET|CIDR|MACADDR|MONEY|BIT|ARRAY|HSTORE|XML|POINT|LINE|POLYGON|CIRCLE|TSVECTOR|TSQUERY)\b/gim;
      while ((colMatch = colRegex.exec(body)) !== null) {
        const field = colMatch[1];
        const classification = classifyField(field);
        if (classification) {
          results.push({ entity: tableName, field, ...classification });
        }
      }
    }
  }
  return results;
}

// ─── Model/Schema File Parser ───

function parseModelFiles(contents: Record<string, string>): SensitiveField[] {
  const results: SensitiveField[] = [];

  for (const [filePath, content] of Object.entries(contents)) {
    // Infer entity name from filename
    const fileName = filePath.split("/").pop()?.replace(/\.(ts|js|py|rb|php)$/, "") || "Unknown";
    const entity = fileName.charAt(0).toUpperCase() + fileName.slice(1);

    // PHP: $fillable, $guarded, $casts arrays
    const phpArrayRegex = /\$(fillable|guarded|casts|hidden|visible)\s*=\s*\[([\s\S]*?)\]/g;
    let phpMatch;
    while ((phpMatch = phpArrayRegex.exec(content)) !== null) {
      const items = phpMatch[2].match(/['"](\w+)['"]/g) || [];
      for (const item of items) {
        const field = item.replace(/['"]/g, "");
        const classification = classifyField(field);
        if (classification) {
          results.push({ entity, field, ...classification });
        }
      }
    }

    // Prisma: model fields
    const prismaModelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
    let prismaMatch;
    while ((prismaMatch = prismaModelRegex.exec(content)) !== null) {
      const modelName = prismaMatch[1];
      if (SKIP_TABLES.test(modelName)) continue;
      const body = prismaMatch[2];
      const fieldLines = body.split("\n").filter(l => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("@@"));
      for (const line of fieldLines) {
        const fieldMatch = line.trim().match(/^(\w+)\s+/);
        if (fieldMatch) {
          const field = fieldMatch[1];
          const classification = classifyField(field);
          if (classification) {
            results.push({ entity: modelName, field, ...classification });
          }
        }
      }
    }

    // TypeScript/JS: property patterns (key: type, key = value)
    const tsFieldRegex = /(?:readonly\s+)?(\w+)\s*[?:]?\s*:\s*(?:string|number|boolean|Date)/g;
    let tsMatch;
    while ((tsMatch = tsFieldRegex.exec(content)) !== null) {
      const field = tsMatch[1];
      const classification = classifyField(field);
      if (classification) {
        // Avoid duplicates
        if (!results.some(r => r.entity === entity && r.field === field)) {
          results.push({ entity, field, ...classification });
        }
      }
    }

    // Python: class attributes with type hints
    const pyFieldRegex = /^\s+(\w+)\s*:\s*(?:str|int|float|bool|datetime|Optional)/gm;
    let pyMatch;
    while ((pyMatch = pyFieldRegex.exec(content)) !== null) {
      const field = pyMatch[1];
      const classification = classifyField(field);
      if (classification && !results.some(r => r.entity === entity && r.field === field)) {
        results.push({ entity, field, ...classification });
      }
    }
  }

  return results;
}

// ─── Main scanner ───

export function scanSensitiveData(schemaFiles: Record<string, string>, configFiles: Record<string, string>): SensitiveField[] {
  const allFiles = { ...schemaFiles, ...configFiles };

  const sqlFiles: Record<string, string> = {};
  const modelFiles: Record<string, string> = {};

  for (const [path, content] of Object.entries(allFiles)) {
    if (/\.sql$/i.test(path)) {
      sqlFiles[path] = content;
    } else {
      modelFiles[path] = content;
    }
  }

  const sqlResults = parseSqlMigrations(sqlFiles);
  const modelResults = parseModelFiles(modelFiles);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: SensitiveField[] = [];
  for (const r of [...sqlResults, ...modelResults]) {
    const key = `${r.entity}:${r.field}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  // Sort: secret first, then sensitive, then personal
  const order = { secret: 0, sensitive: 1, personal: 2 };
  merged.sort((a, b) => order[a.sensitivity] - order[b.sensitivity]);

  return merged;
}

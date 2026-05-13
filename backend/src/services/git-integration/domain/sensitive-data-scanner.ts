export interface SensitiveField {
  entity: string;
  field: string;
  sensitivity: "personal" | "sensitive" | "secret";
  reason: string;
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /password|secret|api_?key|private_?key|token|jwt|encryption|salt/i, reason: "Credential or secret material" },
];
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /credit_?card|iban|bank_?account|ssn|tax_?id|passport|salary|billing/i, reason: "Financial or regulated identifier" },
];
const PERSONAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /email|phone|name|address|birth|dob|ip_?address|location/i, reason: "Personally identifiable information" },
];

const SKIP_FIELDS = /^(id|uuid|_id|created_?at|updated_?at|deleted_?at|remember_token|email_verified_at)$/i;

function classifyField(fieldName: string): { sensitivity: "personal" | "sensitive" | "secret"; reason: string } | null {
  if (SKIP_FIELDS.test(fieldName)) return null;
  for (const pattern of SECRET_PATTERNS) if (pattern.pattern.test(fieldName)) return { sensitivity: "secret", reason: pattern.reason };
  for (const pattern of SENSITIVE_PATTERNS) if (pattern.pattern.test(fieldName)) return { sensitivity: "sensitive", reason: pattern.reason };
  for (const pattern of PERSONAL_PATTERNS) if (pattern.pattern.test(fieldName)) return { sensitivity: "personal", reason: pattern.reason };
  return null;
}

function parseSql(contents: Record<string, string>): SensitiveField[] {
  const results: SensitiveField[] = [];
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\);/gi;
  for (const sql of Object.values(contents)) {
    let tableMatch: RegExpExecArray | null;
    while ((tableMatch = tableRegex.exec(sql)) !== null) {
      const table = tableMatch[1];
      const body = tableMatch[2];
      const columnRegex = /^\s*["`]?(\w+)["`]?\s+[A-Z]/gim;
      let columnMatch: RegExpExecArray | null;
      while ((columnMatch = columnRegex.exec(body)) !== null) {
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

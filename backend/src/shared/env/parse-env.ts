/**
 * Canonical .env File Parser
 *
 * Handles:
 * - Single-line KEY=value pairs
 * - Quoted values (single and double quotes)
 * - Multi-line quoted values
 * - Inline comments (space + # in unquoted values)
 * - Comment lines (# prefix)
 * - Empty lines
 *
 * This is the single implementation used across the codebase:
 * - Deploy pipeline (project env injection)
 * - Secrets loading (AWS/Cloudflare fallback parsing)
 * - Cloudflare secrets push script
 */

// ─── Internal Helpers ──────────────────────────────────────────────

/** Check whether a line ends with an unescaped quote character. */
function endsWithUnescapedQuote(line: string, quote: string): boolean {
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith(quote)) return false;
  let backslashes = 0;
  for (let i = trimmed.length - 2; i >= 0; i--) {
    if (trimmed[i] === "\\") backslashes++;
    else break;
  }
  return backslashes % 2 === 0;
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Parse .env file content into an array of key-value pairs.
 *
 * Supports multi-line quoted values, inline comments, and both
 * single/double quote styles. Keys are not validated beyond splitting
 * on the first `=` — callers that need strict POSIX env names should
 * filter with `SAFE_ENV_NAME` from `format-env-file.ts`.
 *
 * @example
 * ```ts
 * const vars = parseEnvContent('DB_HOST=localhost\nDB_NAME="my app"');
 * // [{ name: "DB_HOST", value: "localhost" }, { name: "DB_NAME", value: "my app" }]
 * ```
 */
export function parseEnvContent(content: string): Array<{ name: string; value: string }> {
  const vars: Array<{ name: string; value: string }> = [];
  let currentKey = "";
  let currentValue = "";
  let inMultiLine = false;
  let quoteChar = "";

  for (const line of content.split("\n")) {
    if (inMultiLine) {
      if (endsWithUnescapedQuote(line, quoteChar)) {
        const trimmed = line.trimEnd();
        currentValue += "\n" + trimmed.slice(0, -1);
        vars.push({ name: currentKey, value: currentValue });
        inMultiLine = false;
      } else {
        currentValue += "\n" + line;
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const name = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1);

    // Handle quoted values (may be multi-line)
    const stripped = value.trimStart();
    if ((stripped.startsWith('"') || stripped.startsWith("'")) && !stripped.endsWith(stripped[0])) {
      quoteChar = stripped[0];
      currentKey = name;
      currentValue = stripped.slice(1);
      inMultiLine = true;
      continue;
    }

    // Single-line: strip surrounding quotes
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Remove inline comments (unquoted)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(" #");
      if (commentIdx > -1) value = value.slice(0, commentIdx).trimEnd();
    }

    if (name) vars.push({ name, value });
  }

  // Flush any unterminated multi-line value
  if (inMultiLine && currentKey) {
    vars.push({ name: currentKey, value: currentValue });
  }

  return vars;
}

/**
 * Parse .env file content into a flat Record.
 *
 * This is the record-shaped variant used by secrets loading and scripts.
 * Duplicate keys: last occurrence wins (standard .env behavior).
 *
 * @example
 * ```ts
 * const record = parseEnvRecord('DB_HOST=localhost\nDB_PORT=5432');
 * // { DB_HOST: "localhost", DB_PORT: "5432" }
 * ```
 */
export function parseEnvRecord(content: string): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { name, value } of parseEnvContent(content)) {
    record[name] = value;
  }
  return record;
}

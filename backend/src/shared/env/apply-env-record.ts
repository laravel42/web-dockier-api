import { logger } from "../logger.js";
import { parseEnvRecord } from "./parse-env.js";

export function applyEnvRecord(
  record: Record<string, unknown>,
  source: string,
  options?: { override?: boolean },
): void {
  const override = options?.override ?? false;
  let applied = 0;

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
      applied += 1;
    }
  }

  if (applied > 0) {
    logger.info(`[env] Applied ${applied} variable(s) from ${source}`);
  }
}

/**
 * @deprecated Use `parseEnvRecord` from `./parse-env.js` directly.
 * Kept for backward compatibility with the cloudflare-secrets script.
 */
export function parseEnvFileContent(content: string): Record<string, string> {
  return parseEnvRecord(content);
}

export function parseSecretString(secretString: string): Record<string, unknown> {
  const trimmed = secretString.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("JSON secret must be a flat object of string values");
  }

  return parseEnvRecord(trimmed);
}

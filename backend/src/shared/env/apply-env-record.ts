import { logger } from "../logger.js";

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

export function parseEnvFileContent(content: string): Record<string, string> {
  const record: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    record[match[1]] = value;
  }

  return record;
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

  return parseEnvFileContent(trimmed);
}

/** POSIX-style env var names safe for .env files and docker --env-file. */
export const SAFE_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Strip trailing inline comments from unquoted .env values (space + #). */
export function stripInlineEnvComment(value: string): string {
  const commentIdx = value.search(/\s+#/);
  return commentIdx !== -1 ? value.slice(0, commentIdx).trimEnd() : value;
}

/** Format one KEY=value line, quoting when Laravel/dotenv requires it. */
export function formatEnvFileLine(name: string, value: string): string {
  const val = stripInlineEnvComment(value);
  const needsQuotes = /[\s#"'\\]/.test(val) || val === "";
  return needsQuotes
    ? `${name}="${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : `${name}=${val}`;
}

export function formatEnvFileContent(envVars: Array<{ name: string; value: string }>): string {
  return envVars
    .filter((v) => SAFE_ENV_NAME.test(v.name))
    .map((v) => formatEnvFileLine(v.name, v.value))
    .join("\n");
}

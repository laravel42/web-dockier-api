/**
 * Shared helper for replacing placeholders in Pulumi programs.
 *
 * Multiple adapters (gcp-cloudrun, gcp-compute, gcp-storage) and template-deploy
 * need to replace the same set of placeholders in the generated Pulumi index.ts.
 * This module centralizes that logic so escaping rules are defined once.
 */

/**
 * Replace __USER_ENV_FLAGS__ and __DEPLOY_DB_*__ placeholders in a Pulumi program.
 *
 * @param program - The Pulumi index.ts content
 * @param envVars - User-provided environment variables
 * @returns The program with all placeholders replaced
 */
export function replacePulumiPlaceholders(
  program: string,
  envVars: Array<{ name: string; value: string }>,
): string {
  let result = program;

  // Replace __USER_ENV_FLAGS__ with docker -e flags
  if (envVars.length > 0) {
    const userEnvFlags = envVars
      .map((e) => {
        // Escape values for embedding inside a JS template literal that becomes a bash script:
        // - backslashes must be doubled so they survive JS → bash
        // - backticks must be escaped so they don't break the template literal
        // - $ must be \$ so JS doesn't interpret ${...} as template interpolation
        // - single quotes in values are escaped with '\'' (end quote, escaped quote, start quote)
        const escaped = e.value
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$")
          .replace(/'/g, "'\\''");
        return `-e ${e.name}='${escaped}'`;
      })
      .join(" ");
    result = result.replace(/__USER_ENV_FLAGS__/g, userEnvFlags);
  } else {
    result = result.replace(/__USER_ENV_FLAGS__/g, "");
  }

  // Replace database credential placeholders with user's actual values (or defaults)
  const envMap = new Map(envVars.map((e) => [e.name, e.value]));
  const dbName = envMap.get("DB_DATABASE") || "forge";
  const dbUser = envMap.get("DB_USERNAME") || "appuser";
  const dbPass = envMap.get("DB_PASSWORD") || "apppass123";
  result = result.replace(/__DEPLOY_DB_NAME__/g, dbName);
  result = result.replace(/__DEPLOY_DB_USER__/g, dbUser);
  result = result.replace(/__DEPLOY_DB_PASS__/g, dbPass);

  return result;
}

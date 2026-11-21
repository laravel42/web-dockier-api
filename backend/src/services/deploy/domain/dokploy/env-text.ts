/**
 * The `NAME=value` text Dokploy stores for an application or compose stack.
 *
 * Dokploy reads it back with `dotenv`'s `parse` (prepareEnvironmentVariables), so the value has to
 * be written the way dotenv expects. Joining raw `NAME=value` lines silently corrupted two kinds
 * of value: anything containing `#` was cut at the `#` (a password like `pa#ss` became `pa`), and
 * anything spanning several lines kept only its first line (a PEM key became its header). A value
 * with a newline could also add variables of its own.
 *
 * dotenv processes no escapes inside single quotes or backticks, so those are preferred; double
 * quotes are the last resort because dotenv turns a literal backslash-n inside them into a newline.
 */
const QUOTES_BY_PREFERENCE = ["'", "`", '"'] as const;

/** A value dotenv returns unchanged when written bare. */
function isBareSafe(value: string): boolean {
  return !/[#\r\n]/.test(value) && value === value.trim() && !/^['"`]/.test(value);
}

export class EnvValueNotRepresentableError extends Error {
  constructor(public readonly variable: string) {
    super(
      `The value of ${variable} contains #, a line break or quotes in a combination that cannot be passed to the deployment. ` +
        "Remove one kind of quote from it or store it another way.",
    );
    this.name = "EnvValueNotRepresentableError";
  }
}

export function formatDokployEnvLine(name: string, value: string): string {
  if (isBareSafe(value)) return `${name}=${value}`;
  for (const quote of QUOTES_BY_PREFERENCE) {
    if (value.includes(quote)) continue;
    if (quote === '"' && /\\[nr]/.test(value)) continue;
    return `${name}=${quote}${value}${quote}`;
  }
  throw new EnvValueNotRepresentableError(name);
}

export function formatDokployEnv(vars: ReadonlyArray<{ name: string; value: string }>): string {
  return vars.map((v) => formatDokployEnvLine(v.name, v.value)).join("\n");
}

/**
 * Extract a message string from an unknown caught value.
 *
 * Use in catch blocks typed as `catch (e: unknown)` to safely access
 * the error message without `any` casts.
 */
export function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Extract a detailed, diagnosable message from an unknown caught value.
 *
 * Unlike `getErrMsg`, this unwraps a domain error's `cause` (often a
 * PostgREST/Postgres error carrying the real reason — `message`, `details`,
 * `hint`, `code`) and appends it. Use where a generic top-level message like
 * "Failed to upsert X" would otherwise hide the actual failure (e.g. deploy
 * pipeline logs surfaced to users/operators).
 */
export function getErrDetail(err: unknown): string {
  const base = getErrMsg(err);

  const cause = (err as { cause?: unknown } | null)?.cause;
  if (!cause) return base;

  const parts: string[] = [];
  if (cause instanceof Error) {
    parts.push(cause.message);
  } else if (typeof cause === "object" && cause !== null) {
    const c = cause as Record<string, unknown>;
    // PostgREST/PostgrestError shape
    for (const key of ["message", "details", "hint", "code"] as const) {
      const val = c[key];
      if (typeof val === "string" && val.length > 0) parts.push(`${key}: ${val}`);
    }
    if (parts.length === 0) parts.push(JSON.stringify(cause));
  } else {
    parts.push(String(cause));
  }

  const detail = parts.join(" | ");
  return detail && detail !== base ? `${base} (${detail})` : base;
}

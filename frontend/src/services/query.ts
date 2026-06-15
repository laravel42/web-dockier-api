/**
 * Build a URL query string from a params object.
 *
 * - Skips `undefined`, `null`, and empty-string values (so optional params are
 *   simply omitted).
 * - URL-encodes keys and values via `URLSearchParams`.
 * - Returns "" when no params remain, otherwise a string starting with "?".
 *
 * For optional boolean flags that should only appear when true, pass
 * `flag ? "true" : undefined` so the param is omitted when false.
 *
 * @example
 *   buildQuery({ owner, repo, branch })        // "?owner=acme&repo=app&branch=main"
 *   buildQuery({ repo, branch: undefined })    // "?repo=app"
 *   buildQuery({})                             // ""
 */
export type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

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

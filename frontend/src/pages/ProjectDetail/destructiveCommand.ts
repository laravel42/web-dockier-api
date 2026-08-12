/**
 * Destructive command patterns, from docs/delivery/blast-radius-tiers.md.
 *
 * "A false positive costs one extra click; a false negative costs a production
 * database." Matching is deliberately generous.
 */
const PATTERNS: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /\brm\b/i, why: "deletes files" },
  { re: /\bdrop\b/i, why: "drops a database object" },
  { re: /\btruncate\b/i, why: "empties a table" },
  { re: /\bmkfs\b/i, why: "formats a filesystem" },
  { re: /\bdd\b/i, why: "writes raw blocks" },
  { re: />\s*\//, why: "redirects output over an absolute path" },
  { re: /\bchmod\s+777\b/i, why: "makes files world-writable" },
  { re: /:\(\)\s*\{\s*:\|:&\s*\};:/, why: "is a fork bomb" },
  { re: /\bmigrate:fresh\b/i, why: "drops and rebuilds every table" },
  { re: /\bdb:wipe\b/i, why: "wipes the database" },
  { re: /\bflush\b/i, why: "clears stored state" },
  { re: /\bprune\s+-f\b/i, why: "force-removes unused resources" },
];

/**
 * Why this command is destructive, or null if it is ordinary.
 * The reason is shown to the user, so it must read as a consequence.
 */
export function destructiveReason(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;
  for (const { re, why } of PATTERNS) {
    if (re.test(trimmed)) return why;
  }
  return null;
}

export function isDestructiveCommand(command: string): boolean {
  return destructiveReason(command) !== null;
}

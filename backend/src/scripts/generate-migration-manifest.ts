/**
 * Regenerate `shared/database/migration-manifest.ts` from `supabase/migrations/`.
 *
 * Run with `pnpm --filter @dockier/backend-fastify migrations:manifest` after
 * adding a migration. A checked-in manifest rather than a runtime directory
 * read, because `backend/Dockerfile` copies only `backend` and `code-analysis`
 * — `supabase/` is not in the production image. It also makes the expected set
 * diff-visible in review, which a directory read never is.
 */

import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");
const outputPath = join(here, "..", "shared", "database", "migration-manifest.ts");

/** `0075_static_domain_certificates.sql` → `0075`. */
export function versionsFromDirectory(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => /^(\d+)_/.exec(name)?.[1])
    .filter((v): v is string => Boolean(v))
    .sort();
}

function main(): void {
  const versions = versionsFromDirectory(migrationsDir);

  const body = `/**
 * Canonical migration versions, generated from \`supabase/migrations/\`.
 *
 * DO NOT EDIT BY HAND. Run:
 *   pnpm --filter @dockier/backend-fastify migrations:manifest
 *
 * Exists because \`supabase/\` is not copied into the production image, so the
 * expected set cannot be read from disk at runtime. A test asserts this file
 * matches the directory, so a new migration without a regenerated manifest
 * fails CI.
 */

export const MIGRATION_VERSIONS: readonly string[] = [
${versions.map((v) => `  "${v}",`).join("\n")}
];
`;

  writeFileSync(outputPath, body, "utf8");
  process.stdout.write(`Wrote ${versions.length} migration versions to ${outputPath}\n`);
}

main();

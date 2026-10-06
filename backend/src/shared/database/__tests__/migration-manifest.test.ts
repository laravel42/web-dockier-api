/**
 * The manifest must match `supabase/migrations/` exactly.
 *
 * Without this, adding a migration and forgetting to regenerate the manifest
 * would leave `/readyz` reporting `ready` against a database that is missing
 * the new migration — the precise blind spot the readiness signal exists to
 * close.
 */

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MIGRATION_VERSIONS } from "../migration-manifest.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "..", "..", "..", "supabase", "migrations");

function versionsOnDisk(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => /^(\d+)_/.exec(name)?.[1])
    .filter((v): v is string => Boolean(v))
    .sort();
}

describe("MIGRATION_VERSIONS", () => {
  it("matches the migration files on disk", () => {
    // Regenerate with:
    //   pnpm --filter @dockier/backend-fastify migrations:manifest
    expect([...MIGRATION_VERSIONS]).toEqual(versionsOnDisk());
  });

  it("is sorted and free of duplicates", () => {
    const sorted = [...MIGRATION_VERSIONS].sort();
    expect([...MIGRATION_VERSIONS]).toEqual(sorted);
    expect(new Set(MIGRATION_VERSIONS).size).toBe(MIGRATION_VERSIONS.length);
  });

  it("omits 0074, which is a deliberately reserved gap with no file", () => {
    // This is why pending migrations are a set difference rather than a max
    // comparison: 0074 will never be applied because it does not exist.
    expect(MIGRATION_VERSIONS).not.toContain("0074");
    expect(MIGRATION_VERSIONS).toContain("0075");
  });
});

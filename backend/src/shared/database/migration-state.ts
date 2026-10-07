/**
 * Which canonical migrations the connected database is missing.
 *
 * Exists because a migration that was never applied silently disabled a whole
 * feature: the code wrote columns the table did not have, every request failed
 * the same way, and nothing anywhere said so. An operator had no signal short
 * of reading application logs.
 *
 * Read through a bare `pg.Client` rather than `supabaseAdmin`, because
 * `supabase_migrations` is not in PostgREST's exposed schemas and therefore
 * cannot be selected through the REST client at all. Precedent:
 * `services/code-analysis/domain/scan-queue-reconcile.ts`.
 */

import pg from "pg";

import { env } from "../config.js";
import { logger } from "../logger.js";
import { getPostgresConnectionConfig } from "./postgres.js";
import { MIGRATION_VERSIONS } from "./migration-manifest.js";
import { getErrMsg } from "../utils/error-message.js";

export type MigrationState =
  | { status: "ready" }
  | { status: "pending"; versions: string[] }
  /** Could not be determined. Never contributes to `degraded`. */
  | { status: "unknown"; reason: string };

/** Long enough to be useful on a probe, short enough not to pin a bad read. */
const CACHE_TTL_MS = 30_000;

let cached: { at: number; state: MigrationState } | null = null;
let inFlight: Promise<MigrationState> | null = null;

/** Visible for tests. */
export function resetMigrationStateCache(): void {
  cached = null;
  inFlight = null;
}

async function readAppliedVersions(databaseUrl: string): Promise<Set<string>> {
  const client = new pg.Client(getPostgresConnectionConfig(databaseUrl));
  try {
    await client.connect();
    // Bounded so a probe can never hang on a struggling database.
    await client.query("SET statement_timeout = '2s'");
    const { rows } = await client.query<{ version: string }>(
      "SELECT version FROM supabase_migrations.schema_migrations",
    );
    return new Set(rows.map((r) => r.version));
  } finally {
    await client.end();
  }
}

async function computeMigrationState(): Promise<MigrationState> {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    return { status: "unknown", reason: "DATABASE_URL is not configured" };
  }

  try {
    const applied = await readAppliedVersions(databaseUrl);
    // A set difference, NOT a max comparison: `0074` is a deliberately
    // reserved gap with no file, so "highest applied >= highest canonical"
    // would be both wrong and fragile.
    const pending = MIGRATION_VERSIONS.filter((v) => !applied.has(v));
    return pending.length === 0 ? { status: "ready" } : { status: "pending", versions: pending };
  } catch (err) {
    // Fails OPEN on purpose. A diagnostic that invents outages is worse than
    // no diagnostic: a role without access to the ledger, or a transient
    // connection failure, must not mark a healthy instance degraded.
    const reason = getErrMsg(err);
    logger.warn({ err: reason }, "[migrations] could not read the migration ledger");
    return { status: "unknown", reason };
  }
}

/**
 * Cached for {@link CACHE_TTL_MS}, with a single in-flight read shared by
 * concurrent callers.
 *
 * `pending` and `unknown` are cached too: at deploy scale a probe runs often,
 * and neither a lagging ledger nor a broken read should cost a query per
 * request.
 */
export async function getMigrationState(): Promise<MigrationState> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.state;
  if (inFlight) return await inFlight;

  inFlight = computeMigrationState()
    .then((state) => {
      cached = { at: Date.now(), state };
      return state;
    })
    .finally(() => {
      inFlight = null;
    });

  return await inFlight;
}

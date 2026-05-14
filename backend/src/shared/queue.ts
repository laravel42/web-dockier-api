/**
 * Job queue powered by pg-boss (PostgreSQL-backed).
 *
 * Provides persistent, retryable background job processing for deploy pipelines.
 * Replaces the in-process setImmediate() approach with crash-safe, at-least-once delivery.
 *
 * pg-boss creates its own schema (pgboss) in the database and manages job lifecycle
 * (queued → active → completed/failed) with configurable retries and expiration.
 */

import { PgBoss } from "pg-boss";

let boss: PgBoss | null = null;

/**
 * Get or create the pg-boss instance.
 * Requires DATABASE_URL environment variable (Postgres connection string).
 * Returns null if DATABASE_URL is not configured (graceful degradation).
 */
export function getQueue(): PgBoss | null {
  if (boss) return boss;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[queue] DATABASE_URL not set — job queue disabled, falling back to in-process execution");
    return null;
  }

  boss = new PgBoss({
    connectionString: databaseUrl,
    schema: "pgboss",
    // Auto-create schema and tables on start
    migrate: true,
    // Monitor for stuck jobs every 60s
    monitorIntervalSeconds: 60,
  });

  boss.on("error", (err: Error) => {
    console.error("[queue] pg-boss error:", err);
  });

  return boss;
}

/**
 * Start the job queue (call once during server startup).
 * Creates the pgboss schema if it doesn't exist and begins monitoring.
 * No-op if DATABASE_URL is not configured.
 */
export async function startQueue(): Promise<void> {
  const queue = getQueue();
  if (!queue) return;

  await queue.start();
  console.log("[queue] pg-boss started");
}

/**
 * Stop the job queue gracefully (call during server shutdown).
 */
export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 30_000 });
  boss = null;
  console.log("[queue] pg-boss stopped");
}

// ─── Queue Names ───────────────────────────────────────────────────

export const DEPLOY_QUEUE = "deploy-pipeline";

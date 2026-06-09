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
let queueStarted = false;
let queueInitFailed = false;

export function isQueueReady(): boolean {
  return queueStarted && boss !== null;
}

/**
 * Get or create the pg-boss instance.
 * Requires DATABASE_URL environment variable (Postgres connection string).
 * Returns null if DATABASE_URL is not configured (graceful degradation).
 */
export function getQueue(): PgBoss | null {
  if (boss) return boss;
  if (queueInitFailed) return null;

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
export async function startQueue(): Promise<boolean> {
  if (queueStarted) return true;
  if (queueInitFailed) return false;

  const queue = getQueue();
  if (!queue) return false;

  try {
    await queue.start();
    queueStarted = true;
    console.log("[queue] pg-boss started");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[queue] pg-boss failed to start — background jobs disabled: ${message}`);
    queueInitFailed = true;
    queueStarted = false;
    await queue.stop().catch(() => {});
    boss = null;
    return false;
  }
}

/**
 * Stop the job queue gracefully (call during server shutdown).
 */
export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 30_000 });
  boss = null;
  queueStarted = false;
  console.log("[queue] pg-boss stopped");
}

// ─── Queue Names ───────────────────────────────────────────────────

export const DEPLOY_QUEUE = "deploy-pipeline";
export const IMAGE_BUILD_QUEUE = "image-build";
export const SECURITY_SCAN_QUEUE = "security-scan";

// ─── Generic Worker Factory ────────────────────────────────────────

export interface WorkerOptions {
  /** Number of retries on failure (default: 2) */
  retryLimit?: number;
  /** Max seconds a job can run before expiring (default: 1200) */
  expireInSeconds?: number;
  /** Batch size for work polling (default: 1) */
  batchSize?: number;
  /** Polling interval in seconds (default: 5) */
  pollingIntervalSeconds?: number;
}

export interface WorkerInstance<T> {
  register: () => Promise<void>;
  enqueue: (input: T, singletonKey?: string) => Promise<void>;
}

/**
 * Create a typed worker for a pg-boss queue.
 *
 * Returns { register, enqueue } — call register() once at startup,
 * then enqueue() whenever a job needs processing.
 *
 * Falls back to in-process execution via setImmediate when pg-boss
 * is unavailable (DATABASE_URL not set).
 */
export function createWorker<T>(
  queueName: string,
  handler: (input: T) => Promise<void>,
  options: WorkerOptions = {},
): WorkerInstance<T> {
  const {
    retryLimit = 2,
    expireInSeconds = 1200,
    batchSize = 1,
    pollingIntervalSeconds = 5,
  } = options;

  let registered = false;

  async function register(): Promise<void> {
    if (!isQueueReady() || registered) return;
    const queue = boss;
    if (!queue) return;

    // Set flag synchronously to prevent concurrent duplicate registrations
    registered = true;

    try {
      await queue.createQueue(queueName);

      await queue.work(queueName, { batchSize, pollingIntervalSeconds }, async (jobs: any[]) => {
        if (!jobs || jobs.length === 0) return;

        for (const job of jobs) {
          if (!job) continue;
          const input = job.data as T;
          const jobId = job.id as string;
          console.log(`[${queueName}] Processing job ${jobId}`);
          try {
            await handler(input);
            console.log(`[${queueName}] Completed job ${jobId}`);
          } catch (err) {
            console.error(`[${queueName}] Failed job ${jobId}:`, err);
            throw err; // re-throw so pg-boss marks it failed and retries
          }
        }
      });

      console.log(`[${queueName}] Worker registered`);
    } catch (err) {
      registered = false;
      throw err;
    }
  }

  async function enqueue(input: T, singletonKey?: string): Promise<void> {
    if (isQueueReady() && boss) {
      await boss.send(queueName, input as unknown as Record<string, unknown>, {
        retryLimit,
        expireInSeconds,
        ...(singletonKey ? { singletonKey } : {}),
      });
      console.log(`[${queueName}] Enqueued job${singletonKey ? ` (key: ${singletonKey})` : ""}`);
      return;
    }

    console.warn(`[${queueName}] Queue unavailable — running job in-process${singletonKey ? ` (key: ${singletonKey})` : ""}`);
    setImmediate(() => {
      handler(input).catch((err) => {
        console.error(`[${queueName}] Job failed${singletonKey ? ` (key: ${singletonKey})` : ""}:`, err);
      });
    });
  }

  return { register, enqueue };
}

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
import type { JobWithMetadata } from "pg-boss";
import { getPostgresConnectionConfig } from "./postgres.js";
import { logger } from "../logger.js";
import { getErrMsg } from "../utils/error-message.js";
import { env } from "../config.js";

let boss: PgBoss | null = null;
let queueStarted = false;
let starting: Promise<boolean> | null = null;

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

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("[queue] DATABASE_URL not set — job queue disabled, falling back to in-process execution");
    return null;
  }

  boss = new PgBoss({
    ...getPostgresConnectionConfig(databaseUrl),
    schema: "pgboss",
    // Cap the internal connection pool. The DB pooler runs in session mode with
    // a hard client limit (e.g. 15), shared across all environments (local dev +
    // Railway). Keeping this small leaves headroom and avoids EMAXCONNSESSION,
    // even when a `tsx watch` restart briefly overlaps old and new connections.
    max: env.PGBOSS_MAX_CONNECTIONS,
    // Timeout (ms) waiting for a connection from the pool. Prevents the enqueue
    // call from blocking indefinitely when the pool is exhausted or Postgres is
    // unresponsive, which would cascade and stall HTTP requests.
    connectionTimeoutMillis: 10_000,
    // Auto-create schema and tables on start
    migrate: true,
    // Monitor for stuck jobs every 60s
    monitorIntervalSeconds: 60,
  });

  boss.on("error", (err: Error) => {
    logger.error({ err }, "[queue] pg-boss error");
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
  // One attempt in flight: concurrent enqueues wait on the same promise instead
  // of opening N connections at once. Cleared on settle so a failure can retry.
  if (!starting) {
    starting = startQueueOnce().finally(() => {
      starting = null;
    });
  }
  return starting;
}

async function startQueueOnce(): Promise<boolean> {
  const queue = getQueue();
  if (!queue) return false;

  try {
    await queue.start();
    queueStarted = true;
    logger.info("[queue] pg-boss started");
    return true;
  } catch (err) {
    const message = getErrMsg(err);
    logger.error(`[queue] pg-boss failed to start — background jobs disabled: ${message}`);
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
  logger.info("[queue] pg-boss stopped");
}

// ─── Queue Names ───────────────────────────────────────────────────

export const DEPLOY_QUEUE = "deploy-pipeline";
export const SECURITY_SCAN_QUEUE = "security-scan";
export const COMMAND_EXEC_QUEUE = "command-exec";
export const CONFIG_APPLY_QUEUE = "config-apply";
export const CERT_POLL_QUEUE = "cert-poll";

// ─── Generic Worker Factory ────────────────────────────────────────

/**
 * Optional correlation ID that can be included in any job payload.
 * When present, the worker's child logger includes it for end-to-end
 * request tracing (HTTP request → queue → worker → completion).
 *
 * Pass `request.id` (Fastify's auto-assigned request ID) at enqueue time.
 */
export interface Traceable {
  correlationId?: string;
}

export interface WorkerOptions {
  /** Number of retries on failure (default: 2) */
  retryLimit?: number;
  /**
   * Seconds to wait before the first retry, doubling on each subsequent one
   * when `retryBackoff` is enabled (default: 30).
   */
  retryDelaySeconds?: number;
  /**
   * Spread retries out exponentially instead of firing them back to back
   * (default: true). pg-boss applies its own jitter on top.
   *
   * pg-boss defaults `retryDelay` to 0, so previously every attempt landed
   * within seconds of the first — no help at all against the failures that
   * actually dominate here: a rate-limited provider API, or a dependency
   * that is briefly down. Backing off gives the dependency time to recover
   * before the last attempt is spent.
   */
  retryBackoff?: boolean;
  /** Max seconds a job can run before expiring (default: 1200) */
  expireInSeconds?: number;
  /** Batch size for work polling (default: 1) */
  batchSize?: number;
  /** Polling interval in seconds (default: 5) */
  pollingIntervalSeconds?: number;
  /**
   * Keep the payload of a job that exhausted every retry, in a companion
   * `<queueName>-dead` queue (default: true).
   *
   * Without it an exhausted job is logged and dropped: a deploy that failed its
   * last attempt leaves no recoverable trace and cannot be replayed. pg-boss
   * copies the payload into the dead letter queue, so the job stays inspectable
   * (`select * from pgboss.job where name = '<queueName>-dead'`) and can be
   * re-sent to the original queue.
   *
   * Nothing consumes the dead letter queue on purpose. The copy inherits the
   * original's retry configuration, so a worker there would re-run work that
   * already failed every attempt.
   *
   * Opt out only for a queue whose work is re-derived on the next run, like a
   * cron sweep — there a dead job is noise, not information.
   */
  deadLetter?: boolean;
}

export interface EnqueueResult {
  /** Whether the job was persisted to the queue (true) or ran in-process as fallback (false) */
  queued: boolean;
}

export interface WorkerInstance<T> {
  register: () => Promise<void>;
  enqueue: (input: T, singletonKey?: string) => Promise<EnqueueResult>;
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
    retryDelaySeconds = 30,
    retryBackoff = true,
    expireInSeconds = 1200,
    batchSize = 1,
    pollingIntervalSeconds = 5,
    deadLetter = true,
  } = options;

  const deadLetterQueue = `${queueName}-dead`;

  let registered = false;

  async function register(): Promise<void> {
    if (!isQueueReady() || registered) return;
    const queue = boss;
    if (!queue) return;

    // Set flag synchronously to prevent concurrent duplicate registrations
    registered = true;

    try {
      // Created first: pgboss.job.dead_letter is a FK to pgboss.queue(name), so
      // the target has to exist before any job can reference it.
      if (deadLetter) await queue.createQueue(deadLetterQueue);

      await queue.createQueue(queueName);

      // updateQueue, not a `deadLetter` option on createQueue above: pg-boss's
      // create_queue ends in ON CONFLICT DO NOTHING, so for a queue that is
      // already in the database — which is every queue in any deployed
      // environment — the option is silently ignored and no error is raised.
      // updateQueue is the only call that reaches an existing row.
      //
      // Only new jobs are covered: the insert resolves the target with
      // COALESCE(job.deadLetter, queue.dead_letter), so jobs enqueued before
      // this ran keep dead_letter NULL and are still dropped on exhaustion.
      if (deadLetter) await queue.updateQueue(queueName, { deadLetter: deadLetterQueue });

      // includeMetadata for retryCount/retryLimit: without it pg-boss delivers
      // the minimal Job, and the terminal-attempt log below cannot tell a
      // failure that will be retried from the one that ends the job.
      await queue.work(queueName, { batchSize, pollingIntervalSeconds, includeMetadata: true }, async (jobs: JobWithMetadata<T>[]) => {
        if (!jobs || jobs.length === 0) return;

        for (const job of jobs) {
          if (!job) continue;
          const input = job.data;
          const jobId = job.id;
          const correlationId = (input as unknown as Traceable)?.correlationId;
          const jobLogger = logger.child({ jobId, queue: queueName, ...(correlationId ? { correlationId } : {}) });
          jobLogger.info("Processing job");
          try {
            await handler(input);
            jobLogger.info("Completed job");
          } catch (err) {
            // A retry and a death used to log the identical "Failed job" line,
            // so nothing in the logs marked the attempt that actually lost the
            // work — the one worth alerting on.
            //
            // pg-boss increments retry_count when it fetches a job that has run
            // before (plans.js:852) and fails rather than retries once
            // retry_count is no longer below retry_limit (plans.js:1071), so
            // this comparison is exactly "failing now ends the job". Read off
            // the job, not the worker's own options, so a job enqueued with
            // different limits (or by `schedule`) is still judged correctly.
            if (job.retryCount >= job.retryLimit) {
              jobLogger.error(
                { err, retryCount: job.retryCount, ...(deadLetter ? { deadLetterQueue } : {}) },
                deadLetter
                  ? "Job exhausted every retry — payload kept in the dead letter queue for replay"
                  : "Job exhausted every retry — payload dropped, this queue has no dead letter queue",
              );
            } else {
              jobLogger.error({ err, retryCount: job.retryCount, retryLimit: job.retryLimit }, "Failed job, will retry");
            }
            throw err; // re-throw so pg-boss marks it failed and retries
          }
        }
      });

      logger.info(`[${queueName}] Worker registered`);
    } catch (err) {
      registered = false;
      throw err;
    }
  }

  async function enqueue(input: T, singletonKey?: string): Promise<EnqueueResult> {
    // shortcut: with Postgres genuinely down every enqueue pays one connection
    // attempt bounded by connectionTimeoutMillis (10_000); accepted over degrading
    // the process for its whole lifetime, revisit if /readyz is wired to a probe.
    // register() is needed because run-server.ts only registers workers when the
    // boot-time start succeeded — a lazily started queue would otherwise persist
    // jobs with no consumer. Attempted on every enqueue (both calls are a no-op
    // once they have succeeded) so a failed registration is retried.
    if (await startQueue()) {
      await register().catch((err) => logger.error({ err }, `[${queueName}] Worker registration after a lazy queue start failed`));
    }

    if (isQueueReady() && boss) {
      await boss.send(queueName, input as unknown as Record<string, unknown>, {
        retryLimit,
        retryDelay: retryDelaySeconds,
        retryBackoff,
        expireInSeconds,
        ...(singletonKey ? { singletonKey } : {}),
      });
      logger.info(`[${queueName}] Enqueued job${singletonKey ? ` (key: ${singletonKey})` : ""}`);
      return { queued: true };
    }

    logger.warn(`[${queueName}] Queue unavailable — running job in-process${singletonKey ? ` (key: ${singletonKey})` : ""}`);
    setImmediate(() => {
      handler(input).catch((err) => {
        logger.error({ err }, `[${queueName}] In-process job failed${singletonKey ? ` (key: ${singletonKey})` : ""}`);
      });
    });
    return { queued: false };
  }

  return { register, enqueue };
}

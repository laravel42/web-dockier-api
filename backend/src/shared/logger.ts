/**
 * Shared structured logger (pino) for server-side observability.
 *
 * Use this in code that runs OUTSIDE an HTTP request context — background
 * workers, the pg-boss job queue, startup/shutdown, and reconciliation jobs.
 * Inside route handlers, prefer `request.log` (already request-scoped).
 *
 * IMPORTANT — this is NOT the user-facing deploy log. Per-deployment history
 * shown in the UI is written to the `deployments.logs` column via
 * `createDeployLogger` (see lib/logging.ts) and must stay independent of this
 * observability logger.
 *
 * pino is pinned to the same version Fastify uses, so output formatting matches
 * the request logs emitted by the app.
 *
 * pino call conventions:
 *   logger.info("message")
 *   logger.info({ key: value }, "message")
 *   logger.error({ err }, "message")   // pass errors under the `err` key
 */

import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

export type Logger = typeof logger;

/**
 * Processes Routes — Composer
 *
 * Registers all process-related sub-route modules.
 * Each module handles a focused domain:
 *   - processes: Background process CRUD and lifecycle management
 *   - scheduled-jobs: Cron-based scheduled job CRUD and lifecycle
 */

import type { FastifyInstance } from "fastify";
import { registerBackgroundProcessRoutes } from "./routes/processes.js";
import { registerScheduledJobRoutes } from "./routes/scheduled-jobs.js";

export async function registerProcessesRoutes(app: FastifyInstance) {
  await registerBackgroundProcessRoutes(app);
  await registerScheduledJobRoutes(app);
}

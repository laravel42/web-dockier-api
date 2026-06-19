/**
 * Git Integration Routes — Composer
 *
 * Registers all git-integration sub-route modules.
 * Each module handles a focused domain:
 *   - connections: CRUD, repo listing, branches
 *   - repository: tree, file content, members, commits, stats, issues
 *   - analysis: stack analysis, repo-analyze, sensitive data, badges, MR creation
 *   - cache: cache invalidation endpoints
 */

import type { FastifyInstance } from "fastify";
import { registerConnectionRoutes } from "./routes/connections.js";
import { registerRepositoryRoutes } from "./routes/repository.js";
import { registerAnalysisRoutes } from "./routes/analysis.js";
import { registerCacheRoutes } from "./routes/cache.js";

export async function registerGitIntegrationRoutes(app: FastifyInstance) {
  await registerConnectionRoutes(app);
  await registerRepositoryRoutes(app);
  await registerAnalysisRoutes(app);
  await registerCacheRoutes(app);
}

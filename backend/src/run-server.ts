import { buildApp, type ServiceName } from "./app.js";
import { env } from "./shared/config.js";
import { logger } from "./shared/logger.js";
import { startQueue, stopQueue } from "./shared/queue.js";
import { registerDeployWorker } from "./services/deploy/domain/worker.js";
import { registerImageBuildWorker } from "./services/image-builder/domain/worker.js";
import { registerScanWorker } from "./services/code-analysis/domain/worker.js";
import { seedCustomRules } from "./services/code-analysis/domain/seed-custom-rules.js";
import { reconcileAllStaleScans } from "./services/code-analysis/domain/scan-reconcile.js";
import { reconcileStaleScanJobs } from "./services/code-analysis/domain/scan-queue-reconcile.js";

export async function runServer(): Promise<void> {
  const serviceName = env.SERVICE_NAME as ServiceName;
  const app = await buildApp(serviceName);

  // Only the domains that own a background queue run workers. The `gateway`
  // service runs all of them (monolith mode); split services run only their own,
  // avoiding unnecessary queue connections and unrelated worker registration.
  const runDeploy = serviceName === "gateway" || serviceName === "deploy";
  const runImageBuilder = serviceName === "gateway" || serviceName === "image-builder";
  const runCodeAnalysis = serviceName === "gateway" || serviceName === "code-analysis";
  const needsQueue = runDeploy || runImageBuilder || runCodeAnalysis;

  const queueReady = needsQueue ? await startQueue() : false;
  if (needsQueue && !queueReady) {
    logger.warn("[queue] Skipping worker registration — queue unavailable");
  }

  if (queueReady) {
    if (runCodeAnalysis) {
      const staleJobs = await reconcileStaleScanJobs();
      if (staleJobs > 0) {
        logger.info(`[scan] Cancelled ${staleJobs} stale queue job(s) on startup`);
      }
    }
    if (runDeploy) await registerDeployWorker();
    if (runImageBuilder) await registerImageBuildWorker();
    if (runCodeAnalysis) await registerScanWorker();
  }

  if (runCodeAnalysis) {
    try {
      await seedCustomRules();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[scan] Custom rule seed skipped: ${message}`);
    }

    try {
      const staleScans = await reconcileAllStaleScans();
      if (staleScans > 0) {
        logger.info(`[scan] Reconciled ${staleScans} stale scan(s) on startup`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[scan] Stale scan reconciliation skipped: ${message}`);
    }
  }

  await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });

  logger.info(`\n🚀 Backend v2025-05-18-C — server running on port ${env.PORT} (service: ${serviceName})\n`);

  const shutdown = async () => {
    await app.close();
    if (needsQueue) await stopQueue();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

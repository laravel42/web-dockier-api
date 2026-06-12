import { buildApp, type ServiceName } from "./app.js";
import { env } from "./shared/config.js";
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

  const queueReady = await startQueue();
  if (queueReady) {
    const staleJobs = await reconcileStaleScanJobs();
    if (staleJobs > 0) {
      console.log(`[scan] Cancelled ${staleJobs} stale queue job(s) on startup`);
    }
    await registerDeployWorker();
    await registerImageBuildWorker();
    await registerScanWorker();
  } else {
    console.warn("[queue] Skipping worker registration — queue unavailable");
  }

  try {
    await seedCustomRules();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[scan] Custom rule seed skipped: ${message}`);
  }

  try {
    const staleScans = await reconcileAllStaleScans();
    if (staleScans > 0) {
      console.log(`[scan] Reconciled ${staleScans} stale scan(s) on startup`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[scan] Stale scan reconciliation skipped: ${message}`);
  }

  await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });

  console.log(`\n🚀 Backend v2025-05-18-C — server running on port ${env.PORT} (service: ${serviceName})\n`);

  const shutdown = async () => {
    await app.close();
    await stopQueue();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

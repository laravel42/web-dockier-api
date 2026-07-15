import { buildApp, type ServiceName } from "./app.js";
import { env } from "./shared/config.js";
import { logger } from "./shared/logger.js";
import { startQueue, stopQueue } from "./shared/queue.js";
import { registerDeployWorker } from "./services/deploy/domain/worker.js";
import { registerImageBuildWorker } from "./services/image-builder/domain/worker.js";
import { registerScanWorker } from "./services/code-analysis/domain/worker.js";
import { registerCommandWorker } from "./services/commands/domain/worker.js";
import { registerConfigApplyWorker } from "./services/domains/domain/worker.js";
import { seedCustomRules } from "./services/code-analysis/domain/seed-custom-rules.js";
import { reconcileAllStaleScans } from "./services/code-analysis/domain/scan-reconcile.js";
import { reconcileStaleScanJobs } from "./services/code-analysis/domain/scan-queue-reconcile.js";

// ─── Worker Registry ───────────────────────────────────────────────
//
// Each entry declares which service(s) own a background worker.
// The `gateway` service always runs all workers (monolith mode).
// Split services run only the workers they own.
//
// To add a new worker: import its register function and add an entry here.

interface WorkerEntry {
  /** Which split-mode services run this worker (gateway always included) */
  services: ServiceName[];
  /** Called once at startup to register the queue consumer */
  register: () => Promise<void>;
  /** Optional pre-registration hook (e.g. reconcile stale jobs) */
  onStartup?: () => Promise<void>;
}

const workerRegistry: WorkerEntry[] = [
  { services: ["deploy"], register: registerDeployWorker },
  { services: ["image-builder"], register: registerImageBuildWorker },
  {
    services: ["code-analysis"],
    register: registerScanWorker,
    onStartup: async () => {
      const staleJobs = await reconcileStaleScanJobs();
      if (staleJobs > 0) {
        logger.info(`[scan] Cancelled ${staleJobs} stale queue job(s) on startup`);
      }
    },
  },
  { services: ["commands"], register: registerCommandWorker },
  { services: ["domains", "network"], register: registerConfigApplyWorker },
];

// ─── Startup Hooks ─────────────────────────────────────────────────
//
// Non-queue tasks that run once at startup for specific services.
// Separate from workers because they don't require pg-boss.

interface StartupHook {
  services: ServiceName[];
  run: () => Promise<void>;
}

const startupHooks: StartupHook[] = [
  {
    services: ["code-analysis"],
    run: async () => {
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
    },
  },
];

// ─── Server ────────────────────────────────────────────────────────

function shouldRun(entry: { services: ServiceName[] }, serviceName: ServiceName): boolean {
  return serviceName === "gateway" || entry.services.includes(serviceName);
}

export async function runServer(): Promise<void> {
  const serviceName = env.SERVICE_NAME as ServiceName;
  const app = await buildApp(serviceName);

  const activeWorkers = workerRegistry.filter((w) => shouldRun(w, serviceName));
  const needsQueue = activeWorkers.length > 0;

  const queueReady = needsQueue ? await startQueue() : false;
  if (needsQueue && !queueReady) {
    logger.warn("[queue] Skipping worker registration — queue unavailable");
  }

  if (queueReady) {
    for (const worker of activeWorkers) {
      if (worker.onStartup) await worker.onStartup();
      await worker.register();
    }
  }

  // Run non-queue startup hooks
  for (const hook of startupHooks) {
    if (shouldRun(hook, serviceName)) {
      await hook.run();
    }
  }

  await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });

  logger.info(`\n🚀 Backend v2026-06-23 — server running on port ${env.PORT} (service: ${serviceName})\n`);

  const shutdown = async () => {
    await app.close();
    if (needsQueue) await stopQueue();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

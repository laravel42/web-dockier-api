import { buildApp, type ServiceName } from "./app.js";
import { env } from "./shared/config.js";
import { logger } from "./shared/logger.js";
import { startQueue, stopQueue } from "./shared/database/queue.js";
import { destroyPermissionCache } from "./shared/permissions/authorization.js";
import { destroyRateLimitStore } from "./shared/http/rate-limit.js";
import { registerDeployWorker } from "./services/deploy/domain/worker.js";
import { registerImageBuildWorker } from "./services/image-builder/domain/worker.js";
import { registerScanWorker } from "./services/code-analysis/domain/worker.js";
import { registerCommandWorker } from "./services/commands/domain/worker.js";
import { registerConfigApplyWorker } from "./shared/workers/config-apply.js";
import { registerDomainHandlers } from "./services/domains/domain/worker.js";
import { registerNetworkHandlers } from "./services/network/domain/worker.js";
import { seedCustomRules } from "./services/code-analysis/domain/seed-custom-rules.js";
import { reconcileAllStaleScans } from "./services/code-analysis/domain/scan-reconcile.js";
import { reconcileStaleScanJobs } from "./services/code-analysis/domain/scan-queue-reconcile.js";
import { registerNotificationEventHandlers } from "./services/notifications/domain/event-handlers.js";

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
  {
    services: ["deploy"],
    register: registerDeployWorker,
    onStartup: async () => {
      const { warnIfDokployMisconfigured } = await import("./services/deploy/domain/dokploy/config.js");
      warnIfDokployMisconfigured((msg) => logger.warn(msg));
    },
  },
  { services: ["image-builder"], register: registerImageBuildWorker },
  {
    services: ["code-analysis"],
    register: async () => {
      if (env.DISABLE_TS_SCAN_WORKER) {
        logger.info("[scan] TS scan worker disabled — SAST workers consume security-scan");
        return;
      }
      await registerScanWorker();
    },
    onStartup: async () => {
      const staleJobs = await reconcileStaleScanJobs();
      if (staleJobs > 0) {
        logger.info(`[scan] Cancelled ${staleJobs} stale queue job(s) on startup`);
      }
    },
  },
  { services: ["commands"], register: registerCommandWorker },
  {
    services: ["domains", "network"],
    register: registerConfigApplyWorker,
    onStartup: async () => {
      registerDomainHandlers();
      registerNetworkHandlers();
    },
  },
];

// ─── Startup Hooks ─────────────────────────────────────────────────
//
// Non-queue tasks that run once at startup for specific services.
// Separate from workers because they don't require pg-boss.
//
// These run AFTER the server starts listening so that the /healthz
// endpoint is responsive immediately. Failures are logged but do not
// prevent the server from serving traffic.

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

  // Register domain event handlers (runs for all services — events are in-process)
  registerNotificationEventHandlers();

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

  await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });

  logger.info(`\n🚀 Backend v2026-06-23 — server running on port ${env.PORT} (service: ${serviceName})\n`);

  // Run non-queue startup hooks AFTER the server is listening.
  // This ensures /healthz responds immediately while background
  // initialization (rule seeding, stale scan reconciliation) proceeds.
  const activeHooks = startupHooks.filter((h) => shouldRun(h, serviceName));
  if (activeHooks.length > 0) {
    setImmediate(async () => {
      for (const hook of activeHooks) {
        try {
          await hook.run();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`[startup] Post-listen hook failed: ${message}`);
        }
      }
    });
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("[shutdown] Graceful shutdown initiated");
    try { await app.close(); } catch (err) { logger.error({ err }, "[shutdown] app.close() failed"); }
    try { if (needsQueue) await stopQueue(); } catch (err) { logger.error({ err }, "[shutdown] stopQueue() failed"); }
    destroyPermissionCache();
    destroyRateLimitStore();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

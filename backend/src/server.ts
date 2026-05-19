import { buildApp, type ServiceName } from "./app.js";
import { env } from "./shared/config.js";
import { startQueue, stopQueue } from "./shared/queue.js";
import { registerDeployWorker } from "./services/deploy/domain/worker.js";

async function start() {
  const serviceName = env.SERVICE_NAME as ServiceName;
  const app = await buildApp(serviceName);

  // Start the job queue and register workers
  await startQueue();
  await registerDeployWorker();

  await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });

  console.log(`\n🚀 Backend v2025-05-18-C — server running on port ${env.PORT} (service: ${serviceName})\n`);

  // Graceful shutdown
  const shutdown = async () => {
    await app.close();
    await stopQueue();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

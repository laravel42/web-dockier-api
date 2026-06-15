import { initConfig } from "./shared/config.js";
import { logger } from "./shared/logger.js";

async function start() {
  await initConfig();
  const { runServer } = await import("./run-server.js");
  await runServer();
}

start().catch((error) => {
  logger.error({ err: error }, "Server error");
  process.exit(1);
});

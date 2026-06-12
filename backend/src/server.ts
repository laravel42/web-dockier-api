import { initConfig } from "./shared/config.js";

async function start() {
  await initConfig();
  const { runServer } = await import("./run-server.js");
  await runServer();
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { buildApp, type ServiceName } from "./app.js";
import { env } from "./shared/config.js";

async function start() {
  const serviceName = env.SERVICE_NAME as ServiceName;
  const app = await buildApp(serviceName);
  await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

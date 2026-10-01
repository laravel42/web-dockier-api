import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { type ServiceName } from "./shared/constants/services.js";
import { authPlugin } from "./shared/auth/auth.js";
import { authorizationPlugin } from "./shared/permissions/authorization.js";
import { projectAccessPlugin } from "./shared/http/project-access.js";
import { rawBodyPlugin } from "./shared/http/raw-body.js";
import { registerDomainErrorHandler } from "./shared/http/error-handler.js";
import { LOG_REDACT_PATHS, redactedReqSerializer } from "./shared/http/log-redaction.js";
import { registerPlatformPlugins } from "./shared/http/openapi.js";
import { isQueueReady } from "./shared/database/queue.js";
import { registerAuthRoutes } from "./services/auth/routes.js";
import { registerCodeAnalysisRoutes } from "./services/code-analysis/routes.js";
import { registerDeployRoutes } from "./services/deploy/routes.js";
import { registerGitIntegrationRoutes } from "./services/git-integration/routes.js";
import { registerImageBuilderRoutes } from "./services/image-builder/routes.js";
import { registerIntegrationsRoutes } from "./services/integrations/routes.js";
import { registerNotificationsRoutes } from "./services/notifications/routes.js";
import { registerProjectsRoutes } from "./services/projects/routes.js";
import { registerRolesRoutes } from "./services/roles/routes.js";
import { registerCommandsRoutes } from "./services/commands/routes.js";
import { registerProcessesRoutes } from "./services/processes/routes.js";
import { registerNetworkRoutes } from "./services/network/routes.js";
import { registerObserveRoutes } from "./services/observe/routes.js";
import { registerDomainsRoutes } from "./services/domains/routes.js";
import { registerUsersRoutes } from "./services/users/routes.js";

export type { ServiceName } from "./shared/constants/services.js";

type RegisterFn = (app: FastifyInstance) => Promise<void>;

type MigratedServiceName = Exclude<ServiceName, "gateway">;

const serviceRegistry: Record<MigratedServiceName, RegisterFn> = {
  auth: registerAuthRoutes,
  users: registerUsersRoutes,
  projects: registerProjectsRoutes,
  roles: registerRolesRoutes,
  deploy: registerDeployRoutes,
  commands: registerCommandsRoutes,
  processes: registerProcessesRoutes,
  network: registerNetworkRoutes,
  domains: registerDomainsRoutes,
  observe: registerObserveRoutes,
  notifications: registerNotificationsRoutes,
  integrations: registerIntegrationsRoutes,
  "code-analysis": registerCodeAnalysisRoutes,
  "git-integration": registerGitIntegrationRoutes,
  "image-builder": registerImageBuilderRoutes,
};

async function registerCoreRoutesByService(app: FastifyInstance, service: ServiceName) {
  if (service === "gateway") {
    for (const registerFn of Object.values(serviceRegistry)) {
      await registerFn(app);
    }
    return;
  }

  await serviceRegistry[service](app);
}

export async function buildApp(service: ServiceName) {
  const app = Fastify({
    // Disabled under test so request logs don't drown out the suite output.
    // Otherwise: strip credential headers and mask the `?token=` query param
    // the scan WebSocket route uses, so JWTs never reach the request log.
    logger: process.env.NODE_ENV === "test"
      ? false
      : {
        redact: { paths: LOG_REDACT_PATHS, censor: "REDACTED" },
        serializers: { req: redactedReqSerializer },
      },
    // Global connection timeout (30s). Limits how long the server waits for
    // the full HTTP request headers to arrive after a socket is opened.
    connectionTimeout: 30_000,
    // Global request timeout (60s). Limits the total time a request can take
    // from when it's received to when the response must be sent. Individual
    // routes override with handlerTimeout for specific operations.
    requestTimeout: 60_000,
    // Numeric form on purpose: it trusts only the LAST N hops of
    // X-Forwarded-For, so a client cannot spoof its address by prepending
    // entries (which `true` would allow). 1 = Railway's single proxy hop —
    // raise it if another proxy layer is added in front.
    //
    // Without this, request.ip is the proxy's address for every client and
    // the IP-keyed rateLimit() collapses into one global bucket
    // (see shared/http/rate-limit.ts).
    trustProxy: 1,
    // Prefer an inbound correlation id so a trace started by the frontend or a
    // load balancer survives the backend boundary. Fastify's default is a
    // per-process counter ("req-1", "req-2", ...) that restarts on every
    // deploy and collides across the instances the service registry can split
    // into, which makes an id ambiguous in aggregated logs.
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  await app.register(rawBodyPlugin);
  await app.register(authPlugin);
  await app.register(authorizationPlugin);
  await app.register(projectAccessPlugin);
  await registerPlatformPlugins(app, service);
  registerDomainErrorHandler(app);

  // Liveness: is the process up and serving? Deliberately a static literal —
  // existing platform probes depend on this exact payload.
  app.get("/healthz", async () => ({ status: "ok", service }));

  // Readiness: is the process able to do useful work? Distinct from /healthz
  // because run-server.ts tolerates a failed queue start by design and serves
  // traffic anyway, falling back to in-process execution. That state is
  // invisible to /healthz — "deploys aren't starting" while health is green —
  // so report the queue explicitly here.
  //
  // Not wired to a platform probe: a readiness check that fails closed would
  // stop traffic to an instance that is still serving HTTP correctly.
  app.get("/readyz", async (_request, reply) => {
    const queueReady = isQueueReady();
    return reply.code(queueReady ? 200 : 503).send({
      status: queueReady ? "ready" : "degraded",
      service,
      queue: queueReady ? "ready" : "unavailable",
    });
  });

  await registerCoreRoutesByService(app, service);

  return app;
}

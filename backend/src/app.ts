import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { authPlugin } from "./shared/auth.js";
import { authorizationPlugin } from "./shared/permissions/authorization.js";
import { registerDomainErrorHandler } from "./shared/error-handler.js";
import { registerPlatformPlugins } from "./shared/openapi.js";
import { registerAuthRoutes } from "./services/auth/routes.js";
import { registerCodeAnalysisRoutes } from "./services/code-analysis/routes.js";
import { registerDeployRoutes } from "./services/deploy/routes.js";
import { registerGitIntegrationRoutes } from "./services/git-integration/routes.js";
import { registerImageBuilderRoutes } from "./services/image-builder/routes.js";
import { registerIntegrationsRoutes } from "./services/integrations/routes.js";
import { registerMigrationStatusRoute, remainingServices } from "./services/migration-placeholders.js";
import { registerNotificationsRoutes } from "./services/notifications/routes.js";
import { registerProjectsRoutes } from "./services/projects/routes.js";
import { registerRolesRoutes } from "./services/roles/routes.js";
import { registerUsersRoutes } from "./services/users/routes.js";

export type ServiceName =
  | "gateway"
  | "auth"
  | "users"
  | "projects"
  | "roles"
  | "deploy"
  | "notifications"
  | "integrations"
  | "code-analysis"
  | "git-integration"
  | "image-builder"
  | (typeof remainingServices)[number];

type RegisterFn = (app: FastifyInstance) => Promise<void>;

type MigratedServiceName = Exclude<ServiceName, "gateway" | (typeof remainingServices)[number]>;

const serviceRegistry: Record<MigratedServiceName, RegisterFn> = {
  auth: registerAuthRoutes,
  users: registerUsersRoutes,
  projects: registerProjectsRoutes,
  roles: registerRolesRoutes,
  deploy: registerDeployRoutes,
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

  const registerFn = serviceRegistry[service as MigratedServiceName];
  if (registerFn) {
    await registerFn(app);
    return;
  }

  await registerMigrationStatusRoute(app, service);
}

export async function buildApp(service: ServiceName) {
  const app = Fastify({
    logger: true,
  });

  await app.register(authPlugin);
  await app.register(authorizationPlugin);
  await registerPlatformPlugins(app, service);
  registerDomainErrorHandler(app);

  app.get("/healthz", async () => ({ status: "ok", service }));
  await registerCoreRoutesByService(app, service);

  return app;
}

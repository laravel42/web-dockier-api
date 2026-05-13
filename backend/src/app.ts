import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { authPlugin } from "./shared/auth.js";
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

async function registerCoreRoutesByService(app: FastifyInstance, service: ServiceName) {
  if (service === "gateway") {
    await registerAuthRoutes(app);
    await registerUsersRoutes(app);
    await registerProjectsRoutes(app);
    await registerRolesRoutes(app);
    await registerDeployRoutes(app);
    await registerNotificationsRoutes(app);
    await registerIntegrationsRoutes(app);
    await registerCodeAnalysisRoutes(app);
    await registerGitIntegrationRoutes(app);
    await registerImageBuilderRoutes(app);
    return;
  }

  if (service === "auth") {
    await registerAuthRoutes(app);
    return;
  }
  if (service === "users") {
    await registerUsersRoutes(app);
    return;
  }
  if (service === "projects") {
    await registerProjectsRoutes(app);
    return;
  }
  if (service === "roles") {
    await registerRolesRoutes(app);
    return;
  }
  if (service === "deploy") {
    await registerDeployRoutes(app);
    return;
  }
  if (service === "notifications") {
    await registerNotificationsRoutes(app);
    return;
  }
  if (service === "integrations") {
    await registerIntegrationsRoutes(app);
    return;
  }
  if (service === "code-analysis") {
    await registerCodeAnalysisRoutes(app);
    return;
  }
  if (service === "git-integration") {
    await registerGitIntegrationRoutes(app);
    return;
  }
  if (service === "image-builder") {
    await registerImageBuilderRoutes(app);
    return;
  }

  await registerMigrationStatusRoute(app, service);
}

export async function buildApp(service: ServiceName) {
  const app = Fastify({
    logger: true,
  });

  await app.register(authPlugin);
  await registerPlatformPlugins(app, service);

  app.get("/healthz", async () => ({ status: "ok", service }));
  await registerCoreRoutesByService(app, service);

  return app;
}

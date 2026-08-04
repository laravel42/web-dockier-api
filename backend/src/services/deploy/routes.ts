/**
 * Deploy Routes — Composer
 *
 * Registers all deploy sub-route modules.
 * Each module handles a focused domain:
 *   - providers: CRUD for server provider credentials
 *   - ssh-keys: SSH key management
 *   - deployments: deployment CRUD, destroy, webhook
 *   - tofu: IaC preview generation
 */

import type { FastifyInstance } from "fastify";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerSshKeyRoutes } from "./routes/ssh-keys.js";
import { registerDeploymentRoutes } from "./routes/deployments.js";
import { registerTofuRoutes } from "./routes/tofu.js";
import { registerGitPushWebhookRoutes } from "./routes/git-push-webhook.js";

export async function registerDeployRoutes(app: FastifyInstance) {
  await registerProviderRoutes(app);
  await registerSshKeyRoutes(app);
  await registerDeploymentRoutes(app);
  await registerTofuRoutes(app);
  await registerGitPushWebhookRoutes(app);
}

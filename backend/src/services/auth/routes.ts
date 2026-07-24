/**
 * Auth Routes — Composer
 *
 * Registers all auth sub-route modules.
 * Each module handles a focused domain:
 *   - authentication: login, OTP, passwordless, session (me, memberships)
 *   - tenant: create, switch, membership management, ownership transfer
 *   - two-factor: TOTP setup and enablement
 *   - billing: organization billing details
 */

import type { FastifyInstance } from "fastify";
import { registerAuthenticationRoutes } from "./routes/authentication.js";
import { registerTenantRoutes } from "./routes/tenant.js";
import { registerTwoFactorRoutes } from "./routes/two-factor.js";
import { registerBillingRoutes } from "./routes/billing.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  await registerAuthenticationRoutes(app);
  await registerTenantRoutes(app);
  await registerTwoFactorRoutes(app);
  await registerBillingRoutes(app);
}

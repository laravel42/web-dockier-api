/**
 * Two-Factor Authentication Routes
 *
 * Handles TOTP setup and enablement.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth.js";
import { rateLimit } from "../../../shared/rate-limit.js";
import { setupTwoFactor, enableTwoFactor } from "../domain/two-factor.js";

export async function registerTwoFactorRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const auth2faLimit = rateLimit({ max: 10, windowMs: 60_000, prefix: "auth-2fa" });

  typed.post(
    "/auth/2fa/setup",
    {
      preHandler: [app.requireAuth, auth2faLimit],
      schema: {
        tags: ["auth"],
        summary: "Generate a TOTP secret and QR code for 2FA setup",
        response: {
          200: z.object({
            secret: z.string(),
            qrCodeUrl: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await setupTwoFactor(auth.userId, auth.email);
    },
  );

  typed.post(
    "/auth/2fa/enable",
    {
      preHandler: [app.requireAuth, auth2faLimit],
      schema: {
        tags: ["auth"],
        summary: "Verify a TOTP code and enable 2FA",
        body: z.object({
          token: z.string().trim().min(6).max(8),
        }),
        response: { 200: z.object({ success: z.literal(true) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await enableTwoFactor(auth.userId, request.body.token);
    },
  );
}

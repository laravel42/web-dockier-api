/**
 * Two-Factor Authentication Routes
 *
 * Handles TOTP setup and enablement.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { rateLimit } from "../../../shared/http/rate-limit.js";
import { setupTwoFactor, enableTwoFactor } from "../domain/two-factor.js";
import { completeTwoFactorLogin } from "../domain/registration.js";
import { authSessionSchema, membershipSchema } from "../schemas.js";

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
        response: { 200: z.object({ success: z.literal(true), recoveryCodes: z.array(z.string()) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await enableTwoFactor(auth.userId, request.body.token);
    },
  );
  typed.post(
    "/auth/2fa/verify",
    {
      // Unauthenticated by design: the challenge token is the proof of the email step.
      preHandler: auth2faLimit,
      schema: {
        tags: ["auth"],
        summary: "Second sign-in step: verify a TOTP or recovery code and issue the session",
        body: z.object({
          challengeToken: z.string().min(1).max(2000),
          code: z.string().trim().min(6).max(20),
        }),
        response: { 200: z.object({ session: authSessionSchema, memberships: z.array(membershipSchema) }) },
      },
    },
    async (request) => completeTwoFactorLogin(request.body.challengeToken, request.body.code),
  );
}

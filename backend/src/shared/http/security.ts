/**
 * Security utilities for input sanitization and webhook verification.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config.js";
import { logger } from "../logger.js";

/**
 * Environments where an unconfigured secret may fall back to allowing the
 * request, so local development and the test suite work without one.
 *
 * Deliberately an explicit allowlist rather than `NODE_ENV !== "production"`.
 * That earlier check meant every other value — "staging", "preview", or an
 * unset NODE_ENV, which `config.ts` defaults to "development" — silently
 * accepted unauthenticated requests on internal and webhook endpoints. Those
 * are exactly the internet-reachable environments where nobody notices.
 */
const SECRET_OPTIONAL_ENVS = new Set(["development", "test"]);

/**
 * Decide whether to allow a request whose verifying secret is not configured.
 *
 * Returns true only in an explicitly permitted environment, and warns every
 * time so the bypass is visible in logs rather than silent.
 */
function allowUnverifiedRequest(request: FastifyRequest, guard: string, secretName: string): boolean {
  if (!SECRET_OPTIONAL_ENVS.has(env.NODE_ENV)) return false;
  logger.warn(
    { guard, nodeEnv: env.NODE_ENV, method: request.method, url: request.url },
    `[security] ${secretName} is not configured — allowing an unverified request because NODE_ENV=${env.NODE_ENV}. ` +
    "This must never happen in a deployed environment.",
  );
  return true;
}

// ─── Search Input Sanitization ─────────────────────────────────────

/**
 * Escape special characters in a PostgREST filter value.
 *
 * PostgREST uses `%` and `_` as wildcards in LIKE/ILIKE filters,
 * and `.`, `(`, `)`, `,` have structural meaning in filter expressions.
 * This function escapes them so user input is treated as literal text.
 */
export function escapePostgrestLike(input: string): string {
  return input
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Escape characters that have structural meaning in PostgREST filter strings.
 * Use this when interpolating user input into `.or()` or `.filter()` expressions.
 */
export function escapePostgrestFilter(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\./g, "\\.")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// ─── Webhook Secret Verification ───────────────────────────────────

/**
 * Compute HMAC-SHA256 signature for a payload.
 */
export function computeWebhookSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify a webhook request's signature using timing-safe comparison.
 *
 * Expects the signature in the `x-webhook-signature` header as a hex string.
 * The signature is computed over the raw JSON body.
 */
export function verifyWebhookSignature(signature: string, payload: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const expected = computeWebhookSignature(payload, secret);

  // Timing-safe comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (sigBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Fastify preHandler that verifies webhook signatures.
 *
 * In development (WEBHOOK_SECRET not set), the check is skipped to avoid
 * breaking local dev workflows. In production, WEBHOOK_SECRET must be set
 * and requests without a valid signature are rejected with 401.
 */
export async function requireWebhookSignature(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const secret = env.WEBHOOK_SECRET;

  if (!secret) {
    if (!allowUnverifiedRequest(request, "requireWebhookSignature", "WEBHOOK_SECRET")) {
      return reply.unauthorized("Webhook secret not configured");
    }
    return;
  }

  const signature = request.headers["x-webhook-signature"] as string | undefined;
  if (!signature) {
    return reply.unauthorized("Missing x-webhook-signature header");
  }

  // Use the raw body bytes captured by rawBodyPlugin for accurate HMAC verification.
  // Falls back to JSON.stringify for backward compatibility (e.g., in tests where
  // the plugin may not be registered), but the raw bytes are the correct source.
  const rawBody = request.rawBody ?? JSON.stringify(request.body);
  if (!verifyWebhookSignature(signature, rawBody, secret)) {
    return reply.unauthorized("Invalid webhook signature");
  }
}

/**
 * Fastify preHandler that verifies internal service-to-service calls.
 *
 * Uses a dedicated INTERNAL_SERVICE_TOKEN for service-to-service auth,
 * separate from WEBHOOK_SECRET (which is for external webhook validation).
 * Falls back to WEBHOOK_SECRET for backward compatibility if the dedicated
 * token is not yet configured.
 *
 * Passed via the `x-internal-token` header. This protects endpoints that
 * expose sensitive data (credentials, tokens) for internal consumption only.
 *
 * In development (neither token set), allows unauthenticated access.
 * In production, at least one must be set.
 */
export async function requireInternalToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const secret = env.INTERNAL_SERVICE_TOKEN || env.WEBHOOK_SECRET;

  if (!secret) {
    if (!allowUnverifiedRequest(request, "requireInternalToken", "INTERNAL_SERVICE_TOKEN")) {
      return reply.unauthorized("Internal token not configured");
    }
    return;
  }

  const token = request.headers["x-internal-token"] as string | undefined;
  if (!token) {
    return reply.unauthorized("Missing x-internal-token header");
  }

  // Timing-safe comparison
  const tokenBuffer = Buffer.from(token);
  const secretBuffer = Buffer.from(secret);

  if (tokenBuffer.length !== secretBuffer.length || !timingSafeEqual(tokenBuffer, secretBuffer)) {
    return reply.unauthorized("Invalid internal token");
  }
}

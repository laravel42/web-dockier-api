/**
 * Security utilities for input sanitization and webhook verification.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "./config.js";

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
    if (env.NODE_ENV === "production") {
      return reply.unauthorized("Webhook secret not configured");
    }
    // Development: allow unsigned requests
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
    if (env.NODE_ENV === "production") {
      return reply.unauthorized("Internal token not configured");
    }
    // Development: allow unauthenticated access
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

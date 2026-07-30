/**
 * Raw Body Capture Plugin
 *
 * Preserves the raw request body bytes for requests that carry a webhook
 * signature header (`x-webhook-signature`). This is necessary for HMAC
 * verification because JSON.stringify(request.body) may not reproduce the
 * exact bytes the sender signed (different key order, spacing, Unicode
 * escaping, etc.).
 *
 * Only requests with the signature header pay the memory cost of storing
 * the raw buffer — all other requests are unaffected.
 */

import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Raw request body bytes, available only on webhook-signed requests. */
    rawBody?: string;
  }
}

export const rawBodyPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("preParsing", async (request: FastifyRequest, _reply, payload) => {
    // Only buffer the raw body when a webhook signature is present.
    // This keeps memory usage flat for the 99% of requests that don't need it.
    if (!request.headers["x-webhook-signature"]) {
      return payload;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks);
    request.rawBody = raw.toString("utf-8");

    // Return a new readable stream so Fastify's JSON parser still works.
    // We use the Readable.from() factory to wrap the already-consumed bytes.
    const { Readable } = await import("node:stream");
    return Readable.from(raw);
  });
});

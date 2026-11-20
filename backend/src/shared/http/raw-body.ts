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

    // preParsing runs before Fastify's bodyLimit check, and this header is client-supplied on
    // any route: without a cap here an unauthenticated caller buffers an unbounded body.
    const limit = request.server.initialConfig.bodyLimit ?? 1_048_576;
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of payload) {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      received += buf.length;
      if (received > limit) {
        throw Object.assign(new Error("Request body is too large"), { statusCode: 413 });
      }
      chunks.push(buf);
    }
    const raw = Buffer.concat(chunks);
    request.rawBody = raw.toString("utf-8");

    // Return a new readable stream so Fastify's JSON parser still works.
    // We use the Readable.from() factory to wrap the already-consumed bytes.
    const { Readable } = await import("node:stream");
    return Readable.from(raw);
  });
});

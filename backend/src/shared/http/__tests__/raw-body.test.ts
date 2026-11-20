import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { rawBodyPlugin } from "../raw-body.js";

let app: FastifyInstance;

async function build(bodyLimit: number) {
  app = Fastify({ bodyLimit });
  await app.register(rawBodyPlugin);
  app.post("/x", async (request) => ({ raw: request.rawBody ?? null }));
  return app;
}

afterEach(async () => {
  await app.close();
});

describe("rawBodyPlugin", () => {
  it("keeps the raw bytes of a signed request within the body limit", async () => {
    await build(1024);
    const res = await app.inject({
      method: "POST",
      url: "/x",
      headers: { "content-type": "application/json", "x-webhook-signature": "abc" },
      payload: '{"a": 1}',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ raw: '{"a": 1}' });
  });

  it("rejects a signed request over the body limit with 413 while buffering it", async () => {
    await build(1024);
    const res = await app.inject({
      method: "POST",
      url: "/x",
      headers: { "content-type": "application/json", "x-webhook-signature": "abc" },
      payload: JSON.stringify({ blob: "x".repeat(4096) }),
    });
    expect(res.statusCode).toBe(413);
    // Fastify's own limit check carries FST_ERR_CTP_BODY_TOO_LARGE; ours fires earlier, in preParsing.
    expect(res.json().code).toBeUndefined();
  });

  it("does not buffer requests without the signature header", async () => {
    await build(1024);
    const res = await app.inject({
      method: "POST",
      url: "/x",
      headers: { "content-type": "application/json" },
      payload: '{"a": 1}',
    });
    expect(res.json()).toEqual({ raw: null });
  });
});

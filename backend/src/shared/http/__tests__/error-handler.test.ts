/**
 * Domain Error → HTTP Mapper — Unit Tests
 *
 * `registerDomainErrorHandler` is the only export, so these tests build a bare
 * Fastify instance with @fastify/sensible (the same plugin `app.ts` composes via
 * `registerPlatformPlugins`), register one throwing route per error code, and
 * assert the HTTP response through `inject()`.
 *
 * These tests pin EXISTING behaviour.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import sensible from "@fastify/sensible";
import { registerDomainErrorHandler } from "../error-handler.js";
import { DomainError, type BaseDomainErrorCode } from "../../supabase/errors.js";

const MAPPED_CODES: Array<[BaseDomainErrorCode, number]> = [
  ["not_found", 404],
  ["forbidden", 403],
  ["bad_request", 400],
  ["conflict", 409],
  ["unauthorized", 401],
  ["precondition_failed", 412],
  ["too_many_requests", 429],
  ["service_unavailable", 503],
  ["internal", 500],
];

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(sensible);
  registerDomainErrorHandler(app);

  for (const [code] of MAPPED_CODES) {
    app.get(`/domain/${code}`, async () => {
      throw new DomainError(`${code} happened`, code, new Error("root cause"), { table: "widgets" });
    });
  }

  // A Fastify-style error carrying a statusCode but no validation details.
  app.get("/fastify-error", async () => {
    const err = new Error("teapot") as FastifyError;
    err.name = "TeapotError";
    err.statusCode = 418;
    throw err;
  });

  // A 5xx statusCode-bearing error — same passthrough, logged at error level.
  app.get("/fastify-error-5xx", async () => {
    const err = new Error("upstream exploded") as FastifyError;
    err.name = "UpstreamError";
    err.statusCode = 502;
    throw err;
  });

  // A schema validation error — the validation/validationContext branch.
  app.get("/validation-error", async () => {
    const err = new Error("body/name must be a string") as FastifyError;
    err.name = "FastifyError";
    err.statusCode = 400;
    err.validation = [{ keyword: "type", instancePath: "/name", schemaPath: "#/properties/name/type", params: { type: "string" } }];
    err.validationContext = "body";
    throw err;
  });

  // A plain error with no statusCode — the final fallback.
  app.get("/unexpected", async () => {
    throw new Error("something nobody planned for");
  });

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("registerDomainErrorHandler — mapped DomainError codes", () => {
  it.each(MAPPED_CODES)("maps %s to HTTP %i", async (code, status) => {
    const res = await app.inject({ method: "GET", url: `/domain/${code}` });
    expect(res.statusCode).toBe(status);
  });

  it.each(MAPPED_CODES.filter(([code]) => code !== "internal"))(
    "passes the domain message through for %s",
    async (code) => {
      const res = await app.inject({ method: "GET", url: `/domain/${code}` });
      expect(res.json()).toMatchObject({ message: `${code} happened` });
    },
  );

  it("replaces the internal message with a generic one", async () => {
    const res = await app.inject({ method: "GET", url: "/domain/internal" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An internal server error occurred",
    });
  });

  it("does not leak the cause or metadata into the response body", async () => {
    const res = await app.inject({ method: "GET", url: "/domain/not_found" });
    const body = res.json();
    expect(body).not.toHaveProperty("cause");
    expect(body).not.toHaveProperty("metadata");
  });
});

describe("registerDomainErrorHandler — statusCode passthrough", () => {
  it("preserves the status code and error name of a 4xx Fastify error", async () => {
    const res = await app.inject({ method: "GET", url: "/fastify-error" });
    expect(res.statusCode).toBe(418);
    expect(res.json()).toEqual({
      statusCode: 418,
      error: "TeapotError",
      message: "teapot",
    });
  });

  it("preserves the status code and error name of a 5xx Fastify error", async () => {
    const res = await app.inject({ method: "GET", url: "/fastify-error-5xx" });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      statusCode: 502,
      error: "UpstreamError",
      message: "upstream exploded",
    });
  });

  it("includes validation details and a hard-coded 'Bad Request' label for validation errors", async () => {
    const res = await app.inject({ method: "GET", url: "/validation-error" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      error: "Bad Request",
      message: "body/name must be a string",
      validation: [
        { keyword: "type", instancePath: "/name", schemaPath: "#/properties/name/type", params: { type: "string" } },
      ],
      validationContext: "body",
    });
  });
});

describe("registerDomainErrorHandler — fallback", () => {
  it("returns a generic 500 for an error with no statusCode", async () => {
    const res = await app.inject({ method: "GET", url: "/unexpected" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  });

  it("never echoes the original message of an unexpected error", async () => {
    const res = await app.inject({ method: "GET", url: "/unexpected" });
    expect(res.payload).not.toContain("something nobody planned for");
  });
});

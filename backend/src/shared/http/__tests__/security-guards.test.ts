import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../__tests__/test-helpers.js";

/**
 * The fail-open behaviour of the secret-verifying pre-handlers.
 *
 * These guards previously allowed unverified requests whenever the secret was
 * unset and `NODE_ENV !== "production"`. Since `config.ts` defaults NODE_ENV to
 * "development", a deployed environment that simply never set the variable —
 * or set it to "staging" / "preview" — accepted unauthenticated requests on
 * internal and webhook endpoints. The two endpoints behind
 * `requireInternalToken` at the time returned a tenant's plaintext git token and
 * raw AWS credentials.
 */

const mockEnv = createTestEnv() as Record<string, unknown>;
vi.mock("../../config.js", () => ({ env: mockEnv }));

const mockWarn = vi.fn();
vi.mock("../../logger.js", () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { requireWebhookSignature, computeWebhookSignature } = await import("../security.js");

/** Minimal Fastify request/reply doubles that record whether 401 was sent. */
function doubles(headers: Record<string, string> = {}, body: unknown = {}) {
  const sent: string[] = [];
  const request = {
    headers,
    method: "POST",
    url: "/internal/thing",
    body,
    rawBody: typeof body === "string" ? body : JSON.stringify(body),
  } as never;
  const reply = {
    unauthorized: (msg: string) => { sent.push(msg); },
  } as never;
  return { request, reply, sent };
}

describe("requireWebhookSignature", () => {
  beforeEach(() => {
    mockWarn.mockReset();
    mockEnv.NODE_ENV = "development";
    mockEnv.WEBHOOK_SECRET = undefined;
  });

  it.each(["production", "staging", "preview", ""])("rejects unsigned requests in %j", async (nodeEnv) => {
    mockEnv.NODE_ENV = nodeEnv;
    const { request, reply, sent } = doubles();
    await requireWebhookSignature(request, reply);
    expect(sent).toEqual(["Webhook secret not configured"]);
  });

  it("allows unsigned requests in development, with a warning", async () => {
    const { request, reply, sent } = doubles();
    await requireWebhookSignature(request, reply);
    expect(sent).toEqual([]);
    expect(mockWarn).toHaveBeenCalledOnce();
  });

  describe("secret configured", () => {
    const secret = "webhook-signing-secret";
    beforeEach(() => { mockEnv.WEBHOOK_SECRET = secret; });

    it("rejects a missing signature header", async () => {
      const { request, reply, sent } = doubles({}, { hello: "world" });
      await requireWebhookSignature(request, reply);
      expect(sent).toEqual(["Missing x-webhook-signature header"]);
    });

    it("rejects a bad signature", async () => {
      const { request, reply, sent } = doubles({ "x-webhook-signature": "deadbeef" }, { hello: "world" });
      await requireWebhookSignature(request, reply);
      expect(sent).toEqual(["Invalid webhook signature"]);
    });

    it("accepts a signature computed over the raw body", async () => {
      const body = JSON.stringify({ hello: "world" });
      const signature = computeWebhookSignature(body, secret);
      const { request, reply, sent } = doubles({ "x-webhook-signature": signature }, body);
      await requireWebhookSignature(request, reply);
      expect(sent).toEqual([]);
    });

    it("does not fall open in development once a secret exists", async () => {
      const { request, reply, sent } = doubles({ "x-webhook-signature": "deadbeef" }, { a: 1 });
      await requireWebhookSignature(request, reply);
      expect(sent).toEqual(["Invalid webhook signature"]);
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });
});

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

const { requireInternalToken, requireWebhookSignature, computeWebhookSignature } = await import("../security.js");

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

describe("requireInternalToken", () => {
  beforeEach(() => {
    mockWarn.mockReset();
    mockEnv.NODE_ENV = "development";
    mockEnv.INTERNAL_SERVICE_TOKEN = undefined;
    mockEnv.WEBHOOK_SECRET = undefined;
  });

  describe("no secret configured", () => {
    it("rejects in production", async () => {
      mockEnv.NODE_ENV = "production";
      const { request, reply, sent } = doubles();
      await requireInternalToken(request, reply);
      expect(sent).toEqual(["Internal token not configured"]);
    });

    it.each(["staging", "preview", "prod", "Production", ""])(
      "rejects in %j — only development and test may fall open",
      async (nodeEnv) => {
        mockEnv.NODE_ENV = nodeEnv;
        const { request, reply, sent } = doubles();
        await requireInternalToken(request, reply);
        expect(sent).toEqual(["Internal token not configured"]);
      },
    );

    it.each(["development", "test"])("allows in %s so local work is not blocked", async (nodeEnv) => {
      mockEnv.NODE_ENV = nodeEnv;
      const { request, reply, sent } = doubles();
      await requireInternalToken(request, reply);
      expect(sent).toEqual([]);
    });

    it("warns loudly when it does fall open, so the bypass is never silent", async () => {
      const { request, reply } = doubles();
      await requireInternalToken(request, reply);
      expect(mockWarn).toHaveBeenCalledOnce();
      const [meta, message] = mockWarn.mock.calls[0];
      expect(meta).toMatchObject({ guard: "requireInternalToken", nodeEnv: "development" });
      expect(message).toMatch(/INTERNAL_SERVICE_TOKEN is not configured/);
    });
  });

  describe("secret configured", () => {
    beforeEach(() => { mockEnv.INTERNAL_SERVICE_TOKEN = "an-internal-token-value"; });

    it("rejects a missing header", async () => {
      const { request, reply, sent } = doubles();
      await requireInternalToken(request, reply);
      expect(sent).toEqual(["Missing x-internal-token header"]);
    });

    it("rejects a wrong token of the same length", async () => {
      const { request, reply, sent } = doubles({ "x-internal-token": "an-internal-token-valuX" });
      await requireInternalToken(request, reply);
      expect(sent).toEqual(["Invalid internal token"]);
    });

    it("rejects a wrong token of a different length without throwing", async () => {
      // timingSafeEqual throws on length mismatch, so the length guard must come first.
      const { request, reply, sent } = doubles({ "x-internal-token": "short" });
      await requireInternalToken(request, reply);
      expect(sent).toEqual(["Invalid internal token"]);
    });

    it("accepts the correct token", async () => {
      const { request, reply, sent } = doubles({ "x-internal-token": "an-internal-token-value" });
      await requireInternalToken(request, reply);
      expect(sent).toEqual([]);
    });

    it("falls back to WEBHOOK_SECRET when no dedicated token is set", async () => {
      mockEnv.INTERNAL_SERVICE_TOKEN = undefined;
      mockEnv.WEBHOOK_SECRET = "the-webhook-secret";
      const { request, reply, sent } = doubles({ "x-internal-token": "the-webhook-secret" });
      await requireInternalToken(request, reply);
      expect(sent).toEqual([]);
    });
  });
});

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

/**
 * Deploy Hook Route Tests
 *
 * Covers POST /projects/:projectId/deploy/hook — the self-authenticating
 * deploy hook whose only credential is its `token` query param.
 *
 * The response shape is deliberately unchanged by the hardening work: a bad
 * token still answers HTTP 200 with { success: false, ... }, never 401.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";
import { clearRateLimitStore } from "../../../shared/http/rate-limit.js";
import { generateDeployHookToken, legacyDeployHookToken } from "../domain/deploy-hook.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv({ WEBHOOK_SECRET: "test-webhook-secret-for-testing" }),
}));

const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() },
  },
}));

const mockHandleGitPushEvent = vi.fn();
vi.mock("../domain/push-to-deploy.js", () => ({
  handleGitPushEvent: (...args: unknown[]) => mockHandleGitPushEvent(...args),
}));

vi.mock("../domain/worker.js", () => ({
  enqueueDeployment: vi.fn(),
  registerDeployWorker: vi.fn(),
}));

// ─── Fixtures ──────────────────────────────────────────────────────

const PROJECT_ID = "c9d0e1f2-9012-4234-abcd-999999999999";
const STORED_TOKEN = generateDeployHookToken();

/** Point `supabaseAdmin.from("projects")` at a single project row. */
function stubProject(settings: Record<string, unknown> | null) {
  mockFrom.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: PROJECT_ID,
        organization_id: "a1b2c3d4-1234-4abc-8def-111111111111",
        repository: "acme/my-app",
        branch: "main",
        connection_id: "b8c9d0e1-8901-4123-abcd-888888888888",
        settings,
      },
      error: null,
    }),
  }));
}

function hookUrl(token: string): string {
  return `/projects/${PROJECT_ID}/deploy/hook?token=${encodeURIComponent(token)}`;
}

// ─── App Setup ─────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("deploy");
});

beforeEach(() => {
  vi.clearAllMocks();
  // Each case gets a fresh window so earlier requests don't trip the limiter.
  clearRateLimitStore();
  mockHandleGitPushEvent.mockResolvedValue({ triggered: 1 });
});

describe("POST /projects/:projectId/deploy/hook", () => {
  it("accepts the legacy project-id prefix token", async () => {
    stubProject({ pushToDeploy: true, deployHookToken: STORED_TOKEN });

    const res = await app.inject({ method: "POST", url: hookUrl(legacyDeployHookToken(PROJECT_ID)) });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, message: "Deploy triggered" });
    expect(mockHandleGitPushEvent).toHaveBeenCalledWith({ repository: "acme/my-app", branch: "main" });
  });

  it("accepts a newly issued random token", async () => {
    stubProject({ pushToDeploy: true, deployHookToken: STORED_TOKEN });

    const res = await app.inject({ method: "POST", url: hookUrl(STORED_TOKEN) });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, message: "Deploy triggered" });
  });

  it("answers 200 with success:false for a wrong token — never 401", async () => {
    stubProject({ pushToDeploy: true, deployHookToken: STORED_TOKEN });

    const res = await app.inject({ method: "POST", url: hookUrl("not-the-token") });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: false, message: "Invalid deploy token" });
    expect(mockHandleGitPushEvent).not.toHaveBeenCalled();
  });

  it("keeps the push-to-deploy-disabled message unchanged", async () => {
    stubProject({ deployHookToken: STORED_TOKEN });

    const res = await app.inject({ method: "POST", url: hookUrl(STORED_TOKEN) });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: false,
      message: "Push to deploy is not enabled for this project",
    });
  });

  it("rate limits the 6th request in a window with 429", async () => {
    stubProject({ pushToDeploy: true, deployHookToken: STORED_TOKEN });

    for (let i = 0; i < 5; i++) {
      const allowed = await app.inject({ method: "POST", url: hookUrl(STORED_TOKEN) });
      expect(allowed.statusCode).toBe(200);
    }

    const limited = await app.inject({ method: "POST", url: hookUrl(STORED_TOKEN) });

    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});

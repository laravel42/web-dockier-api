import { describe, it, expect, vi, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";

/**
 * Guards against reintroducing an HTTP endpoint that hands out a secret.
 *
 * Two such endpoints existed, both dead and both cross-tenant:
 *
 *   GET /deploy/providers/:providerId/credentials
 *       → a tenant's raw AWS access key id + secret access key
 *   GET /git/connections/:connectionId/scan-auth
 *       → a connection's plaintext git personal access token
 *
 * Neither filtered on organization_id, so any caller past the pre-handler could
 * enumerate ids and read another tenant's credentials. Both had zero callers:
 * credentials are resolved in-process via getProviderCredentials and
 * getGitConnectionCredentials, never over HTTP.
 *
 * A 404 here is the assertion. If someone re-adds either route this fails.
 */

vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv({ WEBHOOK_SECRET: "test-webhook-secret-for-testing" }),
}));

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() },
  },
}));

let deployApp: FastifyInstance;
let gitApp: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  deployApp = await buildApp("deploy");
  gitApp = await buildApp("git-integration");
});

describe("secret-returning endpoints stay deleted", () => {
  it("GET /deploy/providers/:id/credentials is not routed", async () => {
    const res = await deployApp.inject({
      method: "GET",
      url: "/deploy/providers/a1b2c3d4-1234-4abc-8def-111111111111/credentials",
      headers: { "x-internal-token": "test-webhook-secret-for-testing" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /git/connections/:id/scan-auth is not routed", async () => {
    const res = await gitApp.inject({
      method: "GET",
      url: "/git/connections/a1b2c3d4-1234-4abc-8def-111111111111/scan-auth",
      headers: { "x-internal-token": "test-webhook-secret-for-testing" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("no registered route path mentions credentials or scan-auth", async () => {
    // Belt and braces: catches a re-add under a different method or prefix.
    for (const app of [deployApp, gitApp]) {
      const routes = app.printRoutes({ commonPrefix: false });
      expect(routes).not.toMatch(/scan-auth/);
      expect(routes).not.toMatch(/providers\/:providerId\/credentials/);
    }
  });
});

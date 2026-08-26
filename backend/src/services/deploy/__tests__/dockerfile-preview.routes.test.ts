/**
 * Route tests for POST /deploy/dockerfile/preview.
 *
 * Verifies the DEPLOY_CREATE guard and that a valid request returns the
 * response schema. The domain function is mocked to isolate route behavior.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_TENANT_ID,
  authHeader,
  createTestEnv,
  setupPermissionMocks,
} from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const mockPreviewDockerfile = vi.fn();
vi.mock("../domain/dockerfile-preview.js", () => ({
  previewDockerfile: (...args: unknown[]) => mockPreviewDockerfile(...args),
}));

const CONN = "b8c9d0e1-8901-4123-abcd-888888888888";
const VALID_BODY = { gitConnectionId: CONN, repo: "acme/app", branch: "main" };

const MOCK_RESULT = {
  aiEnabled: true,
  source: "generated" as const,
  mechanicalDockerfile: "FROM node:20-slim\nEXPOSE 3000",
  finalDockerfile: "FROM node:20-slim\nUSER node\nEXPOSE 3000",
  revised: true,
  changes: [{ what: "Added non-root USER", why: "Security" }],
  runtime: "node",
  framework: "nextjs",
};

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("deploy");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

describe("POST /deploy/dockerfile/preview", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({ method: "POST", url: "/deploy/dockerfile/preview", payload: VALID_BODY });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 without DEPLOY_CREATE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.DEPLOY_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: "/deploy/dockerfile/preview",
      headers: { authorization: authHeader() },
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(403);
    expect(mockPreviewDockerfile).not.toHaveBeenCalled();
  });

  it("returns the preview with DEPLOY_CREATE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.DEPLOY_CREATE] });
    mockPreviewDockerfile.mockResolvedValue(MOCK_RESULT);

    const res = await app.inject({
      method: "POST",
      url: "/deploy/dockerfile/preview",
      headers: { authorization: authHeader() },
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe("generated");
    expect(body.revised).toBe(true);
    expect(body.changes[0].what).toBe("Added non-root USER");
    expect(mockPreviewDockerfile).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TEST_TENANT_ID, gitConnectionId: CONN, repo: "acme/app", branch: "main" }),
    );
  });

  it("returns 400 for a missing repo field", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.DEPLOY_CREATE] });

    const res = await app.inject({
      method: "POST",
      url: "/deploy/dockerfile/preview",
      headers: { authorization: authHeader() },
      payload: { gitConnectionId: CONN, branch: "main" },
    });

    expect(res.statusCode).toBe(400);
  });
});

/**
 * Route tests for POST /projects/:projectId/infrastructure/teardown.
 *
 * Verifies permission gating (deploy:manage) and that the endpoint relays the
 * domain teardown result (torn_down / partial / nothing_to_tear_down).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_TENANT_ID,
  authHeader,
  createTestEnv,
  setupPermissionMocks as setupPerms,
} from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { admin: {} },
  },
}));

const mockTeardown = vi.fn();
vi.mock("../../deploy/domain/lifecycle/project-teardown.js", () => ({
  teardownProjectInfrastructure: (...args: unknown[]) => mockTeardown(...args),
  markProjectInfraLive: vi.fn(),
}));

const PROJECT_ID = "c3d4e5f6-3456-4cde-abcd-333333333333";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("projects");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

const OTHER_TENANT_PROJECT = "d0e1f2a3-0123-4345-bcde-000000000000";
/** Permission mocks plus a `projects` lookup that only finds PROJECT_ID within the caller's tenant. */
function setupWithProjects(permissions: string[]) {
  setupPerms(mockFrom, { permissions });
  const permissionChain = mockFrom.getMockImplementation()!;
  mockFrom.mockImplementation((table: string) => {
    if (table !== "projects") return permissionChain(table);
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, value: unknown) => { filters[col] = value; return chain; },
      maybeSingle: async () => ({
        data: filters.id === PROJECT_ID && filters.organization_id === TEST_TENANT_ID ? { id: PROJECT_ID, name: "p" } : null,
        error: null,
      }),
    };
    return chain;
  });
}
describe("POST /projects/:projectId/infrastructure/teardown", () => {
  it("answers 404 for another tenant's project without tearing anything down", async () => {
    setupWithProjects(Object.values(PERMISSIONS));
    const res = await app.inject({
      method: "POST",
      url: `/projects/${OTHER_TENANT_PROJECT}/infrastructure/teardown`,
      headers: { authorization: authHeader() },
    });
    expect(res.statusCode).toBe(404);
    expect(mockTeardown).not.toHaveBeenCalled();
  });
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/infrastructure/teardown`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 without deploy:manage permission", async () => {
    setupPerms(mockFrom, { permissions: [PERMISSIONS.DEPLOY_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/infrastructure/teardown`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  it("tears down and returns torn_down with deploy:manage", async () => {
    setupWithProjects(Object.values(PERMISSIONS));
    mockTeardown.mockResolvedValue({
      status: "torn_down",
      message: "Tore down 1 stack(s).",
      perStack: [{ stackName: "image-builder-app-my-app", success: true, message: "ok", errors: [] }],
    });

    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/infrastructure/teardown`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("torn_down");
    expect(mockTeardown).toHaveBeenCalledWith(PROJECT_ID, TEST_TENANT_ID);
  });

  it("relays nothing_to_tear_down", async () => {
    setupWithProjects(Object.values(PERMISSIONS));
    mockTeardown.mockResolvedValue({ status: "nothing_to_tear_down", message: "No provisioned infrastructure found for this project.", perStack: [] });

    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/infrastructure/teardown`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("nothing_to_tear_down");
  });

  it("relays partial failure", async () => {
    setupWithProjects(Object.values(PERMISSIONS));
    mockTeardown.mockResolvedValue({
      status: "partial",
      message: "Some resources could not be removed: image-builder-app-my-app.",
      perStack: [{ stackName: "image-builder-app-my-app", success: false, message: "err", errors: ["x"] }],
    });

    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/infrastructure/teardown`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("partial");
    expect(res.json().perStack[0].success).toBe(false);
  });

  it("rejects a non-UUID projectId", async () => {
    setupWithProjects(Object.values(PERMISSIONS));
    const res = await app.inject({
      method: "POST",
      url: `/projects/not-a-uuid/infrastructure/teardown`,
      headers: { authorization: authHeader() },
    });
    expect(res.statusCode).toBe(400);
  });
});

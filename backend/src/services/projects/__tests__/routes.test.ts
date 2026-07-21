/**
 * Projects Routes Integration Tests
 *
 * Tests the project route handlers via Fastify's inject() method.
 * Mocks domain modules to isolate route-level behavior.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_ROLE_ID,
  authHeader,
  createTestEnv,
  setupPermissionMocks,
} from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv(),
}));

const mockFrom = vi.fn();

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockCreateProject = vi.fn();
const mockGetProject = vi.fn();
const mockListProjects = vi.fn();
const mockUpdateProject = vi.fn();
const mockDeleteProject = vi.fn();

vi.mock("../domain/projects.js", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  getProject: (...args: unknown[]) => mockGetProject(...args),
  listProjects: (...args: unknown[]) => mockListProjects(...args),
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
  deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
}));

// Mock sub-route modules to prevent import errors
vi.mock("../routes/tags.js", () => ({
  registerTagRoutes: vi.fn(),
}));

vi.mock("../routes/env.js", () => ({
  registerEnvRoutes: vi.fn(),
}));

vi.mock("../domain/overview-ai.js", () => ({
  createOverviewAiStream: vi.fn(),
}));

// ─── App Setup ─────────────────────────────────────────────────────

let app: FastifyInstance;

const TEST_PROJECT_ID = "a1b2c3d4-1234-4abc-8def-aaaaaaaaaaaa";

const MOCK_PROJECT = {
  id: TEST_PROJECT_ID,
  name: "my-app",
  repository: "acme/my-app",
  branch: "main",
  connectionId: "conn-1234",
  platform: "node",
  sourceType: "repository",
  template: "",
  config: {},
  settings: {},
  lastCommitHash: "abc1234",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("projects");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

// ─── Tests ─────────────────────────────────────────────────────────

describe("POST /projects", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/projects",
      payload: { name: "test", repository: "org/repo", branch: "main" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 without PROJECT_CREATE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: authHeader() },
      payload: { name: "test", repository: "org/repo", branch: "main" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for missing required fields", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_CREATE] });

    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: authHeader() },
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("creates project with valid params", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_CREATE] });
    mockCreateProject.mockResolvedValue(MOCK_PROJECT);

    const res = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { authorization: authHeader() },
      payload: { name: "my-app", repository: "acme/my-app", branch: "main" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("my-app");
    expect(mockCreateProject).toHaveBeenCalledOnce();
    expect(mockCreateProject.mock.calls[0][0]).toMatchObject({
      tenantId: TEST_TENANT_ID,
      name: "my-app",
      repository: "acme/my-app",
      branch: "main",
    });
  });
});

describe("GET /projects/:projectId", () => {
  it("returns 400 for non-UUID projectId", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: "/projects/not-a-uuid",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns project by ID", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });
    mockGetProject.mockResolvedValue(MOCK_PROJECT);

    const res = await app.inject({
      method: "GET",
      url: `/projects/${TEST_PROJECT_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(TEST_PROJECT_ID);
    expect(res.json().repository).toBe("acme/my-app");
    expect(mockGetProject).toHaveBeenCalledWith(TEST_PROJECT_ID, TEST_TENANT_ID);
  });
});

describe("GET /projects", () => {
  it("returns paginated project list", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });
    mockListProjects.mockResolvedValue({
      projects: [MOCK_PROJECT],
      total: 1,
    });

    const res = await app.inject({
      method: "GET",
      url: "/projects",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("passes search and pagination params", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });
    mockListProjects.mockResolvedValue({ projects: [], total: 0 });

    const res = await app.inject({
      method: "GET",
      url: "/projects?search=app&limit=10&offset=5",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(mockListProjects).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      expect.objectContaining({ search: "app", limit: 10, offset: 5 }),
    );
  });

  it("returns 400 for limit exceeding max", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });

    const res = await app.inject({
      method: "GET",
      url: "/projects?limit=500",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /projects/:projectId", () => {
  it("returns 403 without PROJECT_MANAGE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_VIEW] });

    const res = await app.inject({
      method: "PUT",
      url: `/projects/${TEST_PROJECT_ID}`,
      headers: { authorization: authHeader() },
      payload: { name: "updated" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("updates project with valid params", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_MANAGE] });
    mockUpdateProject.mockResolvedValue({ ...MOCK_PROJECT, name: "updated-app" });

    const res = await app.inject({
      method: "PUT",
      url: `/projects/${TEST_PROJECT_ID}`,
      headers: { authorization: authHeader() },
      payload: { name: "updated-app", branch: "develop" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("updated-app");
    expect(mockUpdateProject).toHaveBeenCalledOnce();
    expect(mockUpdateProject.mock.calls[0][0]).toMatchObject({
      projectId: TEST_PROJECT_ID,
      tenantId: TEST_TENANT_ID,
      name: "updated-app",
      branch: "develop",
    });
  });
});

describe("DELETE /projects/:projectId", () => {
  it("returns 403 without PROJECT_DELETE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_MANAGE] });

    const res = await app.inject({
      method: "DELETE",
      url: `/projects/${TEST_PROJECT_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("deletes project with PROJECT_DELETE permission", async () => {
    setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.PROJECT_DELETE] });
    mockDeleteProject.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "DELETE",
      url: `/projects/${TEST_PROJECT_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockDeleteProject).toHaveBeenCalledWith(TEST_PROJECT_ID, TEST_TENANT_ID);
  });
});

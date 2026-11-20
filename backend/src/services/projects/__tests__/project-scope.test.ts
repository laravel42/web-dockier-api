/**
 * Project-scoped routes check the project belongs to the caller's tenant before
 * the domain runs, and a project can only point at the tenant's own git
 * connection (push-to-deploy clones with it).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, createTestEnv, setupPermissionMocks, TEST_TENANT_ID } from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));
const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a), auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() } },
}));
const env = vi.hoisted(() => ({ getMaskedEnv: vi.fn(), revealEnv: vi.fn(), saveEnv: vi.fn() }));
vi.mock("../domain/env.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...env }));
const wp = vi.hoisted(() => ({ getMaskedWpConfig: vi.fn(), revealWpConfig: vi.fn(), saveWpConfig: vi.fn() }));
vi.mock("../domain/wp-config.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...wp }));
const tags = vi.hoisted(() => ({ getProjectTags: vi.fn(), setProjectTags: vi.fn() }));
vi.mock("../domain/tags.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...tags }));
vi.mock("../../../shared/service-clients/activity.js", () => ({ safeRecordActivity: vi.fn() }));

const MINE = "c9d0e1f2-9012-4234-abcd-999999999999";
const THEIRS = "d0e1f2a3-0123-4345-bcde-000000000000";

let app: FastifyInstance;
beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("projects");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
  setupPermissionMocks(mockFrom, { permissions: Object.values(PERMISSIONS) });
  const permissionChain = mockFrom.getMockImplementation()!;
  mockFrom.mockImplementation((table: string) => {
    if (table !== "projects") return permissionChain(table);
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, value: unknown) => { filters[col] = value; return chain; },
      maybeSingle: async () => ({
        data: filters.id === MINE && filters.organization_id === TEST_TENANT_ID ? { id: MINE, name: "p" } : null,
        error: null,
      }),
    };
    return chain;
  });
  env.getMaskedEnv.mockResolvedValue({ content: "", exists: false });
  env.saveEnv.mockResolvedValue(undefined);
  wp.getMaskedWpConfig.mockResolvedValue({ content: "", exists: false });
  wp.saveWpConfig.mockResolvedValue(undefined);
  tags.getProjectTags.mockResolvedValue([]);
  tags.setProjectTags.mockResolvedValue([]);
});

const inject = (method: "GET" | "PUT", url: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: authHeader() }, payload });

describe("project-scoped routes", () => {
  it("serve the tenant's own project", async () => {
    expect((await inject("GET", `/projects/${MINE}/env`)).statusCode).toBe(200);
    expect((await inject("PUT", `/projects/${MINE}/env`, { content: "A=1" })).statusCode).toBe(200);
    expect((await inject("GET", `/projects/${MINE}/wp-config`)).statusCode).toBe(200);
    expect((await inject("GET", `/projects/${MINE}/tags`)).statusCode).toBe(200);
  });

  it("answer 404 for another tenant's project without reaching the domain", async () => {
    for (const [method, url, body] of [
      ["GET", `/projects/${THEIRS}/env`],
      ["GET", `/projects/${THEIRS}/env/reveal`],
      ["PUT", `/projects/${THEIRS}/env`, { content: "A=1" }],
      ["GET", `/projects/${THEIRS}/wp-config`],
      ["PUT", `/projects/${THEIRS}/wp-config`, { content: "<?php" }],
      ["GET", `/projects/${THEIRS}/tags`],
      ["PUT", `/projects/${THEIRS}/tags`, { tagIds: [] }],
    ] as const) {
      expect((await inject(method, url, body)).statusCode).toBe(404);
    }
    for (const fn of [...Object.values(env), ...Object.values(wp), ...Object.values(tags)]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("project git connection", () => {
  it("refuses creating a project on another tenant's connection", async () => {
    const { createProject } = await import("../domain/projects.js");
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
      return chain;
    });
    await expect(createProject({ tenantId: TEST_TENANT_ID, name: "x", repository: "a/b", branch: "main", connectionId: "conn-theirs" }))
      .rejects.toMatchObject({ code: "bad_request", message: "Git connection not found" });
  });
});

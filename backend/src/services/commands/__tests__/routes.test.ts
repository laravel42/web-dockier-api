/**
 * Commands run arbitrary shell in a customer's container, so the routes are the
 * boundary: permission, project ownership (by tenant) and input size. The domain
 * and shell escaping are covered in domain/__tests__.
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
const commands = vi.hoisted(() => ({ runCommand: vi.fn(), listCommands: vi.fn(), getCommand: vi.fn(), deleteCommand: vi.fn() }));
vi.mock("../domain/commands.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...commands }));

const PROJECT = "c9d0e1f2-9012-4234-abcd-999999999999";
const OTHER_PROJECT = "d0e1f2a3-0123-4345-bcde-000000000000";
const COMMAND = "aaaaaaaa-1111-4111-8111-111111111111";
const commandRow = { id: COMMAND, projectId: PROJECT, userId: COMMAND, command: "ls", status: "running", output: "", startedAt: "", finishedAt: null, createdAt: "" };

let app: FastifyInstance;
beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("commands");
});

/** Projects resolve only for the caller's tenant, like requireProjectAccess's query. */
function setup(permissions: string[]) {
  setupPermissionMocks(mockFrom, { permissions });
  const permissionChain = mockFrom.getMockImplementation()!;
  mockFrom.mockImplementation((table: string) => {
    if (table !== "projects") return permissionChain(table);
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, value: unknown) => { filters[col] = value; return chain; },
      maybeSingle: async () => ({
        data: filters.id === PROJECT && filters.organization_id === TEST_TENANT_ID ? { id: PROJECT, name: "p" } : null,
        error: null,
      }),
    };
    return chain;
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
  const { clearRateLimitStore } = await import("../../../shared/http/rate-limit.js");
  clearRateLimitStore();
  setup(Object.values(PERMISSIONS));
  commands.runCommand.mockResolvedValue(commandRow);
  commands.listCommands.mockResolvedValue({ commands: [commandRow], total: 1 });
  commands.getCommand.mockResolvedValue(commandRow);
  commands.deleteCommand.mockResolvedValue(undefined);
});

const inject = (method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { authorization: authHeader() }, payload });

describe("POST /projects/:projectId/commands", () => {
  it("runs the command for the caller's tenant and project", async () => {
    const res = await inject("POST", `/projects/${PROJECT}/commands`, { command: "ls -la" });
    expect(res.statusCode).toBe(200);
    expect(commands.runCommand).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TEST_TENANT_ID, projectId: PROJECT, command: "ls -la" }));
  });

  it("refuses a member with only project:view", async () => {
    setup([PERMISSIONS.PROJECT_VIEW]);
    const res = await inject("POST", `/projects/${PROJECT}/commands`, { command: "ls" });
    expect(res.statusCode).toBe(403);
    expect(commands.runCommand).not.toHaveBeenCalled();
  });

  it("refuses a project of another tenant as not found", async () => {
    const res = await inject("POST", `/projects/${OTHER_PROJECT}/commands`, { command: "ls" });
    expect(res.statusCode).toBe(404);
    expect(commands.runCommand).not.toHaveBeenCalled();
  });

  it.each([[""], ["x".repeat(2001)]])("rejects a command of length %#", async (command) => {
    const res = await inject("POST", `/projects/${PROJECT}/commands`, { command });
    expect(res.statusCode).toBe(400);
    expect(commands.runCommand).not.toHaveBeenCalled();
  });

  it("rate-limits a tenant to 10 runs a minute", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await inject("POST", `/projects/${PROJECT}/commands`, { command: "ls" })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe("reading and deleting commands", () => {
  it("lists and gets only within the caller's tenant and project", async () => {
    expect((await inject("GET", `/projects/${PROJECT}/commands`)).statusCode).toBe(200);
    expect(commands.listCommands).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TEST_TENANT_ID, projectId: PROJECT }));
    expect((await inject("GET", `/projects/${PROJECT}/commands/${COMMAND}`)).statusCode).toBe(200);
    expect(commands.getCommand).toHaveBeenCalledWith({ tenantId: TEST_TENANT_ID, projectId: PROJECT, commandId: COMMAND });
  });

  it("hides another tenant's project from list, get and delete", async () => {
    for (const [method, url] of [
      ["GET", `/projects/${OTHER_PROJECT}/commands`],
      ["GET", `/projects/${OTHER_PROJECT}/commands/${COMMAND}`],
      ["DELETE", `/projects/${OTHER_PROJECT}/commands/${COMMAND}`],
    ] as const) {
      expect((await inject(method, url)).statusCode).toBe(404);
    }
    expect(commands.listCommands).not.toHaveBeenCalled();
    expect(commands.getCommand).not.toHaveBeenCalled();
    expect(commands.deleteCommand).not.toHaveBeenCalled();
  });

  it("lets a viewer read but not delete", async () => {
    setup([PERMISSIONS.PROJECT_VIEW]);
    expect((await inject("GET", `/projects/${PROJECT}/commands`)).statusCode).toBe(200);
    expect((await inject("DELETE", `/projects/${PROJECT}/commands/${COMMAND}`)).statusCode).toBe(403);
    expect(commands.deleteCommand).not.toHaveBeenCalled();
  });

  it("refuses a caller without a token", async () => {
    const res = await app.inject({ method: "GET", url: `/projects/${PROJECT}/commands` });
    expect(res.statusCode).toBe(401);
  });
});

/**
 * A scheduled job's heartbeat cannot be deleted from Observe. Deleted there, the
 * job kept pinging a URL that no longer existed, looking monitored while nothing
 * watched it. It is managed from the job, which removes it when monitoring is off.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, createTestEnv, setupPermissionMocks } from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));
const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a), auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() } },
}));

const findJobOwningHeartbeat = vi.hoisted(() => vi.fn());
const listJobsOwningHeartbeats = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/service-clients/processes.js", () => ({ findJobOwningHeartbeat, listJobsOwningHeartbeats }));
const deleteHeartbeat = vi.hoisted(() => vi.fn());
const listHeartbeats = vi.hoisted(() => vi.fn());
vi.mock("../domain/heartbeats.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  deleteHeartbeat,
  listHeartbeats,
}));

const PROJECT = "c9d0e1f2-9012-4234-abcd-999999999999";
const HEARTBEAT = "aaaaaaaa-1111-4111-8111-111111111111";

let app: FastifyInstance;
beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("observe");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
  setupPermissionMocks(mockFrom, { permissions: Object.values(PERMISSIONS) });
  // requireProjectAccess looks the project up; answer it, delegate the rest.
  const permissionChain = mockFrom.getMockImplementation()!;
  mockFrom.mockImplementation((table: string) => {
    if (table !== "projects") return permissionChain(table);
    const chain: Record<string, unknown> = { maybeSingle: async () => ({ data: { id: PROJECT, name: "p" }, error: null }) };
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    return chain;
  });
  deleteHeartbeat.mockResolvedValue(undefined);
});

const remove = () => app.inject({
  method: "DELETE", url: `/projects/${PROJECT}/heartbeats/${HEARTBEAT}`, headers: { authorization: authHeader() },
});

describe("deleting a heartbeat from Observe", () => {
  it("refuses a heartbeat a scheduled job owns, and says which job", async () => {
    findJobOwningHeartbeat.mockResolvedValue({ id: "job-1", name: "Backups" });
    const res = await remove();
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/scheduled job "Backups".*Turn off Monitor with heartbeats/);
    expect(deleteHeartbeat).not.toHaveBeenCalled();
  });

  it("lists each heartbeat with the job that owns it, so the UI can drop its Delete", async () => {
    const hb = (id: string) => ({
      id, projectId: PROJECT, name: id, frequency: "hourly", gracePeriod: "after_5_minutes", status: "healthy",
      lastPingedAt: null, pingUrl: `https://api/heartbeats/${id}/ping`, createdAt: "", updatedAt: "",
    });
    const other = "bbbbbbbb-2222-4222-8222-222222222222";
    listHeartbeats.mockResolvedValue({ heartbeats: [hb(HEARTBEAT), hb(other)] });
    listJobsOwningHeartbeats.mockResolvedValue(new Map([[HEARTBEAT, { id: "job-1", name: "Backups" }]]));
    const res = await app.inject({ method: "GET", url: `/projects/${PROJECT}/heartbeats`, headers: { authorization: authHeader() } });
    expect(res.statusCode).toBe(200);
    expect(res.json().heartbeats.map((h: { scheduledJob: unknown }) => h.scheduledJob)).toEqual([
      { id: "job-1", name: "Backups" },
      null,
    ]);
  });

  it("deletes a heartbeat no job owns", async () => {
    findJobOwningHeartbeat.mockResolvedValue(null);
    const res = await remove();
    expect(res.statusCode).toBe(200);
    expect(deleteHeartbeat).toHaveBeenCalledWith(expect.objectContaining({ heartbeatId: HEARTBEAT }));
  });
});

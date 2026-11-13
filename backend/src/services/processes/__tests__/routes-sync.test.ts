/**
 * Saving a job or deleting a process reaches the server.
 *
 * A created job was stored "installed" and never written to the crontab, and an
 * edit kept cron on the old command, until the next deploy. A deleted process
 * was never stopped. Pinned: create and edit install; "not deployed yet" stays
 * installed for the post-deploy restore; a real install failure shows paused;
 * delete stops first and still deletes when the stop fails.
 *
 * The install runs in the background: the response comes back before it, so a
 * slow server cannot push the request past the browser's timeout and invite a
 * duplicate. Assertions on the install therefore wait for it.
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

const domain = vi.hoisted(() => ({
  createJob: vi.fn(), updateJob: vi.fn(), updateJobStatus: vi.fn(), deleteProcess: vi.fn(),
  installJob: vi.fn(), stopProcess: vi.fn(),
}));
vi.mock("../domain/processes.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createJob: domain.createJob, updateJob: domain.updateJob, updateJobStatus: domain.updateJobStatus,
  deleteProcess: domain.deleteProcess,
}));
vi.mock("../domain/scheduler-executor.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  installJob: domain.installJob,
}));
vi.mock("../domain/executor.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  stopProcess: domain.stopProcess,
}));

const PROJECT = "c9d0e1f2-9012-4234-abcd-999999999999";
const JOB = "a1b2c3d4-1111-4111-8111-111111111111";
const job = (status: string) => ({
  id: JOB, projectId: PROJECT, name: "n", command: "php artisan x", user: "root", frequency: "nightly",
  customCron: null, monitorHeartbeat: false, heartbeatUrl: null, status, lastRunAt: null, createdAt: "", updatedAt: "",
});

let app: FastifyInstance;
beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("processes");
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
});

const createJob = () => app.inject({
  method: "POST", url: `/projects/${PROJECT}/scheduled-jobs`, headers: { authorization: authHeader() },
  payload: { name: "n", command: "php artisan x", frequency: "nightly" },
});

describe("scheduled job sync", () => {
  it("installs a new job right away", async () => {
    domain.createJob.mockResolvedValue(job("installed"));
    domain.installJob.mockResolvedValue({ success: true, message: "ok" });

    const res = await createJob();

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("installed");
    await vi.waitFor(() => expect(domain.installJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB })));
  });

  it("keeps a job installed when the project is not deployed yet", async () => {
    domain.createJob.mockResolvedValue(job("installed"));
    domain.installJob.mockResolvedValue({ success: false, noTarget: true, message: "No active deployment found." });

    const res = await createJob();

    expect(res.json().status).toBe("installed");
    await vi.waitFor(() => expect(domain.installJob).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(domain.updateJobStatus).not.toHaveBeenCalled();
  });

  it("shows a job paused when installing it on a live server failed", async () => {
    domain.createJob.mockResolvedValue(job("installed"));
    domain.installJob.mockResolvedValue({ success: false, message: "crontab: permission denied" });
    domain.updateJobStatus.mockResolvedValue(job("paused"));

    expect((await createJob()).statusCode).toBe(200);
    await vi.waitFor(() =>
      expect(domain.updateJobStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "paused" })),
    );
  });

  it("answers even when reaching the server throws, without failing the saved job", async () => {
    domain.createJob.mockResolvedValue(job("installed"));
    domain.installJob.mockRejectedValue(new Error("deployments lookup failed"));

    const res = await createJob();

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("installed");
    await vi.waitFor(() => expect(domain.installJob).toHaveBeenCalled());
  });

  it("reinstalls an installed job on edit, and leaves a paused one alone", async () => {
    const edit = () => app.inject({
      method: "PATCH", url: `/projects/${PROJECT}/scheduled-jobs/${JOB}`, headers: { authorization: authHeader() },
      payload: { command: "php artisan y" },
    });
    domain.installJob.mockResolvedValue({ success: true, message: "ok" });

    domain.updateJob.mockResolvedValue(job("installed"));
    await edit();
    await vi.waitFor(() => expect(domain.installJob).toHaveBeenCalledTimes(1));

    domain.updateJob.mockResolvedValue(job("paused"));
    await edit();
    await new Promise((r) => setTimeout(r, 10));
    expect(domain.installJob).toHaveBeenCalledTimes(1);
  });

  it("refuses a command that would split the crontab line, and a bad cron or user", async () => {
    const post = (payload: Record<string, unknown>) => app.inject({
      method: "POST", url: `/projects/${PROJECT}/scheduled-jobs`, headers: { authorization: authHeader() }, payload,
    });
    expect((await post({ name: "n", command: "a\n* * * * * b" })).statusCode).toBe(400);
    expect((await post({ name: "n", command: "a", frequency: "custom", customCron: "0 30 2 * * 1" })).statusCode).toBe(400);
    expect((await post({ name: "n", command: "a", user: "root; id" })).statusCode).toBe(400);
    expect(domain.createJob).not.toHaveBeenCalled();
  });
});

describe("process delete", () => {
  const del = () => app.inject({
    method: "DELETE", url: `/projects/${PROJECT}/processes/${JOB}`, headers: { authorization: authHeader() },
  });

  it("stops the process before deleting it", async () => {
    domain.stopProcess.mockResolvedValue({ success: true, message: "stopped" });
    expect((await del()).statusCode).toBe(200);
    expect(domain.stopProcess.mock.invocationCallOrder[0]).toBeLessThan(domain.deleteProcess.mock.invocationCallOrder[0]);
  });

  it("still deletes when stopping fails", async () => {
    domain.stopProcess.mockRejectedValue(new Error("deployment gone"));
    expect((await del()).statusCode).toBe(200);
    expect(domain.deleteProcess).toHaveBeenCalled();
  });
});

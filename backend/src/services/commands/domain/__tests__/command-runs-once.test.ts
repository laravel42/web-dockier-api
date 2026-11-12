/**
 * A user's command runs at most once, and never stays "running" forever.
 *
 * The job used to retry once and expire at 180 s, while a command can take
 * longer (SSH connect + 120 s exec). An expiry or a backend restart re-ran the
 * command — a migration, an rm — possibly alongside the first run. And a worker
 * that died mid-command left its row on "running", with the UI polling forever.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv() }));

const workerOptions = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));
vi.mock("../../../../shared/database/queue.js", () => ({
  COMMAND_EXEC_QUEUE: "command-exec",
  createWorker: (_q: string, _h: unknown, opts: Record<string, unknown>) => {
    workerOptions.current = opts;
    return { register: vi.fn(), enqueue: vi.fn() };
  },
}));

const calls: Array<[string, unknown[]]> = [];
function chain(result: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
  };
  for (const m of ["select", "update", "eq", "lt", "order", "range"]) {
    c[m] = (...args: unknown[]) => { calls.push([m, args]); return c; };
  }
  return c;
}
vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: () => chain({ data: [], error: null, count: 0 }) },
}));

const { COMMAND_JOB_EXPIRE_SECONDS } = await import("../worker.js");
const { listCommands, STALE_COMMAND_OUTPUT } = await import("../commands.js");

beforeEach(() => { calls.length = 0; });

describe("command execution", () => {
  it("is never retried, and its job outlives the slowest command", () => {
    expect(workerOptions.current).toMatchObject({ retryLimit: 0 });
    // 30 s SSH connect + 120 s exec is the slowest Dokploy path.
    expect(COMMAND_JOB_EXPIRE_SECONDS).toBeGreaterThan(150);
  });

  it("closes commands left running past the job's expiry when listing", async () => {
    const before = Date.now();
    await listCommands({ tenantId: "org-1", projectId: "p1" });

    const update = calls.find(([m]) => m === "update");
    expect(update?.[1][0]).toMatchObject({ status: "failed", output: STALE_COMMAND_OUTPUT });
    expect(calls).toContainEqual(["eq", ["status", "running"]]);
    expect(calls).toContainEqual(["eq", ["organization_id", "org-1"]]);
    const cutoff = calls.find(([m, a]) => m === "lt" && a[0] === "started_at")?.[1][1] as string;
    // Older than the expiry, never a command still inside its run window.
    expect(before - Date.parse(cutoff)).toBeGreaterThan(COMMAND_JOB_EXPIRE_SECONDS * 1000);
  });
});

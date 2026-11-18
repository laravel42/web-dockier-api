/**
 * "Monitor with heartbeats" on a scheduled job was a stored flag and nothing
 * else: no heartbeat, no URL, no ping. Pinned here: the job owns a heartbeat that
 * follows its settings, the cron line pings it only after a successful run
 * (checked in a real shell), and frequencies without a fixed interval are refused.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hb = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), waiting: vi.fn() }));
vi.mock("../../../../shared/service-clients/heartbeats.js", () => ({
  createHeartbeat: hb.create,
  deleteHeartbeat: hb.remove,
  setHeartbeatWaiting: hb.waiting,
}));
const saved = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>> }));
const owner = vi.hoisted(() => ({ row: null as unknown, list: [] as unknown[], filters: [] as string[] }));
vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {
          maybeSingle: async () => ({ data: owner.row, error: null }),
          // Awaited without .maybeSingle(): the list query.
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: owner.list, error: null }).then(ok),
        };
        for (const m of ["eq", "like", "limit", "not"]) {
          chain[m] = (...args: unknown[]) => { owner.filters.push(`${m}:${JSON.stringify(args)}`); return chain; };
        }
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        saved.updates.push(payload);
        const chain = {
          eq: () => chain,
          select: () => chain,
          single: async () => ({ data: { ...baseRow, ...payload }, error: null }),
        };
        return chain;
      },
    }),
  },
}));
vi.mock("../../../../shared/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const {
  assertMonitorable, heartbeatIdFromUrl, jobCronCommand, syncJobHeartbeat, removeJobHeartbeat, pauseJobHeartbeat,
  findJobOwningHeartbeat, listJobsOwningHeartbeats,
} = await import("../job-heartbeat.js");

const HB_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const PING = `https://api.dockier.dev/heartbeats/${HB_ID}/ping`;
const baseRow = {
  id: "job-1", organization_id: "org-1", project_id: "p1", name: "Backups", command: "php artisan backup",
  user: "root", frequency: "nightly", custom_cron: null, monitor_heartbeat: true, heartbeat_url: null as string | null,
  status: "installed", last_run_at: null, created_at: "", updated_at: "",
};

beforeEach(() => {
  saved.updates.length = 0;
  hb.create.mockReset().mockResolvedValue({ pingUrl: PING });
  hb.remove.mockReset().mockResolvedValue(undefined);
  hb.waiting.mockReset().mockResolvedValue(undefined);
});

describe("which jobs can be monitored", () => {
  it("refuses frequencies with no fixed interval, and only when monitoring is on", () => {
    expect(() => assertMonitorable("on_reboot", true)).toThrow(/fixed schedule/);
    expect(() => assertMonitorable("custom", true)).toThrow(/fixed schedule/);
    expect(() => assertMonitorable("custom", false)).not.toThrow();
    expect(() => assertMonitorable("nightly", true)).not.toThrow();
  });

  it("reads the heartbeat id back from its ping URL", () => {
    expect(heartbeatIdFromUrl(PING)).toBe(HB_ID);
    expect(heartbeatIdFromUrl(null)).toBeNull();
    expect(heartbeatIdFromUrl("https://example.com/other")).toBeNull();
  });
});

describe("the job's heartbeat follows its settings", () => {
  it("creates one when monitoring is turned on, on the job's schedule, and stores its URL", async () => {
    const row = await syncJobHeartbeat(baseRow, false);
    expect(hb.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "org-1", projectId: "p1", name: "Scheduled job: Backups", frequency: "daily",
    }));
    expect(row.heartbeat_url).toBe(PING);
  });

  it("keeps the existing one when nothing about the schedule changed", async () => {
    await syncJobHeartbeat({ ...baseRow, heartbeat_url: PING }, false);
    expect(hb.create).not.toHaveBeenCalled();
    expect(hb.remove).not.toHaveBeenCalled();
    expect(saved.updates).toEqual([]);
  });

  it("replaces it when the frequency changed, so it is judged on the new schedule", async () => {
    await syncJobHeartbeat({ ...baseRow, heartbeat_url: PING, frequency: "hourly" }, true);
    expect(hb.remove).toHaveBeenCalledWith({ tenantId: "org-1", projectId: "p1", heartbeatId: HB_ID });
    expect(hb.create).toHaveBeenCalledWith(expect.objectContaining({ frequency: "hourly" }));
  });

  it("deletes it and clears the URL when monitoring is turned off", async () => {
    const row = await syncJobHeartbeat({ ...baseRow, heartbeat_url: PING, monitor_heartbeat: false }, false);
    expect(hb.remove).toHaveBeenCalled();
    expect(row.heartbeat_url).toBeNull();
  });

  it("goes with the job, and waits while the job is paused", async () => {
    await removeJobHeartbeat({ ...baseRow, heartbeat_url: PING });
    expect(hb.remove).toHaveBeenCalledTimes(1);
    await pauseJobHeartbeat({ ...baseRow, heartbeat_url: PING });
    expect(hb.waiting).toHaveBeenCalledWith({ tenantId: "org-1", heartbeatId: HB_ID });
  });
});

describe("listing the jobs behind a project's heartbeats", () => {
  it("keys them by the heartbeat id in each job's ping URL, in one query", async () => {
    owner.list = [
      { id: "job-1", name: "Backups", heartbeat_url: PING },
      { id: "job-2", name: "Broken", heartbeat_url: "https://example.com/not-a-ping-url" },
    ];
    owner.filters.length = 0;
    const owners = await listJobsOwningHeartbeats("org-1", "p1");
    expect([...owners]).toEqual([[HB_ID, { id: "job-1", name: "Backups" }]]);
    expect(owner.filters).toContain('eq:["organization_id","org-1"]');
    expect(owner.filters).toContain('eq:["project_id","p1"]');
  });
});

describe("finding the job behind a heartbeat", () => {
  it("looks in this tenant's jobs for that exact ping URL", async () => {
    owner.row = { id: "job-1", name: "Backups" };
    owner.filters.length = 0;
    await expect(findJobOwningHeartbeat("org-1", HB_ID)).resolves.toEqual({ id: "job-1", name: "Backups" });
    expect(owner.filters).toContain('eq:["organization_id","org-1"]');
    expect(owner.filters).toContain(`like:["heartbeat_url","%/heartbeats/${HB_ID}/ping"]`);
  });

  it("returns null when no job owns it", async () => {
    owner.row = null;
    await expect(findJobOwningHeartbeat("org-1", HB_ID)).resolves.toBeNull();
  });
});

describe("the cron line", () => {
  it("is the bare command without monitoring", () => {
    expect(jobCronCommand({ ...baseRow, monitor_heartbeat: false, heartbeat_url: PING })).toBe("php artisan backup");
    expect(jobCronCommand({ ...baseRow, heartbeat_url: null })).toBe("php artisan backup");
  });

  // Real shell, with a stand-in curl that records what it was asked to fetch.
  it.each([
    ["true", true],
    ["false", false],
  ])("pings only after the command succeeds (command: %s)", (command, pinged) => {
    const dir = mkdtempSync(join(tmpdir(), "job-ping-"));
    try {
      const calls = join(dir, "calls");
      writeFileSync(join(dir, "curl"), `#!/bin/sh\necho "$@" >> ${JSON.stringify(calls)}\n`);
      chmodSync(join(dir, "curl"), 0o755);
      const line = jobCronCommand({ ...baseRow, command, heartbeat_url: PING });
      try {
        execFileSync("sh", ["-c", line], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
      } catch {
        // `false` exits non-zero: that is the run cron would report as failed.
      }
      expect(existsSync(calls)).toBe(pinged);
      if (pinged) expect(readFileSync(calls, "utf8")).toContain(PING);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

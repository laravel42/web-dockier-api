/**
 * Tests for the scheduler executor.
 *
 * This module builds and runs `crontab` shell commands on deployed
 * infrastructure, so its input validation is security-sensitive: the job's
 * `user` field is interpolated into `crontab -u ${user}`, and the cron
 * expression is interpolated into a crontab line. These tests exercise the
 * public API (installJob / pauseJob / removeJobCron) and assert on:
 *   - rejection of unsafe usernames BEFORE any command runs (injection guard)
 *   - rejection of malformed cron expressions
 *   - the frequency → cron mapping and custom-cron override
 *   - the per-job marker used for idempotent install/remove
 *   - tenant/project scoping (not found / forbidden)
 *
 * The Supabase client and the command-execution client are mocked so no DB
 * or infrastructure is touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledJobRow } from "../../schemas.js";

// ─── Mocks ─────────────────────────────────────────────────────────

// The scheduled-jobs row the fetch returns. Tests mutate this per-case.
let jobRow: ScheduledJobRow | null = null;
// Captures status updates written back to the DB.
const statusUpdates: Array<{ payload: Record<string, unknown> }> = [];

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== "scheduled_jobs") throw new Error(`unexpected table ${table}`);
      return {
        // SELECT ... .eq().eq().eq().single()
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: jobRow, error: null }),
              }),
            }),
          }),
        }),
        // UPDATE(payload).eq()
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            statusUpdates.push({ payload });
            return { data: null, error: null };
          },
        }),
      };
    },
  },
}));

const resolveExecutionTarget = vi.fn();
const executeCommand = vi.fn();

vi.mock("../../../../shared/service-clients/command-execution.js", () => ({
  resolveExecutionTarget: (...a: unknown[]) => resolveExecutionTarget(...a),
  executeCommand: (...a: unknown[]) => executeCommand(...a),
}));

vi.mock("../../../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { installJob, pauseJob, removeJobCron } = await import("../scheduler-executor.js");

// ─── Fixtures ──────────────────────────────────────────────────────

const TENANT = "org-1";
const PROJECT = "proj-1";
const JOB_ID = "abc123de-0000-0000-0000-000000000000";

function makeJob(overrides: Partial<ScheduledJobRow> = {}): ScheduledJobRow {
  return {
    id: JOB_ID,
    organization_id: TENANT,
    project_id: PROJECT,
    name: "nightly cleanup",
    command: "php artisan cleanup",
    user: "root",
    frequency: "nightly",
    custom_cron: null,
    monitor_heartbeat: false,
    heartbeat_url: null,
    status: "created",
    last_run_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

/** The command string passed to executeCommand on the most recent call. */
function lastCommand(): string {
  const call = executeCommand.mock.calls.at(-1);
  return (call?.[1] as string) ?? "";
}

const OK_TARGET = { target: { instanceId: "i-1", containerName: "app", credentials: { kind: "aws", accessKeyId: "k", secretAccessKey: "s" }, region: "us-east-1" } };

beforeEach(() => {
  jobRow = makeJob();
  statusUpdates.length = 0;
  resolveExecutionTarget.mockResolvedValue(OK_TARGET);
  executeCommand.mockResolvedValue({ exitCode: 0, output: "INSTALLED\nPAUSED", timedOut: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Username injection guard ──────────────────────────────────────

describe("scheduler-executor — username safety", () => {
  const params = () => ({ tenantId: TENANT, projectId: PROJECT, jobId: JOB_ID });

  it.each([
    "root; rm -rf /",
    "user`whoami`",
    "user$(id)",
    "a b",           // space
    "root\nmalicious",
    "1user",         // must start with letter/underscore
    "UPPER",         // uppercase not allowed by the regex
    "x".repeat(33),  // exceeds 32 chars
    "",
  ])("rejects unsafe username %j before running any command", async (user) => {
    jobRow = makeJob({ user });

    await expect(installJob(params())).rejects.toThrow(/valid Unix username/i);
    // Critical: no command was ever sent to infrastructure.
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it.each(["root", "www-data", "deploy_user", "_svc", "a", "u-1"])(
    "accepts valid username %j",
    async (user) => {
      jobRow = makeJob({ user });
      const res = await installJob(params());
      expect(res.success).toBe(true);
      expect(executeCommand).toHaveBeenCalledOnce();
    },
  );

  it("rejects unsafe username on pause too", async () => {
    jobRow = makeJob({ user: "root; echo pwned" });
    await expect(pauseJob(params())).rejects.toThrow(/valid Unix username/i);
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

// ─── Cron expression validation ────────────────────────────────────

describe("scheduler-executor — cron validation", () => {
  const params = () => ({ tenantId: TENANT, projectId: PROJECT, jobId: JOB_ID });

  it("rejects a custom cron with too few fields", async () => {
    jobRow = makeJob({ frequency: "custom", custom_cron: "* * *" });
    await expect(installJob(params())).rejects.toThrow(/Invalid cron expression/i);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("rejects a custom cron with too many fields", async () => {
    jobRow = makeJob({ frequency: "custom", custom_cron: "* * * * * * *" });
    await expect(installJob(params())).rejects.toThrow(/Invalid cron expression/i);
  });

  it("accepts a 5-field custom cron", async () => {
    jobRow = makeJob({ frequency: "custom", custom_cron: "30 2 * * 1" });
    const res = await installJob(params());
    expect(res.success).toBe(true);
    expect(lastCommand()).toContain("30 2 * * 1 php artisan cleanup");
  });

  it("accepts a 6-field custom cron (with seconds)", async () => {
    jobRow = makeJob({ frequency: "custom", custom_cron: "0 30 2 * * 1" });
    const res = await installJob(params());
    expect(res.success).toBe(true);
  });
});

// ─── Frequency → cron mapping ──────────────────────────────────────

describe("scheduler-executor — frequency mapping", () => {
  const params = () => ({ tenantId: TENANT, projectId: PROJECT, jobId: JOB_ID });

  it.each([
    ["every_minute", "* * * * *"],
    ["hourly", "0 * * * *"],
    ["nightly", "0 0 * * *"],
    ["weekly", "0 0 * * 0"],
    ["monthly", "0 0 1 * *"],
    ["on_reboot", "@reboot"],
  ])("maps frequency %s to %s", async (frequency, expected) => {
    jobRow = makeJob({ frequency });
    await installJob(params());
    expect(lastCommand()).toContain(`${expected} php artisan cleanup`);
  });

  it("falls back to hourly for an unknown frequency", async () => {
    jobRow = makeJob({ frequency: "yearly" });
    await installJob(params());
    expect(lastCommand()).toContain("0 * * * * php artisan cleanup");
  });

  it("prefers custom_cron only when frequency is 'custom'", async () => {
    // custom_cron set but frequency is nightly → the frequency wins
    jobRow = makeJob({ frequency: "nightly", custom_cron: "5 5 5 5 5" });
    await installJob(params());
    expect(lastCommand()).toContain("0 0 * * * php artisan cleanup");
  });
});

// ─── Marker + idempotency ──────────────────────────────────────────

describe("scheduler-executor — job marker", () => {
  const params = () => ({ tenantId: TENANT, projectId: PROJECT, jobId: JOB_ID });

  it("derives an 8-hex-char marker from the job id and uses it to install and remove", async () => {
    await installJob(params());
    // jobId "abc123de-..." → hex-only, first 8 chars → "abc123de"
    expect(lastCommand()).toContain("# DOCKIER_JOB_abc123de");
    // The install both strips the old entry (grep -v) and adds the new one.
    expect(lastCommand()).toContain('grep -v "# DOCKIER_JOB_abc123de"');
  });

  it("pause removes the same marker line", async () => {
    await pauseJob(params());
    expect(lastCommand()).toContain('grep -v "# DOCKIER_JOB_abc123de"');
    expect(lastCommand()).toContain("echo PAUSED");
  });
});

// ─── Status writes + result handling ───────────────────────────────

describe("scheduler-executor — outcomes", () => {
  const params = () => ({ tenantId: TENANT, projectId: PROJECT, jobId: JOB_ID });

  it("marks the job 'installed' on success", async () => {
    await installJob(params());
    expect(statusUpdates.at(-1)?.payload.status).toBe("installed");
  });

  it("marks the job 'paused' on pause success", async () => {
    await pauseJob(params());
    expect(statusUpdates.at(-1)?.payload.status).toBe("paused");
  });

  it("returns failure (no status write) when the command lacks the success marker", async () => {
    executeCommand.mockResolvedValue({ exitCode: 0, output: "something else", timedOut: false });
    const res = await installJob(params());
    expect(res.success).toBe(false);
    expect(statusUpdates.length).toBe(0);
  });

  it("returns a friendly failure when executeCommand throws", async () => {
    executeCommand.mockRejectedValue(new Error("ssh down"));
    const res = await installJob(params());
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/ssh down/);
  });

  it("returns failure when there is no active deployment target", async () => {
    resolveExecutionTarget.mockResolvedValue({ target: null, errorMessage: "No active deployment found." });
    const res = await installJob(params());
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/No active deployment/);
    expect(executeCommand).not.toHaveBeenCalled();
  });
});

// ─── Tenant / project scoping ──────────────────────────────────────

describe("scheduler-executor — scoping", () => {
  const params = () => ({ tenantId: TENANT, projectId: PROJECT, jobId: JOB_ID });

  it("throws not_found when the job row is missing", async () => {
    jobRow = null;
    await expect(installJob(params())).rejects.toThrow(/not found/i);
  });

  it("throws forbidden when the row's organization_id doesn't match the tenant", async () => {
    jobRow = makeJob({ organization_id: "other-org" });
    await expect(installJob(params())).rejects.toThrow(/Access denied/i);
  });
});

// ─── removeJobCron is best-effort ──────────────────────────────────

describe("scheduler-executor — removeJobCron", () => {
  const params = () => ({ tenantId: TENANT, projectId: PROJECT, jobId: JOB_ID });

  it("does not throw even when pause fails hard", async () => {
    executeCommand.mockRejectedValue(new Error("infra gone"));
    await expect(removeJobCron(params())).resolves.toBeUndefined();
  });

  it("does not throw even when the job row is missing", async () => {
    jobRow = null;
    await expect(removeJobCron(params())).resolves.toBeUndefined();
  });
});

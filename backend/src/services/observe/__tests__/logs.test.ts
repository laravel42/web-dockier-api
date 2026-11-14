import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Observe logs go through the shared project runner, so a Dokploy project reads
 * the log inside its container. Clearing a log that does not exist must not
 * record a "cleared" event.
 */
const runner = vi.hoisted(() => ({ run: vi.fn() }));
const readDokployContainerLogs = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/service-clients/command-execution.js", () => ({
  resolveProjectRunner: vi.fn(async () => ({ run: runner.run })),
  readDokployContainerLogs,
}));

const recordActivity = vi.hoisted(() => vi.fn());
vi.mock("../domain/activity.js", () => ({ recordActivity }));

const { getLog, clearLog } = await import("../domain/logs.js");
const { resolveProjectRunner } = await import("../../../shared/service-clients/command-execution.js");

const params = { tenantId: "t1", projectId: "p1", logType: "nginx_access" as const };

describe("observe logs", () => {
  beforeEach(() => {
    runner.run.mockReset();
    recordActivity.mockReset();
    readDokployContainerLogs.mockReset().mockResolvedValue(null);
  });

  it("falls back to the container's output when the site log file does not exist", async () => {
    runner.run.mockResolvedValue({ exitCode: 1, output: "NO_LOG_FOUND\n", timedOut: false });
    readDokployContainerLogs.mockResolvedValue({ exitCode: 0, output: "listening on 3000\n", timedOut: false });
    const log = await getLog({ ...params, logType: "site" });
    expect(readDokployContainerLogs).toHaveBeenCalledWith("p1", 500);
    expect(log.content).toBe("listening on 3000\n");
    expect(log.source).toBe("container");
  });

  it("marks messages and read errors as not log data (source null)", async () => {
    runner.run.mockResolvedValue({ exitCode: 1, output: "tail: Permission denied\n", timedOut: false });
    const log = await getLog(params);
    expect(log.source).toBeNull();
    expect(log.content).toContain("Permission denied");
  });

  it("keeps 'not found' when there is no container to read (native projects, nginx logs)", async () => {
    runner.run.mockResolvedValue({ exitCode: 1, output: "NO_LOG_FOUND\n", timedOut: false });
    expect((await getLog({ ...params, logType: "site" })).content).toContain("not found");
    expect((await getLog(params)).content).toContain("not found");
    // nginx logs never fall back: a container's stdout is not an access log.
    expect(readDokployContainerLogs).toHaveBeenCalledTimes(1);
  });

  it("reads the log through the project runner", async () => {
    runner.run.mockResolvedValue({ exitCode: 0, output: "GET / 200\n", timedOut: false });
    const log = await getLog(params);
    expect(resolveProjectRunner).toHaveBeenCalledWith("p1", "t1");
    expect(runner.run.mock.calls[0][0]).toContain("tail -n 500");
    expect(log.content).toBe("GET / 200\n");
    expect(log.source).toBe("file");
  });

  it("shows the runner's reason when the project cannot run commands", async () => {
    vi.mocked(resolveProjectRunner).mockResolvedValueOnce({ run: null, errorMessage: "Deploy it first." });
    const log = await getLog(params);
    expect(log.content).toBe("Deploy it first.");
    expect(log.source).toBeNull();
  });

  it("refuses to clear a log that does not exist and records nothing", async () => {
    runner.run.mockResolvedValue({ exitCode: 1, output: "NO_LOG_FOUND\n", timedOut: false });
    await expect(clearLog(params)).rejects.toMatchObject({ code: "not_found" });
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("records who cleared the log", async () => {
    runner.run.mockResolvedValue({ exitCode: 0, output: "", timedOut: false });
    await clearLog({ ...params, userId: "u1" });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", eventType: "log_cleared" }));
  });

  // Only the read script is executed for real: the clear one truncates files, never run it on a dev machine.
  it.skipIf(["/var/log/nginx/access.log", "/var/log/access.log"].some((p) => existsSync(p)))(
    "the read script reports NO_LOG_FOUND when no file exists", async () => {
    runner.run.mockResolvedValue({ exitCode: 0, output: "", timedOut: false });
    await getLog(params);
    const script = runner.run.mock.calls[0][0] as string;
    let out = "";
    let code = 0;
    try {
      out = execFileSync("sh", ["-c", script], { encoding: "utf8" });
    } catch (err) {
      const e = err as { status: number; stdout: string };
      code = e.status;
      out = e.stdout;
    }
    expect(code).toBe(1);
    expect(out).toContain("NO_LOG_FOUND");
  });
});

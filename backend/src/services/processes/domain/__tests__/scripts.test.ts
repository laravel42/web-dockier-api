/**
 * The process and cron scripts, RUN in a real `sh` rather than string-matched:
 * every bug fixed here passed the old mocked tests.
 *
 *  - Stop never stopped anything: it ran `pkill -f` on an environment variable
 *    that pkill cannot see, reported "stopped", and Restart stacked copies.
 *  - Removing one job's cron entry (`grep -v "# ↑ dockier"`) removed every job's.
 *  - A command containing ' or % broke the crontab line it was written into.
 *
 * Runs on the host's /bin/sh. macOS has no setsid, so the no-setsid fallback is
 * what runs here; the setsid path was checked by hand in an Alpine container.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, readdirSync } from "node:fs";
import {
  cronLine, cronRemoveFilter, isValidCronExpression, processTag, shQuote, startProcessScript, stopProcessScript,
} from "../scripts.js";

const sh = (script: string) => execFileSync("sh", ["-c", script], { encoding: "utf8" });
/** PIDs of `sleep <seconds>` processes — each test uses its own duration. */
const sleepers = (seconds: number) =>
  sh(`pgrep -f "^sleep ${seconds}$" || true`).split("\n").filter(Boolean);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const started: number[] = [];
afterEach(() => {
  for (const s of started.splice(0)) sh(`pkill -f "^sleep ${s}$" || true`);
  for (const f of readdirSync("/tmp").filter((n) => n.startsWith("DOCKIER_PROC_"))) rmSync(`/tmp/${f}`, { force: true });
});

describe("process scripts", () => {
  it("stop actually stops what start started", async () => {
    const id = randomUUID();
    started.push(3017);

    expect(sh(startProcessScript(id, "sleep 3017", 2))).toContain("STARTED");
    expect(sleepers(3017)).toHaveLength(2);

    expect(sh(stopProcessScript(id))).toContain("STOPPED");
    await wait(200);
    expect(sleepers(3017)).toHaveLength(0);
  });

  it("a second start replaces the running copies instead of adding to them", async () => {
    const id = randomUUID();
    started.push(3018);

    sh(startProcessScript(id, "sleep 3018", 1));
    sh(startProcessScript(id, "sleep 3018", 1));
    await wait(200);

    expect(sleepers(3018)).toHaveLength(1);
  });

  it("stops a process started by the previous restore format", async () => {
    const id = randomUUID();
    started.push(3019);
    // What post-deploy-restore used to run.
    const child = spawn("sh", ["-c", `export ${processTag(id)}=1 && sleep 3019`], { detached: true, stdio: "ignore" });
    child.unref();
    await wait(200);
    expect(sleepers(3019)).toHaveLength(1);

    // The legacy pattern must not match the stop script's own command line.
    expect(sh(stopProcessScript(id))).toContain("STOPPED");
    await wait(200);
    expect(sleepers(3019)).toHaveLength(0);
  });

  it("keeps a command with quotes and operators as one unit", () => {
    const id = randomUUID();
    sh(startProcessScript(id, `echo 'it''s' && printf '%s' "a;b"`, 1));
    const out = sh(`sleep 0.3; cat /tmp/${processTag(id)}_0.log`);
    // One shell ran both: `&&`, the quotes and the `;` inside "a;b" all survived.
    expect(out).toBe("its\na;b");
  });

  it("caps the number of instances", () => {
    const script = startProcessScript(randomUUID(), "true", 100);
    expect(script.match(/nohup sh -c/g)).toHaveLength(10);
  });
});

describe("cron scripts", () => {
  const A = "aaaaaaaa-0000-4000-8000-000000000001";
  const B = "bbbbbbbb-0000-4000-8000-000000000002";

  it("removes only this job's entry, in the new and the legacy format", () => {
    const crontab = [
      "MAILTO=ops@example.com",
      "15 * * * * /usr/local/bin/backup.sh",
      // legacy two-line entries
      "# DOCKIER_JOB_aaaaaaaa",
      "0 0 * * * php artisan a # ↑ dockier",
      "# DOCKIER_JOB_bbbbbbbb",
      "0 1 * * * php artisan b # ↑ dockier",
      // new format
      cronLine("5 * * * *", "php artisan a2", A),
      cronLine("6 * * * *", "php artisan b2", B),
      "",
    ].join("\n");

    const out = sh(`printf '%s' ${shQuote(crontab)} | ${cronRemoveFilter(A)}`);

    expect(out).not.toContain("artisan a");
    expect(out).toContain("# DOCKIER_JOB_bbbbbbbb\n0 1 * * * php artisan b # ↑ dockier");
    expect(out).toContain("php artisan b2 # DOCKIER_JOB_bbbbbbbb");
    expect(out).toContain("15 * * * * /usr/local/bin/backup.sh");
    expect(out).toContain("MAILTO=ops@example.com");
  });

  it("writes a command with quotes and % as one valid crontab line", () => {
    const line = cronLine("0 3 * * *", `echo 'done' > /tmp/x-$(date +%F).log`, A);
    const written = sh(`printf '%s\\n' ${shQuote(line)}`);

    expect(written).toBe(`0 3 * * * echo 'done' > /tmp/x-$(date +\\%F).log # DOCKIER_JOB_aaaaaaaa\n`);
  });

  it.each([
    ["30 2 * * 1", true], ["*/5 * * * *", true], ["0 0 1 jan,jul *", true], ["@daily", true], ["@reboot", true],
    ["* * *", false], ["0 30 2 * * 1", false], ["* * * * * rm", false], ["* * * * *;id", false], ["@sometimes", false],
  ])("validates the cron expression %j → %s", (expr, ok) => {
    expect(isValidCronExpression(expr)).toBe(ok);
  });
});

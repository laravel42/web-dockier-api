/**
 * Shell-boundary tests for the native command executor.
 *
 * What these pin down (and why each one matters):
 *   1. The SSM path hand-rolls a POSIX single-quote escape and hands the result
 *      to a remote root shell. If it ever breaks, a user command escapes its
 *      container and runs as root on the host — on a shared box that reaches
 *      other tenants' containers.
 *   2. The container-name guard lives in `executeCommand` only; the five
 *      execution paths are module-private, so the invariant currently holds by
 *      visibility rather than by contract. Pin it so exporting one of them
 *      cannot silently drop the check.
 *   3. ECS and Cloud Run must pass the command as an ARRAY element, never
 *      concatenated into a string — that is what makes them shell-free.
 *   4. A timed-out child must be killed, not orphaned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

// ─── Mocks ─────────────────────────────────────────────────────────

// child_process.spawn — capture args and drive a fake process.
const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
let fakeProc: FakeProc;
vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[]) => {
    spawnCalls.push({ cmd, args });
    return fakeProc;
  },
}));

// Polling sleeps must not take real time.
vi.mock("../../../../shared/utils/time.js", () => ({ sleep: async () => undefined }));

vi.mock("../../../../lib/provider-credentials.js", () => ({
  toAwsCredentials: () => ({ accessKeyId: "AK", secretAccessKey: "SK" }),
  toGcpServiceAccountKey: () => ({ project_id: "proj" }),
}));

// ─── AWS SDK fakes ─────────────────────────────────────────────────

class SendCommandCommand { constructor(public input: Record<string, unknown>) {} }
class GetCommandInvocationCommand { constructor(public input: Record<string, unknown>) {} }
const ssmSends: Array<SendCommandCommand | GetCommandInvocationCommand> = [];
class SSMClient {
  constructor(public cfg: unknown) {}
  async send(cmd: SendCommandCommand | GetCommandInvocationCommand) {
    ssmSends.push(cmd);
    if (cmd instanceof SendCommandCommand) return { Command: { CommandId: "cmd-1" } };
    return { Status: "Success", StandardOutputContent: "ok\n" };
  }
}

class RunTaskCommand { constructor(public input: Record<string, unknown>) {} }
class DescribeTasksCommand { constructor(public input: Record<string, unknown>) {} }
class DescribeServicesCommand { constructor(public input: Record<string, unknown>) {} }
const ecsSends: Array<RunTaskCommand | DescribeTasksCommand | DescribeServicesCommand> = [];
class ECSClient {
  constructor(public cfg: unknown) {}
  async send(cmd: RunTaskCommand | DescribeTasksCommand | DescribeServicesCommand) {
    ecsSends.push(cmd);
    if (cmd instanceof DescribeServicesCommand) {
      return { services: [{ networkConfiguration: { awsvpcConfiguration: { subnets: ["subnet-1"], assignPublicIp: "ENABLED" } } }] };
    }
    if (cmd instanceof RunTaskCommand) return { tasks: [{ taskArn: "arn:task/1" }] };
    return { tasks: [{ containers: [{ exitCode: 0 }] }] };
  }
}

vi.mock("../../../../lib/aws-sdk.js", () => ({
  getSsm: async () => ({ SSMClient, SendCommandCommand, GetCommandInvocationCommand }),
  getEcs: async () => ({
    ECSClient, RunTaskCommand, DescribeTasksCommand, DescribeServicesCommand,
    waitUntilTasksStopped: async () => undefined,
  }),
}));

vi.mock("../../../deploy/domain/infra/gcp-client.js", () => ({
  getGcpAccessToken: async () => "token",
  getGcpProjectId: () => "proj",
}));

const { executeCommand } = await import("../executor.js");

// ─── Fake child process ────────────────────────────────────────────

class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
  /** Emit output then close with a code, on next tick. */
  finish(output: string, code: number) {
    setImmediate(() => {
      if (output) this.stdout.emit("data", Buffer.from(output));
      this.emit("close", code);
    });
  }
}

/** A ProviderCredential stand-in — the real shape is mocked away above. */
const CREDS = { kind: "aws" } as never;

beforeEach(() => {
  spawnCalls.length = 0;
  ssmSends.length = 0;
  ecsSends.length = 0;
  fakeProc = new FakeProc();
});
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

/** The remote script sent through SSM on the most recent SendCommand. */
function lastSsmScript(): string {
  const send = ssmSends.find((c): c is SendCommandCommand => c instanceof SendCommandCommand);
  const params = send?.input.Parameters as { commands: string[] } | undefined;
  return params!.commands[0];
}

// ─── 1. SSM shell escaping ─────────────────────────────────────────

describe("executeCommand — SSM shell escaping", () => {
  const target = { instanceId: "i-123", containerName: "web", credentials: CREDS, region: "us-east-1" };

  it("wraps the command in sh -c with single quotes escaped POSIX-style", async () => {
    await executeCommand(target, "echo 'hi'");
    // `'` must become `'\''`: close the quote, pass a literal quote, reopen.
    expect(lastSsmScript()).toBe(String.raw`docker exec web sh -c 'echo '\''hi'\'''`);
  });

  it("keeps shell metacharacters inside the quoted payload", async () => {
    // These are legitimate for the user (it is their own container), so they
    // must reach `sh -c` intact — and must NOT reach the HOST shell.
    await executeCommand(target, "a; b && c | d $(e) `f` > /g");
    const script = lastSsmScript();

    expect(script.startsWith("docker exec web sh -c '")).toBe(true);
    expect(script.endsWith("'")).toBe(true);

    // The only single quotes in the payload are the escape sequences themselves.
    const payload = script.slice("docker exec web sh -c '".length, -1);
    expect(payload.replaceAll(String.raw`'\''`, "")).not.toContain("'");
    expect(payload).toBe("a; b && c | d $(e) `f` > /g");
  });

  it("does not let a quote in the command terminate the quoted payload", async () => {
    // The classic break: a bare `'` would close `sh -c '…'` and the rest would
    // be parsed by the HOST shell as root.
    await executeCommand(target, "x'; id #");
    const payload = lastSsmScript().slice("docker exec web sh -c '".length, -1);
    expect(payload).toBe(String.raw`x'\''; id #`);
    expect(payload.replaceAll(String.raw`'\''`, "")).not.toContain("'");
  });

  it("returns the command output on success", async () => {
    const result = await executeCommand(target, "whoami");
    expect(result).toEqual({ exitCode: 0, output: "ok", timedOut: false });
  });
});

// ─── 2. Container-name guard ───────────────────────────────────────

describe("executeCommand — container name guard", () => {
  it.each([
    ["web; rm -rf /", "command separator"],
    ["web name", "whitespace"],
    ["$(id)", "substitution"],
    ["--privileged", "leading dash would be read as a docker flag"],
    ["", "empty"],
  ])("rejects %j (%s) without executing anything", async (containerName) => {
    const result = await executeCommand(
      { instanceId: "i-123", containerName, credentials: CREDS, region: "us-east-1" },
      "echo hi",
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Invalid container name");
    expect(ssmSends).toHaveLength(0);
    expect(spawnCalls).toHaveLength(0);
  });

  it("accepts a normal derived container name", async () => {
    const result = await executeCommand(
      { instanceId: "i-123", containerName: "my-app_v1.2", credentials: CREDS, region: "us-east-1" },
      "echo hi",
    );
    expect(result.exitCode).toBe(0);
  });
});

// ─── 3. Shell-free managed paths ───────────────────────────────────

describe("executeCommand — managed paths pass the command as an array", () => {
  it("ECS RunTask overrides carry [sh, -c, command] unconcatenated", async () => {
    const result = await executeCommand(
      { containerName: "web", credentials: CREDS, region: "us-east-1", ecsCluster: "web", ecsTaskFamily: "web" },
      "echo 'hi'; id",
    );

    expect(result.exitCode).toBe(0);
    const run = ecsSends.find((c): c is RunTaskCommand => c instanceof RunTaskCommand);
    const overrides = run!.input.overrides as { containerOverrides: Array<{ command: string[] }> };
    // Verbatim: no escaping, because there is no shell doing word splitting.
    expect(overrides.containerOverrides[0].command).toEqual(["sh", "-c", "echo 'hi'; id"]);
    expect(spawnCalls).toHaveLength(0);
  });

  it("Cloud Run Job containers carry [sh, -c, command] unconcatenated", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) bodies.push(JSON.parse(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          metadata: { name: "projects/p/locations/r/jobs/j/executions/e" },
          completionTime: "now",
          conditions: [{ type: "Completed", state: "CONDITION_SUCCEEDED" }],
        }),
        text: async () => "",
      };
    }));

    const result = await executeCommand(
      { containerName: "web", credentials: CREDS, region: "europe-west1", cloudRunService: "web", gcpProjectId: "proj" },
      "echo 'hi'; id",
    );

    expect(result.exitCode).toBe(0);
    const template = bodies[0].template as { template: { containers: Array<{ command: string[] }> } };
    expect(template.template.containers[0].command).toEqual(["sh", "-c", "echo 'hi'; id"]);
    expect(spawnCalls).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("the local docker fallback spawns without a shell", async () => {
    fakeProc.finish("hi\n", 0);
    const result = await executeCommand({ containerName: "web" }, "echo 'hi'; id");

    expect(result).toEqual({ exitCode: 0, output: "hi\n", timedOut: false });
    expect(spawnCalls).toEqual([{ cmd: "docker", args: ["exec", "web", "sh", "-c", "echo 'hi'; id"] }]);
  });
});

// ─── 4. Timeout kills the child ────────────────────────────────────

describe("executeCommand — timeout", () => {
  it("SIGKILLs a child that outlives the 2-minute limit and reports 124", async () => {
    vi.useFakeTimers();
    // fakeProc never closes — simulate a hung command.
    const pending = executeCommand({ containerName: "web" }, "sleep 999");

    await vi.advanceTimersByTimeAsync(120_000);
    const result = await pending;

    expect(result).toMatchObject({ exitCode: 124, timedOut: true });
    expect(fakeProc.kill).toHaveBeenCalledWith("SIGKILL");
  });
});

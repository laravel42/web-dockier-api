/**
 * The queue must never latch into fire-and-forget mode: a transient Postgres
 * failure at boot has to be retried by the next enqueue().
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestEnv } from "../../__tests__/test-helpers.js";

vi.mock("../../config.js", () => ({
  env: createTestEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db", PGBOSS_MAX_CONNECTIONS: 5 }),
}));

const start = vi.fn<() => Promise<void>>();
const send = vi.fn<() => Promise<string>>(async () => "job-id");
// Args are typed so mock.calls is inspectable (the dead letter tests assert on
// call order, not just that a call happened).
const createQueue = vi.fn(async (_name: string) => {});
const updateQueue = vi.fn(async (_name: string, _options: { deadLetter: string }) => {});
type WorkHandler = (jobs: unknown[]) => Promise<void>;
const work = vi.fn(
  async (_name: string, _options: Record<string, unknown>, _handler: WorkHandler) => "worker-id",
);
const stop = vi.fn(async () => {});

vi.mock("pg-boss", () => ({
  PgBoss: class {
    start = start;
    send = send;
    createQueue = createQueue;
    updateQueue = updateQueue;
    work = work;
    stop = stop;
    on = vi.fn();
  },
}));

beforeEach(() => {
  vi.resetModules();
  start.mockReset();
  send.mockClear();
  createQueue.mockClear();
  updateQueue.mockClear();
  work.mockClear();
  stop.mockClear();
});

describe("queue start retry", () => {
  it("retries the start on a later enqueue after a first failure", async () => {
    start.mockRejectedValueOnce(new Error("connection refused")).mockResolvedValue(undefined);
    const { startQueue, createWorker, isQueueReady } = await import("../queue.js");

    expect(await startQueue()).toBe(false);
    expect(isQueueReady()).toBe(false);

    const handler = vi.fn(async () => {});
    const worker = createWorker<{ id: string }>("test-queue", handler);

    expect(await worker.enqueue({ id: "1" })).toEqual({ queued: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("still degrades in-process while the start keeps failing", async () => {
    start.mockRejectedValue(new Error("still down"));
    const { createWorker } = await import("../queue.js");

    const handler = vi.fn(async () => {});
    const worker = createWorker<{ id: string }>("test-queue", handler);

    expect(await worker.enqueue({ id: "1" })).toEqual({ queued: false });
    expect(send).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(handler).toHaveBeenCalledWith({ id: "1" });
  });

  it("retries the worker registration on a later enqueue when it failed", async () => {
    start.mockResolvedValue(undefined);
    work.mockRejectedValueOnce(new Error("work failed"));
    const { createWorker } = await import("../queue.js");

    const worker = createWorker<{ id: string }>("test-queue", vi.fn(async () => {}));

    expect(await worker.enqueue({ id: "1" })).toEqual({ queued: true });
    expect(work).toHaveBeenCalledTimes(1);

    expect(await worker.enqueue({ id: "2" })).toEqual({ queued: true });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent enqueues onto a single start attempt", async () => {
    start.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 20)));
    const { createWorker } = await import("../queue.js");

    const worker = createWorker<{ id: string }>("test-queue", vi.fn(async () => {}));
    const results = await Promise.all([worker.enqueue({ id: "1" }), worker.enqueue({ id: "2" })]);

    expect(results).toEqual([{ queued: true }, { queued: true }]);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

/**
 * An exhausted job used to be logged and dropped. The dead letter wiring is
 * what keeps its payload, so these pin the two things that silently undo it:
 * forgetting updateQueue (createQueue is ON CONFLICT DO NOTHING, so an existing
 * queue ignores the option without error), and the per-queue opt-out.
 */
describe("dead letter wiring", () => {
  it("creates the companion queue and points the queue at it by default", async () => {
    start.mockResolvedValue(undefined);
    const { createWorker } = await import("../queue.js");

    const worker = createWorker<{ id: string }>("test-queue", vi.fn(async () => {}));
    await worker.enqueue({ id: "1" });

    expect(createQueue).toHaveBeenCalledWith("test-queue-dead");
    expect(createQueue).toHaveBeenCalledWith("test-queue");
    // The dead letter target must exist before the queue referencing it.
    const deadIndex = createQueue.mock.calls.findIndex((c) => c[0] === "test-queue-dead");
    const mainIndex = createQueue.mock.calls.findIndex((c) => c[0] === "test-queue");
    expect(deadIndex).toBeLessThan(mainIndex);

    // Without this call the option never reaches an already-existing queue.
    expect(updateQueue).toHaveBeenCalledWith("test-queue", { deadLetter: "test-queue-dead" });
  });

  it("wires nothing when a queue opts out", async () => {
    start.mockResolvedValue(undefined);
    const { createWorker } = await import("../queue.js");

    const worker = createWorker<{ id: string }>("sweep-queue", vi.fn(async () => {}), {
      deadLetter: false,
    });
    await worker.enqueue({ id: "1" });

    expect(createQueue).toHaveBeenCalledWith("sweep-queue");
    expect(createQueue).not.toHaveBeenCalledWith("sweep-queue-dead");
    expect(updateQueue).not.toHaveBeenCalled();
  });
});

/**
 * A retry and a death used to log the identical "Failed job" line, so nothing
 * marked the attempt that actually lost the work. These pin the distinction —
 * and that it is read off the job, so a job enqueued with different limits is
 * still judged correctly.
 */
describe("terminal failure logging", () => {
  /** Drive the registered work() handler with one job and collect error logs. */
  async function runJob(
    job: { id: string; data: unknown; retryCount: number; retryLimit: number },
    workerOptions?: { deadLetter?: boolean },
  ): Promise<{ msg: string; fields: Record<string, unknown> }[]> {
    start.mockResolvedValue(undefined);
    const { createWorker } = await import("../queue.js");
    const { logger } = await import("../../logger.js");

    const errors: { msg: string; fields: Record<string, unknown> }[] = [];
    vi.spyOn(logger, "child").mockReturnValue({
      info: vi.fn(),
      error: (fields: Record<string, unknown>, msg: string) => errors.push({ msg, fields }),
    } as unknown as ReturnType<typeof logger.child>);

    const worker = createWorker<unknown>("test-queue", async () => {
      throw new Error("boom");
    }, workerOptions);
    await worker.enqueue({ id: "1" });

    const handler = work.mock.calls[0][2];
    await expect(handler([job])).rejects.toThrow("boom");
    return errors;
  }

  it("names the dead letter queue on the attempt that ends the job", async () => {
    const errors = await runJob({ id: "j1", data: {}, retryCount: 2, retryLimit: 2 });

    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toContain("exhausted every retry");
    expect(errors[0].fields.deadLetterQueue).toBe("test-queue-dead");
  });

  it("marks an intermediate failure as retrying, with no dead letter queue named", async () => {
    const errors = await runJob({ id: "j1", data: {}, retryCount: 1, retryLimit: 2 });

    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toBe("Failed job, will retry");
    expect(errors[0].fields.deadLetterQueue).toBeUndefined();
  });

  it("says the payload was dropped when the queue opted out", async () => {
    const errors = await runJob({ id: "j1", data: {}, retryCount: 2, retryLimit: 2 }, { deadLetter: false });

    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toContain("dropped");
    expect(errors[0].fields.deadLetterQueue).toBeUndefined();
  });
});

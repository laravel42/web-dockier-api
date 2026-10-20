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
const createQueue = vi.fn(async () => {});
const work = vi.fn(async () => "worker-id");
const stop = vi.fn(async () => {});

vi.mock("pg-boss", () => ({
  PgBoss: class {
    start = start;
    send = send;
    createQueue = createQueue;
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

  it("collapses concurrent enqueues onto a single start attempt", async () => {
    start.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 20)));
    const { createWorker } = await import("../queue.js");

    const worker = createWorker<{ id: string }>("test-queue", vi.fn(async () => {}));
    const results = await Promise.all([worker.enqueue({ id: "1" }), worker.enqueue({ id: "2" })]);

    expect(results).toEqual([{ queued: true }, { queued: true }]);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

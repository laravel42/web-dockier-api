/**
 * A completed scan notified nobody.
 *
 * `shared/events.ts` is an in-process bus — a module-level array of listeners —
 * and the notifications service registers its handler in run-server.ts. The
 * scan runs in a subprocess, so there that array is empty and `emit` returns at
 * its first guard. Nothing threw and nothing was logged, because the bus is
 * built never to fail an emitter, so the notification vanished.
 *
 * It regressed when the scan moved into a subprocess; the emit predates that
 * and was correct then. Deploy notifications were unaffected — that pipeline
 * still runs in the parent — which is why only scans went quiet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllListeners, on, type NotifyEvent } from "../../../../shared/events.js";
import { emitScanNotification } from "../scan-events.js";

// The subprocess module reaches Supabase only through scan-cancel; nothing here
// touches the database, and importing the real client needs live config.
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: {} }));

const event: NotifyEvent = {
  tenantId: "org-1",
  title: "Security scan completed",
  message: "Scan of acme/app (main) finished with 83 finding(s) (13 errors, 61 warnings).",
  metadata: { kind: "scan", scanId: "scan-1", repo: "acme/app" },
};

/** process.send exists only in a child; tests have to install and remove it. */
const realSend = process.send;

afterEach(() => {
  if (realSend) process.send = realSend;
  else delete (process as { send?: unknown }).send;
  clearAllListeners();
});

describe("emitScanNotification", () => {
  it("relays over IPC when running as a subprocess", () => {
    const sent: unknown[] = [];
    process.send = ((msg: unknown) => {
      sent.push(msg);
      return true;
    }) as typeof process.send;

    const handler = vi.fn();
    on("notification:send", handler);

    emitScanNotification(event);

    expect(sent).toEqual([{ type: "scan-notification", event }]);
    // The local bus must NOT be used here: its listeners are the parent's, and
    // in the child there are none. Emitting locally is the bug.
    expect(handler).not.toHaveBeenCalled();
  });

  it("emits on the local bus when running in the parent", () => {
    delete (process as { send?: unknown }).send;

    const handler = vi.fn();
    on("notification:send", handler);

    emitScanNotification(event);

    expect(handler).toHaveBeenCalledWith(event);
  });
});

/**
 * The parent half: the relay has to route a notification onto the bus, and keep
 * routing progress events as before.
 */
describe("relayScanIpc", () => {
  const broadcastScanEvent = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    broadcastScanEvent.mockClear();
  });

  /** Drive the child's "message" handler the way node would. */
  async function relay(msg: unknown): Promise<{ notified: NotifyEvent[] }> {
    const notified: NotifyEvent[] = [];

    vi.doMock("../scan-events.js", () => ({
      broadcastScanEvent,
      emitScanNotification: vi.fn(),
    }));
    vi.doMock("../../../../shared/events.js", () => ({
      emit: (_name: string, e: NotifyEvent) => notified.push(e),
    }));

    const onMessage: Array<(m: unknown) => void> = [];
    vi.doMock("node:child_process", () => ({
      spawn: () => ({
        pid: 1234,
        on: (name: string, cb: (m: unknown) => void) => {
          if (name === "message") onMessage.push(cb);
        },
        kill: vi.fn(),
      }),
    }));

    const { runScanInSubprocess } = await import("../run-scan-subprocess.js");
    // Never settles — the fake child emits no close. Kept unawaited on purpose.
    void runScanInSubprocess({ scanId: "scan-1", tenantId: "org-1", options: {} }, 60_000);

    for (const cb of onMessage) cb(msg);
    return { notified };
  }

  it("puts a relayed notification onto the parent's bus", async () => {
    const { notified } = await relay({ type: "scan-notification", event });
    expect(notified).toEqual([event]);
  });

  it("still forwards progress events to the WebSocket subscribers", async () => {
    const message = { type: "progress", scanId: "scan-1", progress: { phase: "scanning" } };
    await relay({ type: "scan-event", scanId: "scan-1", message });

    expect(broadcastScanEvent).toHaveBeenCalledWith("scan-1", message);
  });

  const malformed: Array<[unknown, string]> = [
    [null, "null"],
    ["a string", "not an object"],
    [{ type: "scan-notification" }, "no event"],
    [{ type: "scan-event", scanId: "scan-1" }, "no message"],
    [{ type: "something-else", event }, "unknown type"],
  ];

  it.each(malformed)("ignores a malformed message (%s)", async (msg) => {
    const { notified } = await relay(msg);
    expect(notified).toEqual([]);
    expect(broadcastScanEvent).not.toHaveBeenCalled();
  });
});

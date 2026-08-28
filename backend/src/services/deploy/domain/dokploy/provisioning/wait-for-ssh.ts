/**
 * SSH Reachability Poll
 *
 * Polls a TCP connect to host:port until it succeeds or a timeout elapses.
 * Used after launching a VPS to confirm the OS is up and accepting SSH
 * before we ask Dokploy to run `server.setup` (which SSHes into the box).
 */

import { Socket } from "node:net";

export interface WaitForSshOptions {
  /** Total time to keep polling before giving up. Default 3 minutes. */
  timeoutMs?: number;
  /** Delay between attempts. Default 5 seconds. */
  intervalMs?: number;
  /** Per-attempt connect timeout. Default 5 seconds. */
  connectTimeoutMs?: number;
  /** Optional progress callback (e.g. deploy log). */
  onAttempt?: (attempt: number, elapsedMs: number) => void;
}

/**
 * Attempt a single TCP connection. Resolves true if connectable, false otherwise.
 */
function tryConnect(host: string, port: number, connectTimeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(connectTimeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Poll until `host:port` accepts a TCP connection.
 *
 * @returns true if the port became reachable within the timeout, false otherwise.
 */
export async function waitForSsh(
  host: string,
  port = 22,
  options: WaitForSshOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const connectTimeoutMs = options.connectTimeoutMs ?? 5_000;

  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < timeoutMs) {
    attempt += 1;
    options.onAttempt?.(attempt, Date.now() - start);

    if (await tryConnect(host, port, connectTimeoutMs)) {
      return true;
    }

    // Don't oversleep past the deadline.
    const remaining = timeoutMs - (Date.now() - start);
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

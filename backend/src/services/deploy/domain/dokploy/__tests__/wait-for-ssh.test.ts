/**
 * Tests for waitForSsh — the TCP reachability poller used before handing a
 * freshly launched VPS to Dokploy's server setup. Uses real ephemeral TCP
 * servers on 127.0.0.1 so we exercise the actual socket logic.
 */

import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import { waitForSsh } from "../provisioning/wait-for-ssh.js";

/** Start a TCP server on an ephemeral port and resolve with the port + server. */
function startServer(): Promise<{ port: number; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.end());
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve({ port: addr.port, server });
      else reject(new Error("no address"));
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("waitForSsh", () => {
  it("returns true immediately when the port is already open", async () => {
    const { port, server } = await startServer();
    try {
      const ok = await waitForSsh("127.0.0.1", port, { timeoutMs: 2000, intervalMs: 100 });
      expect(ok).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it("returns false when nothing is listening (times out)", async () => {
    // Port 1 is privileged and won't accept connections in the test env.
    const ok = await waitForSsh("127.0.0.1", 1, {
      timeoutMs: 600,
      intervalMs: 150,
      connectTimeoutMs: 150,
    });
    expect(ok).toBe(false);
  });

  it("becomes true once the server starts accepting mid-poll", async () => {
    const { port, server } = await startServer();
    // Close it so the first attempts fail, then reopen the same port shortly after.
    await closeServer(server);

    let reopened: Server | null = null;
    const reopen = setTimeout(() => {
      const s = createServer((socket) => socket.end());
      s.listen(port, "127.0.0.1");
      reopened = s;
    }, 250);

    try {
      const ok = await waitForSsh("127.0.0.1", port, {
        timeoutMs: 3000,
        intervalMs: 150,
        connectTimeoutMs: 150,
      });
      expect(ok).toBe(true);
    } finally {
      clearTimeout(reopen);
      if (reopened) await closeServer(reopened);
    }
  });

  it("invokes the onAttempt callback while polling", async () => {
    const attempts: number[] = [];
    await waitForSsh("127.0.0.1", 1, {
      timeoutMs: 500,
      intervalMs: 150,
      connectTimeoutMs: 150,
      onAttempt: (attempt) => attempts.push(attempt),
    });
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0]).toBe(1);
  });
});

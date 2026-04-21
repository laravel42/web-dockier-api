import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocketManager } from "./ws-manager.js";
import { RingBuffer } from "./ring-buffer.js";
import type { LogEntry } from "@observability/types";

/**
 * Unit tests for WebSocketManager — validates Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

/** Helper: create a minimal LogEntry for testing. */
function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "info",
    source: "proxy",
    group: "default",
    message: "test log",
    ...overrides,
  };
}

/** Helper: create a mock WebSocket-like object. */
function createMockSocket(readyState = 1) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState,
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    /** Emit an event on this mock socket. */
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners[event] ?? []) {
        handler(...args);
      }
    },
  };
}

describe("WebSocketManager", () => {
  let buffer: RingBuffer<LogEntry>;
  let manager: WebSocketManager;

  beforeEach(() => {
    buffer = new RingBuffer<LogEntry>(10_000);
    manager = new WebSocketManager(buffer);
  });

  describe("broadcast (Requirement 5.3)", () => {
    it("sends a log message to all OPEN clients", () => {
      const sock1 = createMockSocket(1); // OPEN
      const sock2 = createMockSocket(1); // OPEN

      // Simulate connections by accessing private clients set
      // We use broadcast directly since handleConnection is private
      (manager as unknown as { clients: Set<unknown> }).clients.add(sock1);
      (manager as unknown as { clients: Set<unknown> }).clients.add(sock2);

      const entry = makeEntry({ message: "hello" });
      manager.broadcast(entry);

      const expected = JSON.stringify({ type: "log", payload: entry });
      expect(sock1.send).toHaveBeenCalledWith(expected);
      expect(sock2.send).toHaveBeenCalledWith(expected);
    });

    it("skips clients that are not in OPEN state", () => {
      const openSock = createMockSocket(1); // OPEN
      const closingSock = createMockSocket(2); // CLOSING
      const closedSock = createMockSocket(3); // CLOSED

      const clients = (manager as unknown as { clients: Set<unknown> }).clients;
      clients.add(openSock);
      clients.add(closingSock);
      clients.add(closedSock);

      const entry = makeEntry();
      manager.broadcast(entry);

      expect(openSock.send).toHaveBeenCalledTimes(1);
      expect(closingSock.send).not.toHaveBeenCalled();
      expect(closedSock.send).not.toHaveBeenCalled();
    });

    it("does nothing when no clients are connected", () => {
      // Should not throw
      const entry = makeEntry();
      expect(() => manager.broadcast(entry)).not.toThrow();
    });
  });

  describe("getConnectedClients", () => {
    it("returns 0 when no clients are connected", () => {
      expect(manager.getConnectedClients()).toBe(0);
    });

    it("returns the number of connected clients", () => {
      const clients = (manager as unknown as { clients: Set<unknown> }).clients;
      clients.add(createMockSocket());
      clients.add(createMockSocket());
      expect(manager.getConnectedClients()).toBe(2);
    });
  });

  describe("handleConnection (Requirements 5.2, 5.4, 5.5, 5.6)", () => {
    it("sends batch of last 200 entries on connection", () => {
      // Fill buffer with 250 entries
      for (let i = 0; i < 250; i++) {
        buffer.push(makeEntry({ message: `entry-${i}` }));
      }

      const socket = createMockSocket();
      // Call private handleConnection
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(socket);

      // First call to send should be the batch message
      expect(socket.send).toHaveBeenCalledTimes(1);
      const batchMsg = JSON.parse(socket.send.mock.calls[0][0] as string);
      expect(batchMsg.type).toBe("batch");
      expect(batchMsg.payload).toHaveLength(200);
    });

    it("sends empty batch when buffer is empty", () => {
      const socket = createMockSocket();
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(socket);

      const batchMsg = JSON.parse(socket.send.mock.calls[0][0] as string);
      expect(batchMsg.type).toBe("batch");
      expect(batchMsg.payload).toHaveLength(0);
    });

    it("adds client to connection set", () => {
      const socket = createMockSocket();
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(socket);
      expect(manager.getConnectedClients()).toBe(1);
    });

    it("removes client on close (Requirement 5.4)", () => {
      const socket = createMockSocket();
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(socket);
      expect(manager.getConnectedClients()).toBe(1);

      // Trigger close event
      socket.emit("close");
      expect(manager.getConnectedClients()).toBe(0);
    });

    it("parses incoming SDK messages and broadcasts (Requirement 5.5)", () => {
      const socket = createMockSocket();
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(socket);

      // Add a second client to verify broadcast
      const otherSocket = createMockSocket();
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(otherSocket);

      const sdkEntry = makeEntry({ source: "frontend", message: "sdk log" });
      const sdkMessage = JSON.stringify(sdkEntry);

      // Simulate incoming message on first socket
      socket.emit("message", sdkMessage);

      // Entry should be pushed to buffer
      expect(buffer.size).toBe(1);
      expect(buffer.toArray()[0].message).toBe("sdk log");

      // Both sockets should receive the broadcast (log message)
      // socket.send: 1 batch + 1 broadcast = at least 2 calls after the message event
      // otherSocket.send: 1 batch + 1 broadcast = at least 2 calls
      const socketLogCalls = socket.send.mock.calls
        .map((c: unknown[]) => JSON.parse(c[0] as string))
        .filter((m: { type: string }) => m.type === "log");
      expect(socketLogCalls).toHaveLength(1);
      expect(socketLogCalls[0].payload.message).toBe("sdk log");
    });

    it("silently ignores invalid JSON messages (Requirement 5.6)", () => {
      const socket = createMockSocket();
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(socket);

      const initialSize = buffer.size;

      // Send invalid JSON — should not throw or crash
      expect(() => socket.emit("message", "not valid json {{{")).not.toThrow();
      expect(buffer.size).toBe(initialSize);
    });

    it("silently ignores non-string data that cannot be parsed", () => {
      const socket = createMockSocket();
      (manager as unknown as { handleConnection: (s: unknown) => void }).handleConnection(socket);

      // Send a Buffer with invalid JSON
      const buf = Buffer.from("invalid json");
      expect(() => socket.emit("message", buf)).not.toThrow();
      expect(buffer.size).toBe(0);
    });
  });
});

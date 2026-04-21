import type { FastifyInstance } from "fastify";
import type { LogEntry, WebSocketMessage } from "@observability/types";
import fastifyWebsocket from "@fastify/websocket";
import type { WebSocket } from "@fastify/websocket";
import { RingBuffer } from "./ring-buffer.js";

/**
 * Manages WebSocket connections at the `/logs` endpoint.
 *
 * - Sends the last 200 log entries as a batch to newly connected clients.
 * - Broadcasts each new LogEntry to all clients with OPEN readyState.
 * - Accepts incoming SDK messages, pushes them to the RingBuffer, and re-broadcasts.
 * - Silently ignores messages that cannot be parsed as valid JSON.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export class WebSocketManager {
  private clients: Set<WebSocket> = new Set();
  private buffer: RingBuffer<LogEntry>;

  constructor(buffer: RingBuffer<LogEntry>) {
    this.buffer = buffer;
  }

  /**
   * Register the @fastify/websocket plugin and set up the `/logs` route.
   */
  async initialize(server: FastifyInstance): Promise<void> {
    await server.register(fastifyWebsocket);

    server.get("/logs", { websocket: true }, (socket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: WebSocket): void {
    this.clients.add(socket);

    // Send recent history as a batch
    const recentLogs = this.buffer.getRecent(200);
    const batchMessage: WebSocketMessage = {
      type: "batch",
      payload: recentLogs,
    };
    socket.send(JSON.stringify(batchMessage));

    // Handle incoming messages (from SDK clients)
    socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const raw = typeof data === "string" ? data : data.toString();
        const entry: LogEntry = JSON.parse(raw);
        this.buffer.push(entry);
        this.broadcast(entry);
      } catch {
        // Invalid message — silently ignore
      }
    });

    socket.on("close", () => {
      this.clients.delete(socket);
    });
  }

  /**
   * Broadcast a LogEntry to all connected clients with OPEN readyState.
   */
  broadcast(entry: LogEntry): void {
    const message = JSON.stringify({ type: "log", payload: entry });

    for (const client of this.clients) {
      // readyState 1 === OPEN
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  /**
   * Return the number of currently connected clients.
   */
  getConnectedClients(): number {
    return this.clients.size;
  }
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import type { LogEntry } from "@observability/types";
import { createProxyHandler } from "./proxy-handler.js";
import { createKiroContextHandler } from "./kiro-context.js";
import { RingBuffer } from "./ring-buffer.js";
import { WebSocketManager } from "./ws-manager.js";

const TARGET_URL = process.env.TARGET_URL ?? "http://localhost:4000";
const PORT = Number(process.env.PORT ?? 3000);

const server = Fastify({ logger: true });

// Ring buffer for storing the last 10,000 log entries
const buffer = new RingBuffer<LogEntry>(10_000);

// WebSocket manager for real-time log streaming
const wsManager = new WebSocketManager(buffer);

// Register CORS for dashboard cross-origin access
await server.register(cors);

// Register WebSocket plugin and /logs route BEFORE catch-all proxy routes
await wsManager.initialize(server);

// Kiro context export endpoint — must be registered BEFORE catch-all proxy routes
server.post("/api/kiro-context", createKiroContextHandler());

// Catch-all proxy route — forwards all requests to TARGET_URL
// Register individual methods to avoid conflict with @fastify/cors OPTIONS handler
// HEAD is auto-registered by Fastify for GET routes, so we skip it
const proxyHandler = createProxyHandler(TARGET_URL, {
  onLogEntry: (entry: LogEntry) => {
    buffer.push(entry);
    wsManager.broadcast(entry);
  },
});
const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
for (const method of methods) {
  server.route({ method, url: "/*", handler: proxyHandler });
}

server.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Proxy listening on :${PORT} → ${TARGET_URL}`);
});

export { server, TARGET_URL, PORT, buffer, wsManager };

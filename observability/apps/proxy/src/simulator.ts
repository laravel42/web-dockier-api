/**
 * Service Log Simulator
 *
 * Standalone process that emits simulated service log entries at configurable
 * intervals and pipes them to the proxy server via WebSocket.
 *
 * Usage:
 *   pnpm --filter @observability/proxy simulate
 *   INTERVAL_MS=500 WS_URL=ws://localhost:3000/logs pnpm simulate
 *
 * Environment variables:
 *   INTERVAL_MS  – Emission interval in milliseconds (default: 2000)
 *   WS_URL       – Proxy WebSocket URL (default: ws://localhost:3000/logs)
 *
 * Validates: Requirements 11.1, 11.2
 */

import { createLogEntry } from "@observability/types";
import type { LogLevel } from "@observability/types";

const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 2000);
const WS_URL = process.env.WS_URL ?? "ws://localhost:3000/logs";

// ---------------------------------------------------------------------------
// Randomisation helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Simulated data pools
// ---------------------------------------------------------------------------

const LOG_LEVELS: readonly LogLevel[] = ["info", "warn", "error", "debug"];

const ENDPOINTS = [
  "/api/users",
  "/api/users/:id",
  "/api/projects",
  "/api/projects/:id/badges",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/health",
  "/api/analytics/events",
  "/api/notifications",
  "/api/settings",
] as const;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

interface MessageTemplate {
  level: LogLevel;
  message: string;
  group: string;
}

const MESSAGE_TEMPLATES: readonly MessageTemplate[] = [
  { level: "info", message: "Database query completed", group: "database" },
  { level: "debug", message: "Cache hit for session lookup", group: "cache" },
  { level: "warn", message: "Cache miss — falling back to database", group: "cache" },
  { level: "info", message: "Queue job processed successfully", group: "queue" },
  { level: "error", message: "Queue job failed after 3 retries", group: "queue" },
  { level: "info", message: "Background task completed", group: "scheduler" },
  { level: "warn", message: "Rate limit threshold approaching", group: "rate-limiter" },
  { level: "error", message: "Connection pool exhausted", group: "database" },
  { level: "debug", message: "WebSocket heartbeat sent", group: "websocket" },
  { level: "info", message: "Email notification dispatched", group: "notifications" },
  { level: "warn", message: "Slow query detected (>500ms)", group: "database" },
  { level: "error", message: "External API returned 503", group: "integrations" },
  { level: "info", message: "User session created", group: "auth" },
  { level: "debug", message: "JWT token validated", group: "auth" },
  { level: "info", message: "File upload processed", group: "storage" },
  { level: "warn", message: "Disk usage above 80%", group: "storage" },
] as const;

const STATUS_CODES = [200, 201, 204, 301, 400, 401, 403, 404, 500, 502, 503];

// ---------------------------------------------------------------------------
// Log entry generator
// ---------------------------------------------------------------------------

function generateLogEntry() {
  const template = pick(MESSAGE_TEMPLATES);
  const endpoint = pick(ENDPOINTS);
  const method = pick(METHODS);
  const status = pick(STATUS_CODES);
  const duration = randomInt(1, 1200);

  return createLogEntry({
    type: template.level,
    source: "service",
    group: template.group,
    message: template.message,
    method,
    endpoint,
    status,
    duration,
    payloadSize: randomInt(0, 8192),
  });
}

// ---------------------------------------------------------------------------
// WebSocket connection with reconnection
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let emitTimer: ReturnType<typeof setInterval> | null = null;

function connect(): void {
  console.log(`[simulator] Connecting to ${WS_URL} …`);

  ws = new WebSocket(WS_URL);

  ws.addEventListener("open", () => {
    console.log(`[simulator] Connected. Emitting every ${INTERVAL_MS}ms`);
    startEmitting();
  });

  ws.addEventListener("close", () => {
    console.log("[simulator] Disconnected from proxy");
    stopEmitting();
    scheduleReconnect();
  });

  ws.addEventListener("error", (event) => {
    // The error event fires before close; just log it.
    console.error("[simulator] WebSocket error:", (event as ErrorEvent).message ?? "unknown");
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = 3000;
  console.log(`[simulator] Reconnecting in ${delay}ms …`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

// ---------------------------------------------------------------------------
// Emission loop
// ---------------------------------------------------------------------------

function startEmitting(): void {
  if (emitTimer) return;

  emitTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const entry = generateLogEntry();
    ws.send(JSON.stringify(entry));
    console.log(
      `[simulator] ${entry.type.toUpperCase().padEnd(5)} | ${entry.group.padEnd(14)} | ${entry.message}`,
    );
  }, INTERVAL_MS);
}

function stopEmitting(): void {
  if (emitTimer) {
    clearInterval(emitTimer);
    emitTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(): void {
  console.log("\n[simulator] Shutting down …");
  stopEmitting();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log("[simulator] Service Log Simulator starting");
console.log(`[simulator] Target: ${WS_URL}`);
console.log(`[simulator] Interval: ${INTERVAL_MS}ms`);
connect();

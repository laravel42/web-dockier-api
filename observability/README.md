# Observability Proxy System

Real-time development observability tool for full-stack TypeScript applications. Intercepts HTTP traffic via a reverse proxy, streams structured log entries over WebSocket, and renders them in a React dashboard with filtering, grouping, and export capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     pnpm Monorepo (./observability)             │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │  apps/proxy           │    │  apps/web                    │   │
│  │  Fastify :3000        │◄───│  Vite + React :5173          │   │
│  │  - Reverse proxy      │ WS │  - Real-time log viewer      │   │
│  │  - WebSocket server   │    │  - Filters & grouping        │   │
│  │  - Ring buffer (10k)  │    │  - Monaco detail view        │   │
│  │  - Kiro context API   │    │  - Send to Kiro              │   │
│  └──────┬───────────────┘    └──────────────────────────────┘   │
│         │                                                       │
│  ┌──────┴───────────────┐    ┌──────────────────────────────┐   │
│  │  packages/types       │    │  packages/sdk                │   │
│  │  - LogEntry schema    │    │  - fetch/XHR wrappers        │   │
│  │  - createLogEntry()   │    │  - Auto-instrumentation      │   │
│  │  - Shared types       │    │  - Self-logging prevention   │   │
│  └──────────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Log Sources:
  [Proxy Interceptor] ──┐
  [Frontend SDK]     ───┼──► Ring Buffer ──► WebSocket ──► Dashboard
  [Service Simulator]───┘
```

## Quick Start

```bash
# 1. Install dependencies
cd observability
pnpm install

# 2. Start the proxy server and dashboard
pnpm dev

# 3. (Optional) Start the service log simulator in another terminal
pnpm simulate
```

The proxy runs on `http://localhost:3000` and the dashboard on `http://localhost:5173`.

### Proxying Your Backend

Set the `TARGET_URL` environment variable to point at your backend:

```bash
TARGET_URL=http://localhost:4000 pnpm dev
```

All HTTP requests to `http://localhost:3000/*` are forwarded to your backend, and the request/response metadata appears in the dashboard.

## Available Scripts

| Script           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `pnpm dev`       | Start proxy + dashboard concurrently                 |
| `pnpm build`     | Build all packages (types → sdk → proxy → web)       |
| `pnpm test`      | Run all unit and property-based tests                |
| `pnpm test:watch`| Run tests in watch mode                              |
| `pnpm simulate`  | Start the service log simulator                      |

## Packages

### `apps/proxy` — Reverse Proxy Server

Fastify-based reverse proxy that intercepts HTTP traffic, captures request/response metadata, and broadcasts structured log entries via WebSocket.

- Catch-all proxy forwarding to `TARGET_URL`
- Header sanitization (redacts `authorization`, `cookie`, etc.)
- Payload truncation for bodies exceeding 50KB
- Ring buffer storing the last 10,000 log entries
- WebSocket server at `/logs` for real-time streaming
- `POST /api/kiro-context` endpoint for exporting logs to Kiro

### `apps/web` — React Dashboard

Real-time log visualization dashboard built with Vite, React, TailwindCSS, and Monaco Editor.

- WebSocket client with exponential backoff reconnection
- Virtualized log list for high-performance rendering
- Filters: type (log level), source, endpoint, text search
- Collapsible log grouping by `group` field
- Pause/resume/clear controls with auto-scroll
- JSON export of filtered logs
- Multi-select logs and send to Kiro context
- Toast notifications for user feedback
- Connection status indicator

### `packages/types` — Shared Types

Single source of truth for all shared type definitions.

- `LogEntry` interface with required and optional fields
- `LogLevel` and `LogSource` union types
- `FilterState`, `WebSocketMessage`, `KiroContextPayload` interfaces
- `createLogEntry()` factory function with auto-generated UUID and timestamp

### `packages/sdk` — Frontend SDK

Browser instrumentation library that captures frontend network activity.

- Wraps `globalThis.fetch` and `XMLHttpRequest`
- Creates log entries with `source: "frontend"` for each network call
- Self-logging prevention via `X-Observability-SDK` header
- `initLogger()` / `destroy()` lifecycle
- Sends logs to proxy via WebSocket

## Log Sources

| Source       | Description                                    |
| ------------ | ---------------------------------------------- |
| `proxy`      | HTTP requests intercepted by the reverse proxy |
| `frontend`   | Network calls captured by the browser SDK      |
| `service`    | Simulated backend service logs                 |

## Kiro Context Export

Select one or more log entries in the dashboard, then click **Send to Kiro** in the toolbar. The selected entries are written as a JSON snapshot to `.kiro/context/log-snapshot-{timestamp}.json`. Kiro automatically picks up files in this directory for AI-assisted debugging.

## Environment Variables

| Variable       | Default                        | Description                    |
| -------------- | ------------------------------ | ------------------------------ |
| `TARGET_URL`   | `http://localhost:4000`        | Backend URL to proxy to        |
| `PORT`         | `3000`                         | Proxy server port              |
| `INTERVAL_MS`  | `2000`                         | Simulator emission interval    |
| `WS_URL`       | `ws://localhost:3000/logs`     | Simulator WebSocket target     |

## Testing

The project uses Vitest with fast-check for property-based testing:

```bash
pnpm test          # Run all tests once
pnpm test:watch    # Run tests in watch mode
```

Test coverage includes:
- **Unit tests**: Ring buffer, header sanitization, payload utilities, proxy handler, WebSocket manager, filter engine, log grouping, JSON export, Kiro context endpoint, frontend SDK
- **Property-based tests**: Ring buffer capacity/ordering, header sanitization safety, payload truncation bounds, payload size calculation, filter correctness/identity/purity, log store capacity, createLogEntry factory, SDK self-logging prevention, Kiro context export integrity/uniqueness, log entry completeness

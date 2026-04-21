You are an expert full-stack engineer. Execute the following pipeline EXACTLY in order.  
Do NOT skip steps. Do NOT merge steps.  
After each step, ensure the output is correct before proceeding.

---

# 🧠 PIPELINE: Observability Proxy System

---

## STEP 1 — Monorepo Setup

Create a pnpm monorepo:

/apps
  /proxy
  /web
/packages
  /types
  /sdk

Requirements:
- TypeScript everywhere
- pnpm workspaces
- ESLint + Prettier
- Root scripts:
  - dev → run all apps concurrently
  - build

STOP after creating structure and configs.

---

## STEP 2 — Proxy Server (HTTP Interception)

Inside /apps/proxy:

- Use Fastify
- Run on port 3000
- Add configurable TARGET_URL
- Intercept ALL requests
- Capture:
  - method, url, query, headers (sanitize auth), body, payload size
- Capture response:
  - status, response body, size, duration

Return proxied response normally.

DO NOT implement WebSockets yet.

STOP after working proxy.

---

## STEP 3 — Shared Log Schema

Inside /packages/types:

Create:

type LogLevel = "log" | "info" | "debug" | "warn" | "error";

interface LogEntry {
  id: string;
  timestamp: number;
  type: LogLevel;
  source: "proxy" | "frontend" | "service";
  group: string;
  message: string;

  method?: string;
  endpoint?: string;
  query?: object;
  body?: any;
  response?: any;

  status?: number;
  duration?: number;
  payloadSize?: number;

  error?: string;
}

Also create:
- createLogEntry()

Refactor proxy to use this schema.

STOP after integration.

---

## STEP 4 — WebSocket Streaming

In proxy:

- Add WebSocket server at /logs
- Broadcast every LogEntry
- Keep buffer (max 10k logs)
- Send last 200 logs on new connection

STOP after working stream.

---

## STEP 5 — React App Setup

Inside /apps/web:

- Vite + React + TypeScript
- Install TailwindCSS
- Install shadcn/ui

Create layout:
- Sidebar
- Topbar
- Main panel

STOP after UI skeleton.

---

## STEP 6 — WebSocket Client

In frontend:

- Connect to ws://localhost:3000/logs
- Store logs (max 10k)
- Real-time updates

Controls:
- pause/resume
- clear logs

STOP after working connection.

---

## STEP 7 — Log Viewer

- Use Monaco Editor (or similar)
- Display logs as JSON
- Syntax highlighting
- Auto-scroll toggle

Each log shows:
- type (color)
- timestamp
- duration
- group

Optimize rendering (virtualized list)

STOP after working viewer.

---

## STEP 8 — Filters

Add filtering:

- type
- source
- endpoint
- text search

UI in sidebar using shadcn components.

STOP after filters work.

---

## STEP 9 — Frontend SDK

Inside /packages/sdk:

- Wrap fetch + XMLHttpRequest
- Capture request/response/errors
- Capture duration
- Hook into React renders (mount/update)

Send logs via WebSocket (fallback HTTP)

Expose:
initLogger()

STOP after SDK is complete.

---

## STEP 10 — SDK Integration

- Initialize SDK in React app
- Ensure logs appear in UI

STOP after verified.

---

## STEP 11 — Service Logs (Encore Simulation)

- Create Node process emitting logs
- Pipe into proxy
- Normalize to LogEntry
- source = "service"

STOP after logs visible.

---

## STEP 12 — UX Enhancements

Add:
- Export logs JSON
- Clear logs
- Highlight errors
- Group logs (collapsible)
- Duration badges
- Truncate payloads >50kb

STOP after polish.

---

## STEP 13 — Final Integration

Verify:
- Proxy intercepts traffic
- Frontend logs captured
- Service logs captured
- UI updates live

Provide:
- Run instructions (pnpm dev)
- Example usage

---

# ⚠️ RULES

- Do NOT skip steps
- Do NOT refactor previous steps unless necessary
- Keep code modular and clean
- Use TypeScript everywhere
- Avoid unnecessary dependencies

---

# ✅ OUTPUT FORMAT

At each step:
- Show file structure changes
- Show full code for new/modified files
- Brief explanation

At final step:
- Provide full run instructions

BEGIN.
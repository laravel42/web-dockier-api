# Implementation Plan: Observability Proxy System

## Overview

Implement a real-time development observability tool as a pnpm monorepo with four packages: a Fastify reverse proxy (`apps/proxy`), a React dashboard (`apps/web`), shared types (`packages/types`), and a frontend SDK (`packages/sdk`). The implementation follows a strict 13-step pipeline with validation gates at each step. All code lives inside the `./observability/` directory and uses TypeScript throughout.

## Tasks

- [x] 1. Monorepo Setup
  - [x] 1.1 Create pnpm workspace structure with `apps/proxy`, `apps/web`, `packages/types`, and `packages/sdk` directories inside `./observability/`
    - Create root `pnpm-workspace.yaml` with workspace package globs
    - Create root `package.json` with `dev` (concurrently) and `build` scripts
    - Create root `tsconfig.json` base config with strict mode
    - Create per-package `package.json` and `tsconfig.json` files
    - Install TypeScript, ESLint, Prettier, Vitest, fast-check, and concurrently as root dev dependencies
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 2. Shared Log Schema (`packages/types`)
  - [x] 2.1 Define core types and LogEntry interface
    - Create `LogLevel` type: `"log" | "info" | "debug" | "warn" | "error"`
    - Create `LogSource` type: `"proxy" | "frontend" | "service"`
    - Create `LogEntry` interface with required fields (`id`, `timestamp`, `type`, `source`, `group`, `message`) and optional HTTP/metric fields (`method`, `endpoint`, `query`, `body`, `response`, `status`, `duration`, `payloadSize`, `error`)
    - Create `WebSocketMessage` type union (`log`, `batch`, `clear`)
    - Create `FilterState` interface
    - Create `KiroContextPayload` interface with entries and metadata
    - _Requirements: 3.1, 3.2_

  - [x] 2.2 Implement `createLogEntry()` factory function
    - Auto-generate UUID v4 `id` via `crypto.randomUUID()`
    - Set `timestamp` to `Date.now()`
    - Default `group` to `"default"`
    - Allow all fields to be overridden via partial input
    - _Requirements: 3.3, 3.4_

  - [x] 2.3 Write property test for `createLogEntry()`
    - **Property 10: createLogEntry Factory Correctness**
    - **Validates: Requirements 3.3, 3.4**

- [x] 3. Proxy Server — HTTP Interception (`apps/proxy`)
  - [x] 3.1 Set up Fastify server with CORS and proxy handler
    - Create Fastify instance on configurable port (default 3000)
    - Configure `TARGET_URL` from environment variable
    - Register `@fastify/cors` for dashboard cross-origin access
    - Implement catch-all route that forwards requests to `TARGET_URL` with same method, headers, and body
    - Return proxied response with same status code, headers, and body
    - _Requirements: 1.1, 1.2_

  - [x] 3.2 Implement header sanitization
    - Create `sanitizeHeaders()` function that redacts `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, `proxy-authorization` with `"[REDACTED]"`
    - Perform case-insensitive header name matching
    - Join array header values with `", "`
    - Omit headers with undefined values
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Write property test for header sanitization
    - **Property 6: Header Sanitization Safety**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 3.4 Implement payload size calculation and truncation
    - Create `calculatePayloadSize()` using `TextEncoder` for UTF-8 byte length
    - Return 0 for null/undefined bodies
    - Create `truncatePayload()` that truncates serialized payloads exceeding 50,000 bytes with a truncation indicator
    - Pass through null/undefined unchanged
    - _Requirements: 9.1, 9.2, 9.3, 14.1, 14.2, 14.3_

  - [x] 3.5 Write property tests for payload utilities
    - **Property 7: Payload Truncation Bound**
    - **Property 13: Payload Size Calculation**
    - **Validates: Requirements 9.1, 9.2, 9.3, 14.1, 14.2, 14.3**

  - [x] 3.6 Implement request/response capture and LogEntry creation
    - Capture method, URL, query, sanitized headers, body, and payload size from requests
    - Capture status code, response body, size, and duration from responses
    - Create LogEntry with `source: "proxy"` for each request/response cycle
    - Return HTTP 502 and broadcast error LogEntry when target is unreachable
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [x] 3.7 Write property test for log entry completeness
    - **Property 14: Log Entry Completeness**
    - **Validates: Requirements 1.3, 1.4, 1.5**

- [x] 4. Ring Buffer Implementation
  - [x] 4.1 Implement `RingBuffer<T>` class in `apps/proxy`
    - Configurable capacity defaulting to 10,000
    - `push()` adds entry; evicts oldest when at capacity
    - `getRecent(n)` returns `min(n, size)` entries in insertion order (oldest first)
    - `clear()` removes all entries and resets size to zero
    - `size` property always ≤ capacity
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.2 Write property tests for Ring Buffer
    - **Property 1: Ring Buffer Capacity Invariant**
    - **Property 2: Ring Buffer Ordering**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 5. Checkpoint — Verify proxy and shared types
  - Ensure all tests pass, ask the user if questions arise.
  - Validate: `pnpm install` succeeds, TypeScript compiles, proxy forwards requests correctly, ring buffer works

- [x] 6. WebSocket Streaming
  - [x] 6.1 Implement `WebSocketManager` in `apps/proxy`
    - Register `@fastify/websocket` and accept connections at `/logs` endpoint
    - On new client connection, send batch message with last 200 entries from Ring_Buffer
    - Broadcast each new LogEntry as `{type: "log", payload: entry}` to all clients with OPEN readyState
    - Remove clients from connection set on disconnect
    - Parse incoming SDK messages as LogEntry, push to Ring_Buffer, and broadcast
    - Silently ignore messages that cannot be parsed as valid JSON
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 6.2 Wire WebSocket manager into proxy server
    - Initialize WebSocketManager with the Ring_Buffer instance
    - Broadcast log entries from the proxy handler through the WebSocket manager
    - _Requirements: 1.5, 5.3_

- [x] 7. React App Setup (`apps/web`)
  - [x] 7.1 Scaffold Vite + React + TypeScript application
    - Initialize Vite project with React and TypeScript template
    - Install and configure TailwindCSS
    - Install and configure shadcn/ui component library
    - Create layout skeleton: sidebar, topbar, main panel
    - _Requirements: 16.1, 16.3_

- [x] 8. WebSocket Client and Log Store
  - [x] 8.1 Implement `useLogStream` hook
    - Connect to `ws://localhost:3000/logs`
    - Populate Log_Store with initial batch on connection
    - Append new log entries on `type: "log"` messages
    - Trim oldest entries when Log_Store exceeds 10,000
    - _Requirements: 6.1, 6.2, 6.5_

  - [x] 8.2 Write property test for frontend log store capacity
    - **Property 9: Frontend Log Store Capacity**
    - **Validates: Requirement 6.5**

  - [x] 8.3 Implement dashboard controls (pause, resume, clear, auto-scroll)
    - Pause: stop appending new entries to visible list, buffer incoming entries
    - Resume: flush buffered entries to Log_Store, resume real-time updates
    - Clear: remove all entries from Log_Store and buffer
    - Auto-scroll: scroll to most recent entry as new entries arrive
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.4 Implement WebSocket reconnection with exponential backoff
    - Attempt reconnection at 1s, 2s, 4s, up to 30s maximum
    - Receive last 200 log entries on reconnect
    - Display connection status indicator while disconnected
    - _Requirements: 15.1, 15.2, 15.3_

- [x] 9. Log Viewer
  - [x] 9.1 Implement virtualized log list and Monaco detail view
    - Render log entries in a virtualized list using `@tanstack/react-virtual`
    - Display type (color-coded), timestamp, duration, and group for each entry
    - On entry selection, display full detail in Monaco Editor with JSON syntax highlighting
    - Implement auto-scroll toggle
    - _Requirements: 6.3, 6.4_

- [x] 10. Log Filtering
  - [x] 10.1 Implement `filterLogs()` pure function
    - Filter by `type` (exact match to LogLevel)
    - Filter by `source` (exact match to LogSource)
    - Filter by `endpoint` (case-insensitive substring match)
    - Filter by `text` (case-insensitive search across message, endpoint, error, group)
    - Apply AND logic when multiple filters are active
    - Return complete array when all filters are empty/null
    - Return new array without mutating input
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 10.2 Write property tests for filter engine
    - **Property 3: Filter Correctness (AND Logic Subset)**
    - **Property 4: Filter Identity**
    - **Property 5: Filter Purity**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**

  - [x] 10.3 Build filter UI in sidebar using shadcn components
    - Add type dropdown (LogLevel options)
    - Add source dropdown (LogSource options)
    - Add endpoint text input
    - Add text search input
    - Wire filters to `filterLogs()` with `useMemo` for performance
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 11. Checkpoint — Verify dashboard core functionality
  - Ensure all tests pass, ask the user if questions arise.
  - Validate: dashboard connects to proxy, logs stream in real-time, filters work, pause/resume/clear work, virtualized list performs well

- [x] 12. Frontend SDK (`packages/sdk`)
  - [x] 12.1 Implement `initLogger()` and fetch/XHR wrappers
    - Wrap `globalThis.fetch` to intercept all fetch calls
    - Wrap `XMLHttpRequest` to intercept all XHR calls
    - Create LogEntry with `source: "frontend"`, method, URL, status, and duration on completion
    - Create error LogEntry with error message and duration on network failure
    - Skip logging requests marked with `X-Observability-SDK` header to prevent infinite loops
    - Send log entries to proxy via WebSocket (HTTP fallback)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 12.2 Write property test for SDK self-logging prevention
    - **Property 8: SDK Self-Logging Prevention**
    - **Validates: Requirement 10.5**

  - [x] 12.3 Implement `destroy()` to restore original functions
    - Restore original `fetch` and `XMLHttpRequest` on destroy
    - _Requirements: 10.6_

- [x] 13. SDK Integration
  - [x] 13.1 Initialize SDK in React app and verify logs appear
    - Call `initLogger()` in `apps/web/src/main.tsx` before React renders
    - Configure WebSocket URL to `ws://localhost:3000/logs`
    - Verify frontend network calls appear in the dashboard with `source: "frontend"`
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 14. Service Log Simulation
  - [x] 14.1 Create service log simulator process
    - Build a Node.js script that emits log entries with `source: "service"` at configurable intervals
    - Pipe logs to the proxy server via WebSocket
    - Normalize emitted logs to the LogEntry schema
    - _Requirements: 11.1, 11.2_

- [x] 15. UX Enhancements
  - [x] 15.1 Implement JSON export, grouping, error highlighting, duration badges, and payload truncation display
    - Export: serialize current filtered log entries as JSON and trigger browser download
    - Grouping: display entries with same `group` value as collapsible groups
    - Error highlighting: visually highlight entries with `type: "error"` using distinct styling
    - Duration badges: display duration value in milliseconds as a badge
    - Payload truncation display: show truncated preview with expand option for large bodies
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 16. Kiro Context Export
  - [x] 16.1 Implement `POST /api/kiro-context` endpoint in proxy
    - Validate payload: return 400 if entries array is empty
    - Validate payload: return 400 if entries exceed max limit (default 100)
    - Validate metadata.count equals entries.length
    - Truncate description to 500 characters if provided
    - Ensure `.kiro/context/` directory exists (create if missing)
    - Write `log-snapshot-{timestamp}.json` file with entries and metadata
    - Return 500 with descriptive error if file write fails
    - _Requirements: 13.3, 13.4, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11_

  - [x] 16.2 Write property tests for Kiro context export
    - **Property 11: Kiro Context Export Integrity**
    - **Property 12: Kiro Context Export Uniqueness**
    - **Validates: Requirements 13.3, 13.9, 13.10, 13.11**

  - [x] 16.3 Implement "Send to Kiro" UI in dashboard
    - Add multi-selection support (checkbox per log row, shift-click for range)
    - Enable "Send to Kiro" button when one or more entries are selected
    - Implement `useSendToKiro()` hook that POSTs KiroContextPayload to `/api/kiro-context`
    - Display toast notification on success (entry count and file path) or failure
    - _Requirements: 13.1, 13.2, 13.5_

- [x] 17. Final Integration and Validation
  - [x] 17.1 Wire all components together and verify end-to-end
    - Verify proxy intercepts HTTP traffic and creates log entries
    - Verify frontend SDK captures network calls with `source: "frontend"`
    - Verify service simulator logs appear with `source: "service"`
    - Verify dashboard updates in real-time via WebSocket
    - Verify all filters work across all log sources
    - Verify Kiro context export writes correct JSON files
    - Provide run instructions (`pnpm dev`) and example usage
    - _Requirements: 1.1, 1.2, 1.5, 5.3, 10.3, 11.2, 13.3_

- [x] 18. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Validate: all property tests pass, all unit tests pass, proxy + dashboard + SDK + service simulator work together

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases using Vitest
- All code is TypeScript and lives inside the `./observability/` directory
- The implementation follows the 13-step pipeline defined in `observability/TASKS.md` and `observability/RULES.md`

# Requirements Document

## Introduction

The Observability Proxy System is a real-time development observability tool for full-stack TypeScript applications. It intercepts HTTP traffic via a Fastify reverse proxy, streams structured log entries over WebSocket, and renders them in a React dashboard with filtering, grouping, and export capabilities. The system is organized as a pnpm monorepo with four packages: proxy server, web dashboard, shared types, and a frontend SDK. A key feature is the ability to export selected log entries to Kiro's AI context directory for debugging assistance.

## Glossary

- **Proxy_Server**: The Fastify-based reverse proxy application (`apps/proxy`) that intercepts HTTP requests, forwards them to the target backend, and captures request/response metadata as structured log entries.
- **WebSocket_Manager**: The component within the Proxy_Server responsible for managing WebSocket connections at the `/logs` endpoint, broadcasting log entries, and sending historical batches to new clients.
- **Ring_Buffer**: A fixed-capacity circular buffer (default 10,000 entries) that stores log entries in insertion order and evicts the oldest entries when full.
- **Dashboard**: The React-based web application (`apps/web`) that connects to the Proxy_Server via WebSocket and renders log entries in real-time with filtering, grouping, and export controls.
- **Log_Store**: The in-memory store within the Dashboard that holds up to 10,000 log entries received from the WebSocket connection.
- **Filter_Engine**: The pure function within the Dashboard that computes a subset of log entries matching all active filter criteria using AND logic.
- **Log_Viewer**: The virtualized list and Monaco Editor components within the Dashboard that render log entries and display selected log detail.
- **Frontend_SDK**: The browser instrumentation library (`packages/sdk`) that wraps `fetch` and `XMLHttpRequest` to capture frontend network activity and React render events.
- **Shared_Types**: The package (`packages/types`) that defines the `LogEntry` interface, `LogLevel` and `LogSource` union types, and the `createLogEntry()` factory function.
- **Kiro_Context_Exporter**: The subsystem that enables developers to send selected log entries from the Dashboard to the `.kiro/context/` directory as structured JSON files.
- **LogEntry**: A structured record representing a single log event with fields for id, timestamp, type, source, group, message, and optional HTTP metadata.
- **LogLevel**: A union type of `"log" | "info" | "debug" | "warn" | "error"` representing log severity.
- **LogSource**: A union type of `"proxy" | "frontend" | "service"` representing the origin of a log entry.
- **KiroContextPayload**: A JSON structure containing an array of LogEntry objects and metadata (exportedAt, count, source, filters, description) used for Kiro context exports.
- **Service_Log_Simulator**: A Node.js process that emits simulated service logs, pipes them to the Proxy_Server, and normalizes them to the LogEntry schema.

## Requirements

### Requirement 1: HTTP Request Interception and Proxying

**User Story:** As a developer, I want all HTTP traffic to pass through a reverse proxy, so that I can observe request/response metadata without modifying my application code.

#### Acceptance Criteria

1. WHEN an HTTP request is received, THE Proxy_Server SHALL forward the request to the configured TARGET_URL with the same method, headers, and body.
2. WHEN the target backend returns a response, THE Proxy_Server SHALL return the same status code, headers, and body to the original client.
3. WHEN an HTTP request is intercepted, THE Proxy_Server SHALL capture the method, URL, query parameters, sanitized headers, body, and payload size.
4. WHEN a response is received from the target, THE Proxy_Server SHALL capture the status code, response body, size, and request duration in milliseconds.
5. WHEN a request/response cycle completes, THE Proxy_Server SHALL create a LogEntry with `source: "proxy"` and broadcast it to all connected WebSocket clients.
6. IF the target backend is unreachable, THEN THE Proxy_Server SHALL return HTTP 502 to the client and broadcast an error LogEntry with the failure details.

### Requirement 2: Header Sanitization

**User Story:** As a developer, I want sensitive headers to be redacted in log entries, so that credentials are not exposed in the observability dashboard.

#### Acceptance Criteria

1. WHEN capturing request headers, THE Proxy_Server SHALL replace the values of `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`, and `proxy-authorization` headers with `"[REDACTED]"`.
2. WHEN matching header names for sanitization, THE Proxy_Server SHALL perform case-insensitive comparison.
3. WHEN a header has an array value, THE Proxy_Server SHALL join the values with `", "` before including them in the log entry.
4. WHEN a header value is undefined, THE Proxy_Server SHALL omit that header from the sanitized output.

### Requirement 3: Shared Log Schema and Factory

**User Story:** As a developer, I want a single shared log schema across all packages, so that log entries are consistent and type-safe throughout the system.

#### Acceptance Criteria

1. THE Shared_Types package SHALL define a LogEntry interface with required fields: `id` (UUID v4 string), `timestamp` (positive integer epoch milliseconds), `type` (LogLevel), `source` (LogSource), `group` (string), and `message` (non-empty string).
2. THE Shared_Types package SHALL define optional LogEntry fields: `method`, `endpoint`, `query`, `body`, `response`, `status` (100-599), `duration` (non-negative), `payloadSize` (non-negative), and `error`.
3. WHEN `createLogEntry()` is called with type, source, and message, THE Shared_Types package SHALL return a complete LogEntry with an auto-generated UUID v4 `id`, a `timestamp` set to the current epoch milliseconds, and `group` defaulting to `"default"`.
4. WHEN additional fields are provided to `createLogEntry()`, THE Shared_Types package SHALL include those fields in the returned LogEntry, overriding any defaults.

### Requirement 4: Ring Buffer Storage

**User Story:** As a developer, I want log entries stored in a fixed-capacity buffer, so that memory usage remains bounded during long development sessions.

#### Acceptance Criteria

1. THE Ring_Buffer SHALL have a configurable capacity defaulting to 10,000 entries.
2. WHEN an entry is pushed and the Ring_Buffer is below capacity, THE Ring_Buffer SHALL add the entry and increment its size by one.
3. WHEN an entry is pushed and the Ring_Buffer is at capacity, THE Ring_Buffer SHALL evict the oldest entry and store the new entry, maintaining size equal to capacity.
4. WHILE the Ring_Buffer is in use, THE Ring_Buffer size SHALL remain less than or equal to its capacity.
5. WHEN `getRecent(n)` is called, THE Ring_Buffer SHALL return the most recent `min(n, size)` entries in insertion order (oldest first).
6. WHEN `clear()` is called, THE Ring_Buffer SHALL remove all entries and reset its size to zero.

### Requirement 5: WebSocket Streaming

**User Story:** As a developer, I want log entries streamed to the dashboard in real-time via WebSocket, so that I can observe traffic as it happens.

#### Acceptance Criteria

1. THE WebSocket_Manager SHALL accept connections at the `/logs` endpoint.
2. WHEN a new client connects, THE WebSocket_Manager SHALL send a batch message containing the last 200 log entries from the Ring_Buffer.
3. WHEN a LogEntry is broadcast, THE WebSocket_Manager SHALL send a JSON message with `type: "log"` and the entry as payload to all clients with OPEN readyState.
4. WHEN a client disconnects, THE WebSocket_Manager SHALL remove the client from its connection set.
5. WHEN an incoming message from an SDK client is received, THE WebSocket_Manager SHALL parse it as a LogEntry, push it to the Ring_Buffer, and broadcast it to all connected clients.
6. IF an incoming WebSocket message cannot be parsed as valid JSON, THEN THE WebSocket_Manager SHALL silently ignore the message without crashing or disconnecting the client.

### Requirement 6: Dashboard Log Display

**User Story:** As a developer, I want to view log entries in a real-time dashboard, so that I can monitor application behavior during development.

#### Acceptance Criteria

1. WHEN the Dashboard connects to the WebSocket, THE Dashboard SHALL populate the Log_Store with the initial batch of log entries.
2. WHEN a new log entry is received via WebSocket, THE Dashboard SHALL append it to the Log_Store.
3. WHILE the Log_Store contains entries, THE Log_Viewer SHALL render them in a virtualized list for performance.
4. WHEN a log entry is selected, THE Log_Viewer SHALL display its full detail in a Monaco Editor with JSON syntax highlighting.
5. WHILE the Log_Store size exceeds 10,000 entries, THE Dashboard SHALL trim the oldest entries to maintain the 10,000 entry limit.

### Requirement 7: Dashboard Controls

**User Story:** As a developer, I want pause, resume, clear, and auto-scroll controls, so that I can manage the log stream during debugging.

#### Acceptance Criteria

1. WHEN the pause control is activated, THE Dashboard SHALL stop appending new log entries to the visible list and buffer incoming entries.
2. WHEN the resume control is activated, THE Dashboard SHALL append all buffered entries to the Log_Store and resume real-time updates.
3. WHEN the clear control is activated, THE Dashboard SHALL remove all entries from the Log_Store and the internal buffer.
4. WHEN auto-scroll is enabled, THE Log_Viewer SHALL scroll to the most recent entry as new entries arrive.

### Requirement 8: Log Filtering

**User Story:** As a developer, I want to filter logs by type, source, endpoint, and text, so that I can focus on relevant entries during debugging.

#### Acceptance Criteria

1. WHEN a type filter is set, THE Filter_Engine SHALL return only entries whose `type` matches the selected LogLevel.
2. WHEN a source filter is set, THE Filter_Engine SHALL return only entries whose `source` matches the selected LogSource.
3. WHEN an endpoint filter is set, THE Filter_Engine SHALL return only entries whose `endpoint` contains the filter string (case-insensitive substring match).
4. WHEN a text search filter is set, THE Filter_Engine SHALL return only entries where the concatenation of `message`, `endpoint`, `error`, and `group` fields contains the search string (case-insensitive).
5. WHEN multiple filters are active, THE Filter_Engine SHALL apply AND logic, returning only entries that match all active filters.
6. WHEN all filters are empty or null, THE Filter_Engine SHALL return the complete log array unchanged.
7. THE Filter_Engine SHALL return a new array without mutating the original log array.

### Requirement 9: Payload Truncation

**User Story:** As a developer, I want large payloads truncated in log entries, so that memory usage stays bounded and the dashboard remains responsive.

#### Acceptance Criteria

1. WHEN a request body or response body exceeds 50,000 bytes, THE Proxy_Server SHALL truncate the serialized payload to 50,000 bytes and append a truncation indicator showing the original size.
2. WHEN a payload is at or below 50,000 bytes, THE Proxy_Server SHALL store it unchanged in the LogEntry.
3. WHEN the payload is null or undefined, THE Proxy_Server SHALL pass it through unchanged.

### Requirement 10: Frontend SDK Instrumentation

**User Story:** As a developer, I want the frontend SDK to automatically capture network calls and React renders, so that frontend activity appears in the observability dashboard.

#### Acceptance Criteria

1. WHEN `initLogger()` is called, THE Frontend_SDK SHALL wrap `globalThis.fetch` to intercept all subsequent fetch calls.
2. WHEN `initLogger()` is called, THE Frontend_SDK SHALL wrap `XMLHttpRequest` to intercept all subsequent XHR calls.
3. WHEN a wrapped fetch or XHR call completes, THE Frontend_SDK SHALL create a LogEntry with `source: "frontend"`, the HTTP method, URL, status code, and duration.
4. WHEN a wrapped fetch or XHR call fails with a network error, THE Frontend_SDK SHALL create an error LogEntry with the error message and duration.
5. WHEN the Frontend_SDK sends its own traffic (marked with `X-Observability-SDK` header), THE Frontend_SDK SHALL skip logging that request to prevent infinite loops.
6. WHEN `destroy()` is called, THE Frontend_SDK SHALL restore the original `fetch` and `XMLHttpRequest` functions.

### Requirement 11: Service Log Simulation

**User Story:** As a developer, I want simulated service logs piped into the proxy, so that I can test the dashboard with multiple log sources.

#### Acceptance Criteria

1. THE Service_Log_Simulator SHALL emit log entries with `source: "service"` at configurable intervals.
2. WHEN the Service_Log_Simulator emits a log, THE Proxy_Server SHALL normalize it to the LogEntry schema and broadcast it to all connected WebSocket clients.

### Requirement 12: UX Enhancements

**User Story:** As a developer, I want export, grouping, error highlighting, duration badges, and payload truncation display, so that the dashboard is efficient and informative.

#### Acceptance Criteria

1. WHEN the export control is activated, THE Dashboard SHALL serialize the current filtered log entries as a JSON file and trigger a browser download.
2. WHEN log entries share the same `group` value, THE Dashboard SHALL display them as a collapsible group.
3. WHEN a log entry has `type: "error"`, THE Dashboard SHALL visually highlight it with distinct styling.
4. WHEN a log entry has a `duration` value, THE Dashboard SHALL display a duration badge showing the value in milliseconds.
5. WHEN a log entry body or response exceeds the display threshold, THE Dashboard SHALL show a truncated preview with an option to expand.

### Requirement 13: Kiro Context Export

**User Story:** As a developer, I want to send selected log entries to Kiro's AI context, so that I can share runtime data with Kiro for debugging assistance.

#### Acceptance Criteria

1. WHEN one or more log entries are selected in the Dashboard, THE Dashboard SHALL enable a "Send to Kiro" button in the toolbar.
2. WHEN the "Send to Kiro" button is clicked, THE Dashboard SHALL POST a KiroContextPayload to the Proxy_Server at `/api/kiro-context`.
3. WHEN the Proxy_Server receives a valid KiroContextPayload, THE Kiro_Context_Exporter SHALL write a JSON file named `log-snapshot-{timestamp}.json` to the `.kiro/context/` directory.
4. WHEN the `.kiro/context/` directory does not exist, THE Kiro_Context_Exporter SHALL create it before writing the file.
5. WHEN the export succeeds, THE Dashboard SHALL display a toast notification confirming the number of entries sent and the file path.
6. IF the KiroContextPayload contains zero entries, THEN THE Proxy_Server SHALL return HTTP 400 with an error message.
7. IF the KiroContextPayload contains more entries than the configured maximum (default 100), THEN THE Proxy_Server SHALL return HTTP 400 with an error indicating the limit.
8. IF the Proxy_Server cannot write to the `.kiro/context/` directory, THEN THE Proxy_Server SHALL return HTTP 500 with a descriptive error message.
9. WHEN multiple exports are performed, THE Kiro_Context_Exporter SHALL produce a unique file for each export (timestamp-based naming).
10. WHEN a KiroContextPayload includes a description, THE Kiro_Context_Exporter SHALL truncate it to 500 characters and include it in the file metadata.
11. THE KiroContextPayload metadata `count` field SHALL equal the length of the `entries` array.

### Requirement 14: Payload Size Calculation

**User Story:** As a developer, I want accurate payload size measurements in log entries, so that I can identify large requests and responses.

#### Acceptance Criteria

1. WHEN calculating payload size for a string body, THE Proxy_Server SHALL compute the byte length using UTF-8 encoding.
2. WHEN calculating payload size for a non-string body, THE Proxy_Server SHALL JSON-serialize it and compute the byte length using UTF-8 encoding.
3. WHEN the body is null or undefined, THE Proxy_Server SHALL report a payload size of zero.

### Requirement 15: WebSocket Reconnection

**User Story:** As a developer, I want the dashboard to automatically reconnect when the proxy restarts, so that I do not lose observability during development.

#### Acceptance Criteria

1. IF the WebSocket connection is lost, THEN THE Dashboard SHALL attempt reconnection with exponential backoff (1s, 2s, 4s, up to a maximum of 30s).
2. WHEN the WebSocket reconnects, THE Dashboard SHALL receive the last 200 log entries from the Ring_Buffer as an initial batch.
3. WHILE the WebSocket is disconnected, THE Dashboard SHALL display a connection status indicator.

### Requirement 16: Monorepo Structure

**User Story:** As a developer, I want the project organized as a pnpm monorepo with shared packages, so that code is modular and type-safe across boundaries.

#### Acceptance Criteria

1. THE monorepo SHALL contain four packages: `apps/proxy`, `apps/web`, `packages/types`, and `packages/sdk`.
2. THE monorepo SHALL use pnpm workspaces for dependency management.
3. THE monorepo SHALL use TypeScript across all packages.
4. THE monorepo SHALL provide root-level `dev` and `build` scripts.

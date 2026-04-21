⚠️ CRITICAL RULES:
	•	NEVER skip steps
	•	NEVER modify previous steps unless explicitly instructed
	•	If a step fails:
→ ONLY fix files created/modified in the CURRENT step
→ DO NOT refactor earlier steps
	•	After each step:
→ Run validation checks before proceeding

⸻

🧠 PIPELINE: Observability Proxy (Validated)

⸻

STEP 1 — Monorepo Setup

Create pnpm workspace:

/apps
/proxy
/web
/packages
/types
/sdk

Requirements:
	•	TypeScript everywhere
	•	ESLint + Prettier
	•	Root scripts:
	•	dev
	•	build

✅ VALIDATION
	•	pnpm install runs without errors
	•	pnpm -r build succeeds
	•	Workspace imports work

STOP if validation fails.

⸻

STEP 2 — Proxy Server
	•	Fastify server on port 3000
	•	Configurable TARGET_URL
	•	Intercept all requests
	•	Capture request/response metadata

✅ VALIDATION
	•	Server starts: pnpm dev
	•	Test:
curl through proxy → response matches target
	•	Log output shows method + endpoint + duration

STOP if proxy is not forwarding correctly.

⸻

STEP 3 — Log Schema

Create shared LogEntry in /packages/types
Add createLogEntry()

Integrate into proxy.

✅ VALIDATION
	•	TypeScript compiles
	•	Logs conform to schema
	•	No any leaks

⸻

STEP 4 — WebSocket Streaming
	•	Add WS endpoint /logs
	•	Broadcast LogEntry
	•	Buffer (10k max)
	•	Send last 200 logs on connect

✅ VALIDATION
	•	Connect via browser WS client
	•	Logs stream in real-time
	•	No crashes under multiple connections

⸻

STEP 5 — React App Setup
	•	Vite + React + TS
	•	TailwindCSS
	•	shadcn/ui

✅ VALIDATION
	•	App runs: pnpm dev
	•	UI renders without errors
	•	Tailwind styles working

⸻

STEP 6 — WebSocket Client
	•	Connect to ws://localhost:3000/logs
	•	Store logs (max 10k)

Controls:
	•	pause/resume
	•	clear logs

✅ VALIDATION
	•	Logs appear in UI in real-time
	•	Pause stops updates
	•	Clear removes logs

⸻

STEP 7 — Log Viewer
	•	Monaco Editor (or similar)
	•	Syntax highlighting
	•	JSON formatting
	•	Auto-scroll toggle

✅ VALIDATION
	•	Logs render correctly
	•	Large logs don’t freeze UI

⸻

STEP 8 — Filters
	•	Filter by:
	•	type
	•	source
	•	endpoint
	•	text

✅ VALIDATION
	•	Filters apply instantly
	•	Combined filters work correctly

⸻

STEP 9 — Frontend SDK
	•	Wrap fetch + XHR
	•	Capture request/response/errors/duration
	•	React render logging

✅ VALIDATION
	•	SDK logs appear in proxy
	•	No infinite loops (SDK logging itself)

⸻

STEP 10 — SDK Integration
	•	Initialize SDK in app

✅ VALIDATION
	•	Network calls show in UI
	•	React renders logged

⸻

STEP 11 — Service Logs
	•	Simulate Encore logs
	•	Pipe to proxy
	•	Normalize

✅ VALIDATION
	•	Logs appear with source=“service”

⸻

STEP 12 — UX Enhancements
	•	Export JSON
	•	Group logs
	•	Highlight errors
	•	Duration badges
	•	Truncate payloads

✅ VALIDATION
	•	Export works
	•	Grouping works
	•	UI remains performant

⸻

STEP 13 — Final Integration

✅ FINAL VALIDATION
	•	Proxy intercepts traffic
	•	Frontend logs captured
	•	Service logs captured
	•	UI updates live
	•	No console errors
	•	No memory leaks

⸻

🧪 DEBUG RULE

If something breaks:
	1.	Identify failing step
	2.	Fix ONLY that step
	3.	Re-run validation
	4.	Continue

⸻

🎯 OUTPUT FORMAT

At each step:
	•	File changes
	•	Code
	•	Validation results

At end:
	•	Run instructions (pnpm dev)
	•	Example usage

BEGIN.
:::

⸻

🔥 Why this version is 🔥
	•	You get guardrails without chaos
	•	Prevents:
	•	silent regressions
	•	schema drift
	•	cross-layer breakage
	•	Forces Kiro to behave more like a junior dev with tests

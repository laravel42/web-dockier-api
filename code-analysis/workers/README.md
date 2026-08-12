# Dockier SAST Workers

Backend analysis components for Dockier's Static Application Security Testing (SAST)
platform: a FastAPI process hosting six pg-boss queue consumers.

> **Status:** this tree replaces `backend/src/services/code-analysis`'s scan worker.
> **Both must not run at once** — two consumers on the `security-scan` queue split
> jobs nondeterministically. See [`context/FIX-PLAN.md`](context/FIX-PLAN.md) for the
> cutover checklist.

## Pipeline

```text
pgboss:security-scan ──> gateway  ── resolves repo + credentials from the database
                                  ── clones, zips, uploads to object storage
                                  ── fans out to four engine queues
                                        │
     pgboss:scan-semgrep   ─┐           │
     pgboss:scan-regex     ─┼──> engine ── downloads, scans, publishes a ScanResult
     pgboss:scan-sonarqube ─┤                   │
     pgboss:scan-codeql    ─┘                   ▼
                                       pgboss:scan-results
                                                │
                                          aggregator ── barrier on all four engines
                                                     ── dedupes across engines
                                                     ── LLM marks false positives
                                                     ── writes scans + findings
```

## Directory structure

```text
src/
├── infrastructure/
│   ├── config.py          # Execution constraints; DATABASE_URL resolved lazily
│   ├── db_client.py       # asyncpg pool with a jsonb codec
│   ├── queue.py           # pg-boss v12 client (claim, complete, fail, reap)
│   ├── redis_client.py    # Process-wide client, used only for the fan-in barrier
│   ├── git_repo.py        # Repo + per-tenant clone credentials
│   ├── scans_repo.py      # Canonical scans/findings persistence, quality gates
│   ├── rules_repo.py      # Custom rules and rule overrides, read from the database
│   ├── scan_analysis.py   # Path normalization, cross-engine dedupe, rule-id cleanup
│   ├── scan_skip.py       # Dependency/build/minified exclusions
│   ├── scan_progress.py   # Progress persistence + NOTIFY, cancellation checks
│   ├── sensitive_data.py  # Schema/model field classification
│   ├── llm.py             # False-positive judging (marks, never deletes)
│   ├── secret_manager.py  # Environment-backed secrets
│   ├── storage.py         # Zip/unzip and object storage
│   └── paths.py           # Rule corpus location
├── models/schemas.py      # ScanMessage, ScanResult, ScanFinding, ScanOptions
├── services/
│   ├── base.py            # EnginePublisher — one way to report an outcome
│   ├── worker_runtime.py  # Poll loop, concurrency cap, supervision, reaping
│   ├── aggregator/ codeql/ gateway/ regex/ semgrep/ sonarqube/
└── main.py                # FastAPI app; lifespan starts and stops the workers
```

## Running

Requires PostgreSQL (with the canonical `supabase/migrations/` applied) and Redis.

```bash
export DATABASE_URL=postgresql://...
uvicorn src.main:app --reload
```

Queues are registered on startup. The HTTP endpoints enqueue jobs; they do not
run scans inline, so a manual scan obeys the same concurrency cap, retry and
expiry behaviour as any other job.

```bash
pytest                    # 265 tests
```

## HTTP API

Authenticated with the platform's tenant JWT (`Authorization: Bearer <token>`,
HS256 over `JWT_SECRET`) — the same token the frontend already holds. Every query
is scoped to the `tenantId` claim, so a valid token for one organization cannot
read or trigger another's scans; a mismatch returns 404, because confirming an id
exists is itself a disclosure.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/sast/scans/{scanId}/run` | Enqueue a scan. Body: `{ options?: {...} }` |
| `GET` | `/sast/scans/{scanId}` | Status, summary, per-engine outcome, quality gate, live progress |
| `GET` | `/sast/scans/{scanId}/findings` | Paginated findings. `severity`, `includeSuppressed`, `limit` (≤200), `offset` |
| `GET` | `/sast/health` | Liveness and queue depth. No auth |

Request *and* response models live in [`src/api/schemas.py`](src/api/schemas.py) and
are attached to every route via `response_model=`, so FastAPI validates outbound
payloads too — a field silently going missing fails at the boundary instead of
arriving in the UI as `undefined`. Errors use `{ "message", "code" }`, which is
what the frontend's `request()` helper reads.

Interactive docs at `/docs` when running.

## Docker

```bash
# Build context is code-analysis/, because the image needs rules/ as well as workers/
cd code-analysis
JWT_SECRET=... docker compose -f workers/docker-compose.yml up --build
```

The container restrictions are the point, not incidental — the engines execute
untrusted source. `read_only` rootfs, `noexec` tmpfs for clones, all capabilities
dropped, `no-new-privileges`, pid and memory caps, and **no cloud credentials in
the environment**. Data stores sit on an `internal: true` network with no route
out; only the workers get an egress network, for cloning and API calls. See the
comments in [`docker-compose.yml`](docker-compose.yml) before changing any of it.

## Configuration

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `DATABASE_URL` | yes | Postgres, for pg-boss and the canonical schema |
| `REDIS_URL` | no | Fan-in barrier state (default `redis://localhost`) |
| `LLM_PROVIDER` | no | `openai` or `mock` (default `mock`) |
| `OPENAI_API_KEY` | with `openai` | False-positive judging |
| `S3_BUCKET_NAME` | no | Object storage; falls back to a local mock store |
| `ALLOWED_CLONE_HOSTS` | no | Comma-separated host allowlist; unset means any https host |
| `OPENGREP_RULES_DIR` | no | Rule corpus location (default `code-analysis/rules/opengrep`) |
| `SONAR_HOST_URL`, `SONAR_TOKEN` | for SonarQube | Scanner and API access |
| `JWT_SECRET` | yes, for the API | Verifies tenant tokens; the API fails closed without it |
| `CORS_ALLOW_ORIGINS` | for browser access | Comma-separated origins. No wildcard — credentials are in play |

## Notes

- **Configuration lives in the database** (`custom_rules`, `opengrep_rules`,
  `sonarqube_rules`, `quality_gates`), not in this tree. Rule *content* is seeded
  by the backend's `seedCustomRules()`; duplicating 36 regexes here would drift.
- **Findings are never deleted by the LLM.** Suppression is a marked state
  (`findings.suppressed_by_llm` + `suppression_reason`); filtered views select
  `WHERE NOT suppressed_by_llm`.
- **A failed engine is never a clean scan.** `scans.engine_status` records each
  engine's outcome and `summary.partial` flags degradation, because
  `scans.status` is a closed enum with no room for it.

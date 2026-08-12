# Dockier SAST Workers

Backend analysis components for Dockier's Static Application Security Testing
(SAST) platform. Seven services, each its own process, behind one router port.

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
├── api/                   # Public tenant-facing API (auth, schemas, routes)
├── models/schemas.py      # ScanMessage, ScanResult, ScanFinding, ScanOptions
├── router.py              # Single public port; forwards to the services below
├── service_registry.py    # Names, ports and URLs of every service
├── service_app.py         # Builds one service's app (health, info, trigger, worker)
├── service_entrypoints.py # Importable app objects, one per service
├── run.py                 # `python -m src.run <service>`
├── services/
│   ├── base.py            # EnginePublisher — one way to report an outcome
│   ├── worker_runtime.py  # Poll loop, concurrency cap, supervision, reaping
│   ├── aggregator/ codeql/ gateway/ regex/ semgrep/ sonarqube/
└── main.py                # Default ASGI target — the router
```

## Running

Requires PostgreSQL (with the canonical `supabase/migrations/` applied) and Redis.

```bash
export DATABASE_URL=postgresql://...
export JWT_SECRET=...                      # the API fails closed without it
export CORS_ALLOW_ORIGINS=http://localhost:5173

./scripts/run-services.sh start            # seven services + router
./scripts/run-services.sh status
./scripts/run-services.sh stop
```

Logs land in `logs/<service>.log`, pids in `.run/`.

One service on its own:

```bash
python -m src.run semgrep     # :8004
python -m src.run router      # :8000
uvicorn src.main:app          # equivalent to the router
```

### Topology

```text
                       ┌── /sast/*           → api        :8001
client ─→ router :8000 ┤
                       └── /workers/{name}/* → gateway    :8002
                                               aggregator :8003
                                               semgrep    :8004
                                               regex      :8005
                                               sonarqube  :8006
                                               codeql     :8007
```

Separate processes so one engine wedging on a pathological repository cannot take
the API down with it, and so an engine can be restarted without interrupting
in-flight API traffic. The router forwards and nothing more — it holds no queue
consumer and performs **no authentication**, because the `api` service verifies
the tenant token itself; a router that authenticated on its behalf would become a
component whose compromise grants access to every tenant's scans.

`./scripts/run-services.sh` is a development convenience. In production each
service is its own supervised unit; the registry reads `SAST_PORT_<SERVICE>` and
`SAST_URL_<SERVICE>` so services can live on different hosts.

```bash
pytest                    # 309 tests
```

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

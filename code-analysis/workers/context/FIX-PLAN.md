# FIX-PLAN.md — SAST Workers Remediation

Context document for agents and engineers working in `code-analysis/workers/`.
Derived from a full read of `src/`, `tests/`, `init_db.sql`, and the per-service READMEs.

Companion docs: [`AGENTS.md`](AGENTS.md) (repo conventions), [`DESCRIPTION.md`](DESCRIPTION.md) (scope and non-goals), [`../README.md`](../README.md) (worker architecture).

---

## 0. Status and framing

**What this tree is.** A standalone Python/FastAPI prototype of the SAST pipeline:
pg-boss intake → repo clone → object storage → four analysis engines over Redis Pub/Sub →
fan-in aggregator → LLM false-positive filter → Postgres.

**What it is not.** It is not the shipping scanner. Production scanning lives in the Fastify
backend (`backend/src/services`) with rule assets in `code-analysis/rules/`. This tree is
**untracked by git** (`git ls-files code-analysis` returns nothing) and its test suite does not
collect. Nothing here is currently exercised by CI.

**Assumption this plan is written under.** The pipeline is intended to become real, so fixes are
specified as production changes, not prototype patches. If the intent is instead to keep it as a
throwaway spike, stop after Phase 1 — everything past that is only worth doing for code that runs
against customer repositories.

**Decisions required before Phase 2** (see §7).

---

## 0b. Progress — all phases complete

| Phase | State |
| ----- | ----- |
| Phase 0 — verifiable (§2) | **Done.** |
| Phase 1 — P0 correctness (§3) | **Done.** |
| Phase 2 — P1 delivery (§4) | **Done.** pg-boss replaces Pub/Sub; runtime hardened. |
| Phase 3 — P2 engines (§5) | **Done.** |
| Phase 4 — config drift (§6) | **Done.** Config reads from the database; docs corrected. |
| Phase 5 — security (§8) | **Done** except engine sandboxing (§8.6), an ops decision. |
| Phase 6 — hygiene (§9) | **Done.** |
| Parity with the TS worker (§4c) | **7 of 9 done.** Two remain — see below. |

265 tests. Migrations 0063–0065 applied and re-applied against a live Postgres;
the pg-boss client verified against a real v12 schema, consuming a job enqueued
by the JavaScript client.

### Still open — these block cutover

1. **§8.6 engine sandboxing.** semgrep, sonar-scanner and codeql execute against
   attacker-supplied source and this tree has no container configuration, so they
   run unsandboxed with whatever credentials the process environment holds. An
   ops decision, to be settled with the deployment topology.
2. **Websocket progress delivery.** The workers persist progress into
   `scans.summary.progress` and emit `NOTIFY dockier_scan_progress`. The backend
   holds the websockets and does not LISTEN on that channel yet — a backend
   change, deliberately not made from here. Progress is visible on reload but
   does not stream.
3. **Degraded scans are invisible in the UI.** `scans.status` is a closed enum
   with no room for "partial", so degradation lives in `summary.partial` and
   `scans.engine_status`. Surfacing it is a frontend change.
4. **Queue reconcile parity.** `scan-queue-reconcile.ts` cancels orphaned jobs
   from the backend side; the Python workers reap expired *active* jobs but do
   not implement the cancel-orphans sweep.

### The cutover itself

**Both scanners must not run at once** — two consumers on `security-scan` split
jobs nondeterministically. Retiring the TypeScript worker means not registering
`registerScanWorker`, which is a backend change and has not been made. Nothing in
this tree changes production behaviour until it is.

---

## 1. Severity model used here

| Class | Meaning |
| ----- | ------- |
| **P0** | Pipeline produces wrong or fabricated data. Fix before anything else. |
| **P1** | Pipeline loses work, hangs, or cannot scale. Blocks running this for real. |
| **P2** | An engine under-reports or mis-reports. Degrades scan quality. |
| **P3** | Hygiene, dead code, doc drift. Cheap, do opportunistically. |

---

## 2. Phase 0 — Make the work verifiable

Nothing below can be validated until this is done. Small, do it first.

### 0.1 Put the tree under version control
`code-analysis/workers/` is untracked. Commit `src/`, `tests/`, `requirements.txt`,
`init_db.sql`, `README.md`, and `context/`. Ensure `.gitignore` covers `.venv/`, `venv/`,
`admin/node_modules/`, `admin/.next/`, `.pytest_cache/`, `.DS_Store`.

### 0.2 Repoint the test suite at the current module layout
All eight files in `tests/` import a flat layout that no longer exists:

```
from aggregator import process_result, complete_job
from gateway import process_new_job
from semgrep_service import process_semgrep_job, run_semgrep_scan
...
```

The code was refactored into `src/services/<engine>/service.py` classes. Nothing collects, which
is precisely why the P0 in §3.1 shipped — `test_aggregator.py` asserts a wire format the writer
never produced. Rewrite the imports against the class API and add `pytest.ini`/`pyproject.toml`
with `pythonpath = .` and `asyncio_mode = auto`.

### 0.3 Delete scratch files
Remove `fix_test.py` (5-line scratchpad at the tree root).

**Acceptance:** `pytest` collects and runs; the tree is committed; CI can invoke it.

---

## 3. Phase 1 — P0 data correctness

These make the pipeline's output wrong. Fix in this order.

### 3.1 Aggregator destroys every finding it collects
`src/services/aggregator/service.py:41,53`

Write side pushes each finding as its own JSON **object**; read side `extend`s a list with the
parsed result. Extending a list with a dict iterates its **keys**:

```
in:  [{"rule_id": "dockier-hardcoded-secret", "severity": "error", ...}]
out: ['rule_id', 'severity', 'message', 'file_path', 'line']
```

Every scan writes that into `security_scans.findings`.

**Fix.** Pick one serialization and enforce it at both ends. Recommended: keep one Redis list
entry per finding (`rpush` of individual objects) and change the reader to `append(json.loads(item))`.
Drop the `"[]"` sentinel for the empty case — an engine with no findings should push nothing and
rely solely on the `engines_done` set to signal completion.

**Guard.** Validate through `ScanFinding` at the publish boundary (§3.4) so the two halves cannot
drift again.

### 3.2 CodeQL fabricates vulnerabilities when the CLI is absent
`src/services/codeql/service.py:87-89`

When `shutil.which("codeql")` is falsy the service writes a mock SARIF containing `mock-sqli` at
`main.py:10` and returns it as a real finding. If the deployed image lacks the CLI, every scan
reports a fake SQL injection.

**Fix.** Delete the mock-SARIF branch. A missing engine binary must raise, and the failure must
propagate as an explicit engine-level error state (§4.3) — never as findings and never as a silent
empty result.

### 3.3 Concurrent engines overwrite each other's download
`src/infrastructure/storage.py:79`

`download_codebase` writes to a fixed path, `tempfile.gettempdir()/downloaded_codebase.zip`, then
`os.remove`s it. All four engines download the same job simultaneously on the same host —
truncated zips and nondeterministic "0 findings" results.

**Fix.** Write into the caller's `scratch_dir` (already unique per job via `mkdtemp`), or use
`tempfile.NamedTemporaryFile`. Same class of bug in `upload_codebase`, which keys on
`{commit_sha}.zip`.

### 3.4 Enforce the wire contract
`src/models/schemas.py`

`ScanFinding`, `ScanMessage`, and `ScanResult` are defined and **never used** — every service
hand-builds dicts, so nothing validates the messages crossing Redis.

**Fix.** Have each engine construct `ScanResult(...)` and publish `.model_dump_json()`; have the
aggregator parse incoming messages through `ScanResult`. Malformed engine output should be logged
and rejected, not silently aggregated.

**Acceptance:** an end-to-end run over a fixture repo lands well-formed finding objects in
`security_scans.findings`, with a round-trip test covering the serialization boundary.

---

## 4. Phase 2 — P1 delivery and reliability

### 4.1 Replace Redis Pub/Sub with a real queue
`src/services/*/worker.py`, `src/services/gateway/service.py:60-64`

Three defects share this root cause:

- **Pub/Sub is at-most-once.** A message published while an engine is restarting is gone with no
  ack, retry, or DLQ.
- **Pub/Sub is broadcast.** Every replica subscribing to `scan:semgrep` runs every scan. Since
  `main.py` starts all six workers in one process, two app instances double every scan and
  duplicate every finding. **The service cannot be horizontally scaled as written.**
- **No redelivery** means a crashed engine loses the job permanently, which then hangs the
  aggregator barrier forever (§4.2).

**Fix.** Use per-engine pg-boss queues (`scan-semgrep`, `scan-regex`, …) on the same Postgres
already in use, matching the backend's existing pg-boss convention. Redis Streams with consumer
groups is an acceptable alternative if Redis must stay in the path. Either way: one consumer group
per engine, explicit ack after publish-of-results, visibility timeout, bounded retries, DLQ.

Fixing this also resolves §4.2 and §4.3 in the same change.

### 4.2 Fan-in barrier has no timeout and races
`src/services/aggregator/service.py:44-58`

- **Race:** `sadd` → `smembers` → subset check → `delete` is four non-atomic round trips. Two
  engines completing in the same window both observe the full set and both call `complete_job` —
  duplicate LLM spend, two conflicting DB writes. Use the `sadd` return value (it returns 1 only
  for the member that was genuinely new) or a Lua script for check-and-claim.
- **No timeout:** if any engine never publishes, the set never reaches four and the job sits
  `active` forever. The Redis keys carry no TTL, so they leak too.

**Fix.** Atomic claim on completion; TTL on `job:{id}:*` keys; a deadline per scan after which the
aggregator finalizes with whatever arrived and records which engines timed out.

### 4.3 Engine failures are indistinguishable from clean scans
All four services catch broadly and publish `findings: []`.

A crashed semgrep, a missing CodeQL binary, and a genuinely clean repository all produce the same
output. For a security product this is the worst possible failure mode: silent under-reporting.

**Fix.** Add `status: "ok" | "failed"` and `error` to `ScanResult`. The aggregator records per-engine
status; `security_scans` gains an `engine_status JSONB` column. A scan where an engine failed must
not present as a clean bill of health in the UI.

### 4.4 Stuck-job reaper
`init_db.sql`, gateway worker

Jobs set to `active` are never reset. There is no `retrylimit` handling and no reaper, so any crash
strands a job permanently. Adopt pg-boss's native retry/expiry semantics rather than hand-rolling
(see §4.6).

### 4.5 Gateway worker holds a pool connection for process lifetime
`src/services/gateway/worker.py:12-32`

`async with pool.acquire() as conn:` wraps the infinite loop, pinning one of a max-5 pool forever.
Acquire per iteration.

### 4.6 Job ordering is undefined; schema is a pg-boss approximation
`src/services/gateway/worker.py:21`, `init_db.sql`

`ORDER BY keepuntil ASC` — nothing ever sets `keepuntil`, so it is NULL on every row and ordering
is arbitrary. Use `createdon ASC`.

More broadly, the hand-rolled `pgboss.job` DDL omits `priority`, `retrylimit`, `singletonkey`, and
partitioning. It will not interoperate with the real pg-boss the backend already runs. Drop the
hand-rolled DDL and consume the real schema.

### 4.7 Unbounded concurrency
`MAX_WORKERS = 4` in `src/infrastructure/config.py` is defined and **never referenced**. Both the
gateway and every engine worker do bare `asyncio.create_task` per message. A burst spawns unbounded
concurrent clones, zips, and `codeql database create` processes.

**Fix.** `asyncio.Semaphore(MAX_WORKERS)` around job processing in every worker.

### 4.8 Workers die silently
Tasks are created with bare `asyncio.create_task` — not retained (GC-eligible) and no
`add_done_callback`. If a worker's `async for` loop raises (a dropped Redis connection suffices),
the exception is swallowed and that engine goes permanently silent with no log and no restart.
Every subsequent scan then hangs at the barrier.

**Fix.** Retain task references, attach a done-callback that logs and restarts, and add a
supervisor loop. Migrate `@app.on_event` (deprecated in FastAPI 0.110) to the `lifespan` context
manager while here.

**Acceptance:** killing any single engine mid-scan produces a scan that completes with an explicit
per-engine failure recorded; two app replicas process each job exactly once.

---

## 4b. Phase 2 — what has landed

- **Canonical persistence** (`src/infrastructure/scans_repo.py`). Findings are written as rows to
  `findings` and the scan is finalized on `scans` with a computed `summary`. Engine severities are
  normalized to the strict `error|warning|info` vocabulary the table uses; unknown values map to
  `warning`, never to the quietest bucket. Verified end to end against a live Postgres carrying the
  real 0015/0016 schema.
- **`scans.status = 'partial'`** whenever any engine failed, so an engine crash cannot present as a
  clean repository.
- **Migration 0063** — `findings.suppressed_by_llm` + `suppression_reason`, with a partial index on
  the active-findings read path.
- **Migration 0064** — `scans.engine_status`.
- **LLM suppression is now a marked state** (decision §7.2). `LLMProvider.judge()` replaces
  `filter_false_positives()`: it annotates every finding and returns all of them. Real batching
  replaces the comment that claimed batching, and the prompt/`response_format` contradiction in
  §6.3 is resolved in favour of a JSON object.
- **`init_db.sql` retired** — it created shadow tables that nothing reads.

## 4c. Phase 2 — outstanding, and the parity gap

**Queue rewrite (§4.1, §4.4, §4.6) — not started.** The gateway still polls `pgboss.job` with
hand-rolled SQL and still fans out over Redis Pub/Sub. Replacing the TS scanner means consuming the
real payload it is enqueued with — `{scanId, tenantId, options, correlationId}` — which carries **no
clone URL**. The repo, branch and connection are read from the `scans` row, and credentials come
from `git_connections` via the tenant. The current `ScanMessage` contract cannot express any of this.

**§4.5, §4.7, §4.8** — pool connection per iteration, `MAX_WORKERS` semaphore, worker supervision
and the `lifespan` migration. Deferred deliberately: the poll loop they modify is replaced by the
queue rewrite, so doing them first is throwaway work.

**Parity gap — blocks retiring the TS worker.** `backend/src/services/code-analysis/` implements
these; this tree does not, except where marked.

| Capability | Status | Where it lives today |
| ---------- | ------ | -------------------- |
| Finding snippets and `end_line` | **DONE** | `scan-analysis.ts` |
| Cross-engine dedupe | **DONE** — `src/infrastructure/scan_analysis.py` | `dedupeScanFindings` |
| Skip-dirs / generated-asset / minified detection | **DONE** — `src/infrastructure/scan_skip.py` | `scan-skip-dirs.ts` |
| DB-backed custom rules and rule overrides | open | `custom-rules.ts`, `rule-overrides.ts` |
| `RunScanOptions` toggles (semgrep / sonarqube / custom rules / sensitive data) | open | `scan-worker.ts` |
| Sensitive-data scanning | open | `scan-analysis.ts` |
| Repo/credential resolution per tenant | open — couples to the queue rewrite | `git-connections.ts` |
| Live scan progress + websocket broadcast | open | `scan-progress.ts`, `routes/websocket.ts` |
| Scan cancellation and queue reconcile | open — couples to the queue rewrite | `scan-reconcile.ts` |

Both outright regressions are now closed: findings carry real spans and snippets, and the same
issue reported by four engines is persisted once, at the highest severity any of them assigned.

The three remaining independent items are §6.1 work (custom rules and overrides must come from the
database per decision §7.4), `RunScanOptions`, and sensitive-data scanning. The last three couple to
the queue rewrite and should be done with it.

## 5. Phase 3 — P2 engine quality

### 5.1 Semgrep
`src/services/semgrep/service.py`

- No `--config` flag. `semgrep scan` bare falls back to registry defaults (needs network; may
  return nothing offline). Point it at `code-analysis/rules/` and the rulesets already declared in
  `tool_configurations`.
- Add `--timeout`, `--max-target-bytes`, `--exclude`.
- `check=False` plus a blanket `except` conflates crash with clean — covered by §4.3, but also
  inspect `returncode` and `data["errors"]` explicitly.

### 5.2 SonarQube
`src/services/sonarqube/service.py:24`

- `await asyncio.sleep(5)` stands in for waiting on Sonar's server-side Compute Engine task.
  Analysis routinely exceeds 5s, so `api/issues/search` runs before the report exists and returns
  empty. **Fix:** read `report-task.txt` from the scanner output and poll `api/ce/task?id=` until
  `SUCCESS`, with a deadline.
- `-Dsonar.login` is deprecated → use `sonar.token`; passing it as a CLI arg exposes it in the
  process list → pass via env (`SONAR_TOKEN`).
- Project keys `dockier_{scan_id}` are created per scan and never deleted → unbounded growth on the
  Sonar server. Reuse a stable per-project key or clean up after fetch.

### 5.3 CodeQL
`src/services/codeql/service.py`

- Severity is hardcoded `"medium"` for every result, discarding SARIF `level` and
  `security-severity` from `runs[].tool.driver.rules`. Map them.
- Query suite referenced as a bare `{language}-security-and-quality.qls` will not resolve. Use the
  pack form `codeql/{lang}-queries:codeql-suites/{lang}-security-and-quality.qls`.
- `database create` lacks `--build-mode=none`; compiled targets (Go) will fail.
- `db_path` and `sarif_path` are written **inside** `--source-root`, so CodeQL indexes its own
  database. Move them outside the source tree.
- `parse_codeql_sarif` is the one blocking file read not wrapped in `asyncio.to_thread`.

### 5.4 Regex engine
`src/services/regex/service.py`, `src/services/regex/rules.py`

- `readlines()` on every file with no size cap, no binary detection beyond catching
  `UnicodeDecodeError`, and no skip list for `dist/`, `vendor/`, lockfiles, or minified bundles.
  Commit `c953c10 fix(scan): stop scanning published vendor bundles` fixed exactly this in the TS
  backend — port that skip logic here rather than reinventing it.
- `if ".git" in file_path` is a substring match that also excludes `.gitignore` and any path
  containing `.git` anywhere. Match path components.
- Two rules exist; `DESCRIPTION.md` and `README.md` both claim "30+ custom regex rules". Either
  port the backend's rule set or correct the docs (§6.2).
- The SQLi pattern requires the whole call on one line plus a literal `$` — misses f-strings, `%`,
  `.format()`, and JS concatenation. High false-negative rate.

### 5.5 Path normalization
`semgrep/service.py`, `regex/service.py`

`file_path.replace(repo_path + "/", "")` is a global substring replace, not a prefix strip, and
leaks `/tmp/tmpXXXX/...` when it fails to match. Use `os.path.relpath`.

### 5.6 Language detection contradicts its own README
`src/services/gateway/service.py:26-32`

[`gateway/README.md`](../src/services/gateway/README.md) states: *"ensure that any new language
detection logic added to `_detect_language` does not perform deep file system traversal that would
block the asyncio thread. Use lightweight heuristics."* The function does a full `os.walk` and is
called **directly on the event loop**, while the clone and upload on either side are correctly
wrapped in `to_thread`.

**Fix.** Cap the walk (depth and file count), wrap in `to_thread`, and return a **set** of detected
languages — CodeQL builds one database per language, and the current single-value return is
nondeterministic on polyglot repos because walk order is arbitrary.

---

## 6. Phase 4 — Configuration and doc drift

### 6.1 Half of `init_db.sql` is dead
`tool_configurations` seeds semgrep rulesets, regex rules, and CodeQL language lists.
`rules`, `quality_profiles`, `quality_profile_rules`, and `quality_gates` are fully seeded.
**No code reads any of them.** The regex engine hardcodes `CUSTOM_RULES`, semgrep runs with no
config at all, and quality gates are never evaluated.

**Decide and commit:** either the DB is the source of truth (load config at job start, cache per
engine) or the tables go. Right now it is neither, and the seeded values silently imply behavior
that does not exist.

### 6.2 Claims that do not match the code
- "30+ custom regex rules" (`DESCRIPTION.md`, `README.md`) vs. 2 rules in `rules.py`.
- `gateway/README.md` Pub/Sub payload documents `uri` as `codebases/{commit_sha}.zip`; the gateway
  passes `scan_id` into a parameter named `commit_sha`. Rename the parameter and correct the doc.
- `aggregator/README.md` pins the LLM contract as "strictly a JSON array of integers" while the
  code sends `response_format={"type": "json_object"}`, which forbids a top-level array (§6.3).

### 6.3 LLM filter
`src/infrastructure/llm.py`

- **Contradictory contract.** The prompt demands *"Respond ONLY with a JSON array of integers"*
  while `response_format={"type": "json_object"}` makes that impossible. Settle on
  `{"true_positives": [...]}` in prompt, code, and the aggregator README together.
- **No batching.** The comment says *"We process in batches to avoid token limits"* directly above
  code that sends every finding in one request. Implement real batching, or delete the comment.
- No `max_tokens`, no timeout, no retry.
- **Suppression is silent and unauditable** (§7.2 — this is a product decision, not a bug fix).

---

## 7. Decisions — ANSWERED 2026-08-12

1. **Does this tree ship, or stay a spike?** → **It ships.** All phases are in scope.
2. **LLM suppression policy.** → **Mark, never delete.** Suppressed findings are retained with a
   `suppressed_by_llm` field (and the model's reason), not dropped from the array. See §6.3.
3. **Queue substrate.** → **pg-boss.**
4. **Config source of truth.** → **The database.** Rules, rulesets, and quality gates are read from
   Postgres; migrations and seeders to be prepared. See §6.1.
5. **Deployment topology.** → **One process running all six workers.**

Decision 3 makes decision 5 safe: pg-boss claims jobs with `FOR UPDATE SKIP LOCKED`, so each job
goes to exactly one consumer and replicas no longer duplicate scans the way Pub/Sub broadcast did
(§4.1).

---

## 7b. BLOCKER discovered while acting on decision 1

Deciding that this tree ships collides with something already in production. This was not visible
when the plan was written and invalidates part of §4.1 as specified.

**The `security-scan` queue already has a consumer.**
`backend/src/services/code-analysis/domain/worker.ts` registers a pg-boss worker on
`SECURITY_SCAN_QUEUE = "security-scan"`. The Python gateway
(`src/services/gateway/worker.py:20`) polls `pgboss.job WHERE name = 'security-scan'`. They are the
same queue. Today nothing collides only because the Python tree is not deployed; the moment it
ships, every scan job is claimed nondeterministically by whichever consumer gets there first, and
scans silently split between two different scanners.

**The target table does not exist.**
The canonical schema has `scans` (migration 0015: TEXT id, organization_id, project_id,
connection_id, repo, branch, status, summary JSONB) and a normalized `findings` table (0016:
scan_id FK, rule_id, severity, message, file_path, start_line, end_line, snippet). The Python tree
writes to `security_scans` with a `findings JSONB` blob — a table that appears nowhere in
`supabase/migrations/`. As written, shipping it would write to a nonexistent table.

**Also relevant:** the TypeScript scanner already implements much of what this tree does — Semgrep,
SonarQube, custom regex rules, sensitive-data scanning, rule overrides, scan progress broadcasting.
`code-analysis/rules/opengrep/` is its rule corpus and is already tracked.

**Consequence for Phase 2.** §4.1 says "use per-engine pg-boss queues". That is still right for the
engine fan-out, but the *intake* queue and the *result* tables have to be settled first, because
every one of those choices is a different integration. Phase 2 is paused pending §7c.

### §7c — ANSWERED

- **Queue ownership** → **the Python pipeline replaces the TypeScript scanner** on `security-scan`.
- **Result tables** → **canonical `scans` + `findings`.**

Replacing the TS scanner is a bigger programme than §4.1 described, because that worker does
substantially more than this tree does. The parity gap is enumerated in §4c and **must close before
the TS worker is retired**. Until then both must not run: two consumers on `security-scan` split
jobs nondeterministically.

---

## 8. Phase 5 — Security hardening

This service clones and unpacks **untrusted repositories**, which raises the bar.
Each item below was verified empirically before being acted on; one turned out not to be a real
defect and is recorded as such rather than quietly fixed.

### 8.1 Symlink capture — **CONFIRMED, fixed**
`zip_directory` used `zipf.write()`, which dereferences symlinks. Reproduced against a fixture repo
containing `innocent-config.yml -> /tmp/host-credentials`: the archive contained the **contents** of
the host file (`SECRET_TOKEN=hunter2`) under an innocuous name, and would have been uploaded to S3.

Symlinks — files and directories — are now skipped. Nothing is lost: a link whose target is inside
the repo is already archived under its real path, and a link whose target is outside the repo is not
the repo's code.

### 8.2 `.git` upload — **CONFIRMED, fixed**
`zip_directory` walked everything, shipping full history (including `.git/config`, which commonly
carries a remote URL with an embedded token) to object storage on every scan. Now excluded via
`EXCLUDED_DIRS`. `.gitignore` is deliberately still archived — the exclusion matches path
components, not the substring `.git`.

### 8.3 Zip Slip — **NOT A DEFECT. The original plan was wrong.**
The earlier claim that `extractall()` was "mitigated only by the fact that you author the archive"
does not hold. CPython's `ZipFile.extract()` sanitizes member names before writing: it strips drive
letters, leading separators, and every `..` component. Verified on Python 3.9.6 with an archive
containing `../../escaped.txt` and `/abs/rooted.txt` — both landed inside the extraction root.
Members flagged as symlinks are written as ordinary files containing the target path, not as links.

No fix was applied, because there was nothing to fix. A regression test
(`test_extraction_cannot_escape_the_target_directory`) and a docstring now pin both properties, so
swapping in a different extraction library re-opens the question loudly.

### 8.4 Unvalidated `cloneUrl` — **CONFIRMED, fixed**
The URL went straight to `Repo.clone_from`. `validate_clone_url()` now enforces an https-only scheme
allowlist, rejecting `ext::` (which makes git execute an arbitrary command), `file://`, `ssh://`,
and `git://`, plus any value starting with `-` (which git parses as an option, e.g.
`--upload-pack=<command>`).

Host restriction is **opt-in** via `ALLOWED_CLONE_HOSTS` (comma-separated). A hardcoded allowlist of
github/gitlab/bitbucket was rejected because `DESCRIPTION.md` puts self-hosted GitLab in scope; when
the variable is unset any https host is accepted.

### 8.5 Clone credentials — **fixed**
`gateway/README.md` required routing credentials through the secret manager; nothing did. The
gateway now resolves an optional `GIT_CLONE_TOKEN` and injects it into the clone URL, falling back
to an anonymous clone when no token is configured (correct for public repos). `GIT_TERMINAL_PROMPT=0`
makes an auth-required clone fail fast rather than blocking a worker thread on a credential prompt.

Separately, the failure path wrote `str(err)` — which carries the full URL, token and all — to
stdout and to `pgboss.job.output`. All such paths now go through `redact_credentials()`.

**New environment variables:** `ALLOWED_CLONE_HOSTS` (optional), `GIT_CLONE_TOKEN` (optional secret).

### 8.6 Engine sandboxing — **OPEN, not addressed**
`semgrep`, `sonar-scanner`, and `codeql` all execute against attacker-supplied source. This tree
contains **no Dockerfile, compose file, or any other container configuration**, so as written the
engines run unsandboxed on the host, with whatever cloud credentials the process environment holds.

This is a deployment decision rather than a code change, so it is left open. It should be settled
alongside §7.5 (deployment topology): engines need a container with no host network and no cloud
credentials in the environment.

## 9. Phase 6 — Hygiene (P3)

- `get_redis_client()` (`redis_client.py`) builds a **new client and connection pool on every call**.
  Every `Service()` constructor calls it, and the API routers construct a service **per HTTP
  request**. Nothing is ever closed. Use a module-level singleton with `lifespan` cleanup.
- `config.py` raises `ValueError` at **import time** when `DATABASE_URL` is unset, so the whole app
  — including engines that never touch Postgres — fails to import. Defer to first use.
- `get_cloudflare_secret` is dead code that costs a network round trip: the Cloudflare branch
  fetches, loops, hits `pass`, and always falls through to `os.getenv`. Called twice per SonarQube
  job with no caching. Either implement it or drop to env-only.
- `complete_job` catches DB write failures and only prints, leaving the job `active` with no retry.
- `security_scans` has no `job_id`, no `project_id`, and no tenant column; `findings JSONB` as an
  opaque blob makes findings unqueryable and undedupable, and does not match the multi-tenant model
  in `DESCRIPTION.md`.
- `import boto3` at module scope in `storage.py` is required even for the local mock path.

---

## 10. Suggested execution order

| Step | Content | Gate |
| ---- | ------- | ---- |
| 1 | Phase 0 (§2) | Tests collect; tree committed |
| 2 | Phase 1 (§3) | Findings survive the round trip |
| 3 | Decisions §7.1–§7.3 | — |
| 4 | Phase 2 (§4) | Kill an engine mid-scan → explicit failure, no hang |
| 5 | Phase 5 (§8) | Symlink/zip-slip/`.git` fixtures rejected |
| 6 | Phase 3 (§5) | Per-engine fixture repos yield expected findings |
| 7 | Decisions §7.4–§7.5, then Phase 4 (§6) | Docs match code |
| 8 | Phase 6 (§9) | — |

Phases 1 and 5 are independent of the §7 decisions and can proceed immediately.
Phase 5 is ordered before Phase 3 deliberately: hardening the untrusted-input path matters more
than improving detection quality on input that is not yet safely handled.

---

## 11. Explicitly out of scope

Per [`DESCRIPTION.md`](DESCRIPTION.md) non-goals, this plan does **not** propose: scheduled or
webhook-triggered scanning, monorepo-aware per-package scanning, DAST/IAST/container scanning,
runtime monitoring, or user-selectable LLM models.

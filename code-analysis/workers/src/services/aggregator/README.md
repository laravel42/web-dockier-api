# Aggregator Service

## What it does
Consumes `scan-results`, waits for all four engines to report for a job, then
dedupes, judges and persists.

1. **Barrier** — Redis set per job, TTL-bounded so an abandoned scan stops
   leaking keys. Exactly one caller finalizes, claimed with `SET NX`.
2. **Dedupe** — the same vulnerability found by several engines becomes one
   finding, at the highest severity any of them assigned.
3. **LLM judging** — marks false positives; **never removes them**.
4. **Persist** — `findings` rows and the `scans` row, plus the quality gate.

## Input — pg-boss queue `scan-results`
`ScanResult`. Malformed messages are rejected rather than aggregated.

## Output
Rows in `findings`, and `scans.status` / `summary` / `engine_status` /
`quality_gate_status`.

## Conventions
- **Suppression is a marked state, never a deletion.** `LLMProvider.judge()`
  returns every finding with `suppressed_by_llm` and `suppression_reason` set.
  A model omitting an index must not silently erase a vulnerability; filtered
  views select `WHERE NOT suppressed_by_llm`.
- The LLM contract is a JSON **object** — `{"false_positives": [...], "reason": "..."}`.
  `response_format: json_object` forbids a top-level array, so a prompt demanding
  one cannot be satisfied.
- `scans.status` is a closed enum (`pending|running|completed|failed`). A degraded
  scan is `completed` with `summary.partial` and `scans.engine_status` carrying
  the detail — do not invent a status the API will reject.
- A scan with any failed engine gets **no** quality-gate verdict: the engine that
  died is exactly the one that might have found the error.

## HTTP
`GET /aggregator/status` — health check.

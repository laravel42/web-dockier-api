# Regex Engine

## What it does
Applies custom rules loaded from the `custom_rules` table and runs sensitive-data classification over schema and model files, in a single walk of the tree.

## Input — pg-boss queue `scan-regex`
`ScanMessage`:
```json
{
  "job_id": "uuid", "scan_id": "uuid",
  "uri": "s3://bucket/codebases/<scan_id>.zip",
  "language": "python", "languages": ["python", "javascript"],
  "commit_sha": "abc123", "tenant_id": "org-id",
  "options": { "enable_regex": true }
}
```

## Output — pg-boss queue `scan-results`
`ScanResult`. `status` is `"ok"` or `"failed"`; a failed engine publishes an
empty findings list **with `status: "failed"`** so the aggregator never reads it
as a clean scan.

## Conventions
- Report an outcome via `self._publish(...)` (`services/base.py`) rather than
  constructing a payload by hand — the success and failure paths drifted apart
  when each engine built its own.
- Engine failures must raise or publish `status: "failed"`. Returning an empty
  findings list on error is silent under-reporting.
- Findings carry `line`, `end_line` and `snippet`; the dedupe key is
  (rule, path, span), so a collapsed span loses cross-engine deduplication.
- Honour `options.enable_regex`: a disabled engine reports `"ok"` with no
  findings, not a failure.

## HTTP
`POST /regex/scan` enqueues onto `scan-regex`. It does not run the scan inline.

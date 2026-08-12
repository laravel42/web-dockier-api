# Regex Service

## High Level Description
The Regex Service is a lightweight scanner engine that matches a set of pre-compiled regular expressions against plain text files in the target repository. It's designed to catch common edge cases or proprietary secrets that traditional AST-based analyzers like Semgrep might miss. It subscribes to `scan:regex` via Redis Pub/Sub, downloads the zipped source, and performs a line-by-line regex sweep.

## API Doc
### Input Payload (Redis Pub/Sub `scan:regex`)
```json
{
  "job_id": "uuid-string",
  "scan_id": "uuid-string",
  "uri": "s3://bucket/codebases/abcdef123456.zip",
  "language": "python",
  "commit_sha": "abcdef123456"
}
```

### Output Payload (Redis Pub/Sub `scan:results`)
```json
{
  "job_id": "uuid-string",
  "scan_id": "uuid-string",
  "engine": "regex",
  "findings": [
    {
      "rule_id": "dockier-hardcoded-secret",
      "severity": "error",
      "message": "Potential hardcoded credential or secret key exposed in cleartext.",
      "file_path": "config.json",
      "line": 12
    }
  ]
}
```

## LLM Instructions
When modifying or extending the rules in `src/services/regex/rules.py`, you must structure them as `CUSTOM_RULES` objects containing `id`, `regex`, `message`, and `severity`. Do not rely on Python's advanced lookbehinds if they are not standard, as they can cause ReDoS issues during large file processing.

## MVC Endpoints
When deployed via FastAPI, this service exposes:
- `POST /regex/scan`: Forces the Regex engine to download and process a repository directly via an HTTP request, returning findings asynchronously to the aggregator queue.

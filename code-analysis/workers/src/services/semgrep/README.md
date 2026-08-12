# Semgrep Service

## High Level Description
The Semgrep Service acts as a downstream worker for the Gateway Service. It listens for newly packaged scan jobs via Redis Pub/Sub, downloads the zipped codebase from object storage, extracts it locally, and executes the native `semgrep` CLI against the codebase. The raw findings are mapped to a standardized `ScanFinding` model and published back to the `scan:results` channel for aggregation.

## API Doc
### Input Payload (Redis Pub/Sub `scan:semgrep`)
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
  "engine": "semgrep",
  "findings": [
    {
      "rule_id": "python.django.security.injection",
      "severity": "high",
      "message": "Detected SQL injection vulnerability",
      "file_path": "models.py",
      "line": 42
    }
  ]
}
```

## LLM Instructions
This service wraps an external CLI binary (`semgrep`). If suggesting modifications to `run_scan`, do not write custom static analysis AST parsing; rely entirely on Semgrep's JSON output parsing. Ensure that `subprocess.run` captures stderr if debugging is needed, but only `stdout` should be parsed as JSON.

## MVC Endpoints
When deployed via FastAPI, this service exposes:
- `POST /semgrep/scan`: Force the engine to download and scan a specific repository zip payload without waiting for Redis.

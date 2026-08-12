# CodeQL Service

## High Level Description
The CodeQL Service integrates GitHub's native CodeQL semantic analysis engine. It subscribes to the `scan:codeql` Redis channel, extracts the source code, compiles it into a relational CodeQL database, and executes language-specific security query suites against that database. Finally, it parses the resulting SARIF output format into the standardized `ScanFinding` model and publishes the findings to the aggregator.

## API Doc
### Input Payload (Redis Pub/Sub `scan:codeql`)
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
  "engine": "codeql",
  "findings": [
    {
      "rule_id": "py/sql-injection",
      "severity": "medium",
      "message": "This query depends on a user-provided value.",
      "file_path": "main.py",
      "line": 45
    }
  ]
}
```

## LLM Instructions
This service executes a heavy compiled language semantic analysis engine (`codeql`). It has a hard dependency on the detected `language` field from the Gateway. If modifying this service, note that the parsing logic must correctly interpret SARIF format `runs[].results[]`. Also, handle the graceful degradation mock SARIF generation if the CodeQL binary is missing on the host.

## MVC Endpoints
When deployed via FastAPI, this service exposes:
- `POST /codeql/scan`: Directly trigger a CodeQL database creation and analysis on a specific project payload without routing through Redis first.

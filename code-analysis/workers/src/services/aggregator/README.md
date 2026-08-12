# Aggregator Service

## High Level Description
The Aggregator Service collects findings from all running engine scanners (Semgrep, Regex, SonarQube, CodeQL) for a specific job via Redis. Once all configured engines have completed and published their results, the aggregator combines them, sends the combined raw findings to an LLM provider for false-positive filtering, and finally persists the filtered results back to the PostgreSQL database.

## API Doc
### Input Payload (Redis Pub/Sub `scan:results`)
```json
{
  "job_id": "uuid-string",
  "scan_id": "uuid-string",
  "engine": "semgrep",
  "findings": [
    {
      "rule_id": "example-rule",
      "severity": "high",
      "message": "Potential issue",
      "file_path": "src/main.py",
      "line": 15
    }
  ]
}
```

### Output
The Aggregator does not publish to Redis; instead, it executes SQL `UPDATE` commands on the `pgboss.job` and `security_scans` tables containing the final filtered JSON payload.

## LLM Instructions
When modifying the Aggregator's LLM prompt in `src/infrastructure/llm.py`, ensure that the output format strictly remains a JSON array of integers (`[0, 1, 3]`). Do not instruct the LLM to return markdown blocks or descriptions, as the JSON parsing logic expects a raw array or a strictly structured JSON object.

## MVC Endpoints
When deployed via FastAPI, this service exposes:
- `GET /aggregator/status`: Health check endpoint for monitoring aggregator status.

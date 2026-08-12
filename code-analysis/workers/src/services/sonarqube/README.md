# SonarQube Service

## High Level Description
The SonarQube Service integrates with an external SonarQube instance to perform comprehensive code quality and vulnerability analysis. It listens to the `scan:sonarqube` Redis channel, extracts the target codebase, triggers the `sonar-scanner` CLI tool locally, and then asynchronously fetches the generated issues directly from the SonarQube REST API. Findings are normalized into `ScanFinding` payloads and sent to the aggregator.

## API Doc
### Input Payload (Redis Pub/Sub `scan:sonarqube`)
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
  "engine": "sonarqube",
  "findings": [
    {
      "rule_id": "python:S107",
      "severity": "major",
      "message": "Functions should not have too many parameters",
      "file_path": "utils.py",
      "line": 40
    }
  ]
}
```

## LLM Instructions
When expanding this service, ensure that credentials (`SONAR_HOST_URL` and `SONAR_TOKEN`) are securely fetched from the `src.infrastructure.secret_manager` module and are never logged or hardcoded. The sleep duration simulating Compute Engine execution (`await asyncio.sleep(5)`) should ideally be replaced with proper task polling via the SonarQube Web API (`api/ce/task`) in production.

## MVC Endpoints
When deployed via FastAPI, this service exposes:
- `POST /sonarqube/scan`: Force the engine to manually invoke the Sonar scanner for a given payload, returning immediately and sending results to the aggregator queue.

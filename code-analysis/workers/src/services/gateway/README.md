# Gateway Service

## High Level Description
The Gateway Service acts as the entrypoint for all SAST scanning jobs. It pulls pending scanning tasks from the `pgboss` job queue, clones the target repository, zips and uploads the codebase to the configured object storage (S3 or mock storage), and delegates the scanning workload to downstream analysis engines (e.g., Semgrep, Regex, CodeQL, SonarQube) by publishing a message via Redis Pub/Sub.

## API Doc
### Input Payload (pgboss)
```json
{
  "scanId": "uuid-string",
  "cloneUrl": "https://github.com/org/repo.git",
  "commitSha": "abcdef123456"
}
```

### Pub/Sub Output Payload
The Gateway publishes to multiple Redis channels (`scan:semgrep`, `scan:regex`, etc.) with the `ScanMessage` schema:
```json
{
  "job_id": "uuid-string",
  "scan_id": "uuid-string",
  "uri": "s3://bucket/codebases/abcdef123456.zip",
  "language": "python",
  "commit_sha": "abcdef123456"
}
```

## LLM Instructions
When extending this service, ensure that any new language detection logic added to `_detect_language` does not perform deep file system traversal that would block the asyncio thread. Use lightweight heuristics. When handling repository credentials for `cloneUrl`, use the `SecretManager` (infrastructure) rather than logging or hardcoding tokens.

## MVC Endpoints
When deployed with FastAPI, this service exposes the following HTTP endpoints:
- `POST /gateway/scan`: A manual trigger to force the Gateway to process a repository immediately without waiting for the `pgboss` queue polling mechanism. Returns `200 Accepted`.

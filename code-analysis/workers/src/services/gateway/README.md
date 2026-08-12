# Gateway Service

## What it does
Consumes the `security-scan` pg-boss queue — the same queue the backend API
enqueues onto — resolves what to clone from the database, clones and uploads the
codebase, and fans the job out to the four engine queues.

## Input — pg-boss queue `security-scan`
The backend's `ScanJobInput`. Note it carries **no clone URL**:
```json
{ "scanId": "uuid", "tenantId": "org-id", "options": {}, "correlationId": "req-id" }
```
Repo, branch and commit come from the `scans` row; credentials come from
`git_connections`, scoped to the tenant.

## Output
A `ScanMessage` on each of `scan-semgrep`, `scan-regex`, `scan-sonarqube`,
`scan-codeql`.

## Security
The gateway is the only component handling untrusted input from outside the
platform:
- **Clone URLs are https-only.** `ext::` (arbitrary command execution),
  `file://`, `ssh://`, `git://` and any value starting with `-` are rejected. Set
  `ALLOWED_CLONE_HOSTS` to restrict further; unset means any https host, which
  self-hosted GitLab needs.
- **Credentials never leave the clone URL.** They are not logged, not published,
  and not persisted — `redact_credentials()` guards every such path.
- **Connection lookups are tenant-scoped.** Without that filter a guessed
  connection id would clone another organization's private repository.
- Archives exclude `.git` and skip symlinks (`infrastructure/storage.py`).

## Conventions
- `detect_languages` must stay bounded and off the event loop. It returns *every*
  language found: CodeQL builds one database per language, and returning a single
  value silently skipped the rest of a polyglot repo.
- Cancellation is checked between phases and completes the job quietly — it is
  what the user asked for, and failing would make pg-boss retry it.

## HTTP
`POST /gateway/scan` enqueues onto `security-scan`.

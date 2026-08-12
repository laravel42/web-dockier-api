# Dockier SAST Workers Architecture

This repository contains the backend analysis components for Dockier's Static Application Security Testing (SAST) platform. The workers are organized using a microservices-inspired architecture running on top of FastAPI, managed by asynchronous background tasks and a Redis Pub/Sub event bus.

## Directory Structure

```text
src/
├── infrastructure/
│   ├── config.py         # Global configuration (Postgres, Redis, APIs)
│   ├── db_client.py      # AsyncPG connection pooling
│   ├── redis_client.py   # Redis setup and dependency injection
│   ├── llm.py            # AI LLM Provider integration (OpenAI/Mock)
│   ├── secret_manager.py # Mock cloudflare secret retrieval
│   └── storage.py        # Codebase zip extraction and Object storage (S3/Mock)
├── models/
│   ├── schemas.py        # Shared Pydantic data models (ScanFinding, ScanMessage)
│   └── __init__.py
├── services/
│   ├── aggregator/       # Collects findings from engines and filters false positives using LLMs
│   ├── codeql/           # Runs GitHub CodeQL engine locally
│   ├── gateway/          # Serves as the entrypoint reading from pgboss, cloning repos, broadcasting via Redis
│   ├── regex/            # Runs extremely fast custom regular expression rules (secrets, basic flaws)
│   ├── semgrep/          # Executes semantic grep (semgrep) against the extracted zip payload
│   └── sonarqube/        # Triggers sonar-scanner and calls the SonarQube API for findings
└── main.py               # The FastAPI application mounting all API endpoints and background workers
```

## Running the Application

Ensure Redis and PostgreSQL are running, then launch the FastAPI server (which automatically spawns the queue workers in the background).

```bash
uvicorn src.main:app --reload
```

## Architecture Notes
- Each engine (e.g. Semgrep, CodeQL) runs as a modular service. It exposes HTTP endpoints (MVC) via FastAPI for manual testing while also polling a dedicated Redis channel (e.g. `scan:semgrep`) for asynchronous job processing.
- The `gateway` fetches jobs from the Postgres `pgboss` queue, clones repositories, uploads them via `storage`, and fans out messages to the engines.
- The `aggregator` waits for all expected engines (`EXPECTED_ENGINES`) to complete, merges results, runs LLM false-positive filtering, and finalizes the `security_scans` table.

"""
Minimal pg-boss v12 client (decision §7.3).

Redis Pub/Sub was replaced because it is at-most-once and broadcast: a message
published while an engine restarted was gone for good, and every replica
subscribed to a channel ran every scan. pg-boss claims each job with
FOR UPDATE SKIP LOCKED, so a job goes to exactly one consumer and survives a
restart.

Scope and divergence, deliberately documented:
  * Queue creation calls pg-boss's own shipped SQL function
    `pgboss.create_queue(name, options)` rather than reimplementing partition
    management. `pgboss.job` is LIST-partitioned by `name` in v12, so INSERTs
    route themselves once the partition exists.
  * Retry is an in-place UPDATE (state back to 'created', retry_count + 1,
    start_after pushed out). pg-boss itself does DELETE + re-INSERT. Since a
    retry keeps the same queue name it stays in the same partition either way,
    so the observable behaviour matches; reimplementing the delete/insert dance
    was judged more likely to lose jobs than to gain anything.
  * Not implemented: priorities, singleton keys, group concurrency, dead-letter
    routing, heartbeats. None are used by the scan pipeline. Anything relying on
    them must go through the TypeScript client.
"""

import json
import uuid
from typing import Any, Dict, List, Optional

from src.infrastructure.db_client import execute_query, fetch_all, fetch_row, get_db_pool

# Intake queue, owned by the backend's API and consumed here.
SECURITY_SCAN_QUEUE = "security-scan"

# Per-engine fan-out queues.
ENGINE_QUEUES = {
    "semgrep": "scan-semgrep",
    "regex": "scan-regex",
    "bearer": "scan-bearer",
    "codeql": "scan-codeql",
}

RESULTS_QUEUE = "scan-results"

ALL_QUEUES = [SECURITY_SCAN_QUEUE, *ENGINE_QUEUES.values(), RESULTS_QUEUE]

DEFAULT_RETRY_LIMIT = 2
DEFAULT_EXPIRE_SECONDS = 3600
DEFAULT_RETRY_DELAY_SECONDS = 30


async def create_queue(name: str, retry_limit: int = DEFAULT_RETRY_LIMIT,
                       expire_seconds: int = DEFAULT_EXPIRE_SECONDS) -> None:
    """Idempotently register a queue and its partition via pg-boss's own function.

    The option keys are camelCase (`retryLimit`, `expireInSeconds`) and `policy`
    is read straight into a NOT NULL column, so a snake_case or missing key fails
    at insert time rather than defaulting. pg-boss wraps this call in an advisory
    lock; two workers starting at once would otherwise race on partition creation.
    """
    # Passed as a dict, not a pre-serialized string: db_client registers a jsonb
    # codec, so a str parameter would be json.dumps()'d a second time and arrive
    # as a JSON string. `options->>'policy'` on a JSON string is NULL, which the
    # NOT NULL column rejects — silently, in the sense that the cause is nowhere
    # near the symptom.
    options = {
        "policy": "standard",
        "partition": True,
        "retryLimit": retry_limit,
        "expireInSeconds": expire_seconds,
    }

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtext('pgboss.create_queue'))")
            await conn.execute("SELECT pgboss.create_queue($1, $2)", name, options)


async def ensure_queues() -> None:
    for name in ALL_QUEUES:
        await create_queue(name)


async def send(name: str, data: Dict[str, Any], retry_limit: int = DEFAULT_RETRY_LIMIT,
               expire_seconds: int = DEFAULT_EXPIRE_SECONDS) -> str:
    job_id = str(uuid.uuid4())
    await execute_query(
        "INSERT INTO pgboss.job (id, name, data, retry_limit, expire_seconds) "
        "VALUES ($1::uuid, $2, $3, $4, $5)",
        job_id, name, data, retry_limit, expire_seconds,
    )
    return job_id


async def fetch(name: str, limit: int = 1) -> List[Dict[str, Any]]:
    """Claim up to `limit` jobs.

    `state < 'active'` covers both 'created' and 'retry'; job_state is an enum
    whose declaration order makes that comparison meaningful. SKIP LOCKED is what
    makes two replicas safe — the property Pub/Sub never had.
    """
    rows = await fetch_all(
        """
        WITH next AS (
            SELECT id FROM pgboss.job
            WHERE name = $1
              AND state < 'active'
              AND start_after < now()
            ORDER BY priority DESC, created_on, id
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE pgboss.job j
        SET state = 'active', started_on = now()
        FROM next
        WHERE j.id = next.id
        RETURNING j.id, j.data, j.retry_count, j.retry_limit
        """,
        name, limit,
    )
    return [
        {"id": str(r["id"]), "data": r["data"], "retry_count": r["retry_count"],
         "retry_limit": r["retry_limit"]}
        for r in rows
    ]


async def complete(name: str, job_id: str, output: Optional[Dict[str, Any]] = None) -> None:
    await execute_query(
        "UPDATE pgboss.job SET state = 'completed', completed_on = now(), output = $3 "
        "WHERE name = $1 AND id = $2::uuid AND state = 'active'",
        name, job_id, output or {},
    )


async def fail(name: str, job_id: str, error: str,
               retry_delay_seconds: int = DEFAULT_RETRY_DELAY_SECONDS) -> bool:
    """Fail a job, returning True when it was scheduled for another attempt.

    retry_count is incremented here rather than at claim time, matching pg-boss:
    the first attempt runs with retry_count 0, so retry_limit=2 yields three
    attempts in total, not two.
    """
    row = await fetch_row(
        f"""
        UPDATE pgboss.job
        SET retry_count = retry_count + 1,
            state = CASE WHEN retry_count < retry_limit THEN 'created'::pgboss.job_state
                         ELSE 'failed'::pgboss.job_state END,
            start_after = CASE WHEN retry_count < retry_limit
                               THEN now() + ($3 || ' seconds')::interval
                               ELSE start_after END,
            completed_on = CASE WHEN retry_count < retry_limit THEN NULL ELSE now() END,
            output = $4
        WHERE name = $1 AND id = $2::uuid AND state = 'active'
        RETURNING state
        """,
        name, job_id, str(retry_delay_seconds), {"error": error},
    )
    return bool(row and str(row["state"]) == "created")


async def reap_expired(name: str) -> int:
    """Return jobs stuck 'active' past their expiry to the queue.

    Without this a worker that dies mid-job strands it in 'active' forever —
    §4.4. pg-boss's own maintenance does this; running it here as well keeps the
    Python workers self-sufficient when the TypeScript side is not running.
    """
    row = await fetch_row(
        """
        WITH expired AS (
            UPDATE pgboss.job
            SET state = CASE WHEN retry_count < retry_limit THEN 'created'::pgboss.job_state
                             ELSE 'failed'::pgboss.job_state END,
                start_after = now(),
                output = jsonb_build_object('error', 'job expired while active')
            WHERE name = $1
              AND state = 'active'
              AND started_on < now() - (expire_seconds || ' seconds')::interval
            RETURNING id
        )
        SELECT COUNT(*) AS n FROM expired
        """,
        name,
    )
    return int(row["n"]) if row else 0

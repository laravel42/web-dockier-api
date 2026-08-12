"""
Builds the FastAPI app for a single service.

Each worker service exposes the same small surface so the router — and any
operator — can treat them uniformly:

    GET  /health   liveness plus this service's queue depth
    GET  /info     what this service is and which queue it consumes
    POST /trigger  enqueue a job onto this service's queue (manual testing)

The public tenant API is a service too, but carries the `/sast` routes instead
of a worker loop.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import APIRouter, FastAPI

from src.api.errors import register_error_handlers
from src.infrastructure import queue
from src.infrastructure.db_client import close_pool, fetch_row
from src.infrastructure.redis_client import close_redis_client
from src.service_registry import ServiceSpec
from src.services.worker_runtime import supervise

# name -> (queue name, worker factory). Imported lazily inside the factory so a
# service only pulls in the engine code it actually runs.
WORKER_BUILDERS = {
    "gateway": ("src.services.gateway.worker", queue.SECURITY_SCAN_QUEUE),
    "aggregator": ("src.services.aggregator.worker", queue.RESULTS_QUEUE),
    "semgrep": ("src.services.semgrep.worker", queue.ENGINE_QUEUES["semgrep"]),
    "regex": ("src.services.regex.worker", queue.ENGINE_QUEUES["regex"]),
    "sonarqube": ("src.services.sonarqube.worker", queue.ENGINE_QUEUES["sonarqube"]),
    "codeql": ("src.services.codeql.worker", queue.ENGINE_QUEUES["codeql"]),
}


async def _queue_depth(queue_name: str) -> Dict[str, int]:
    row = await fetch_row(
        "SELECT COUNT(*) FILTER (WHERE state < 'active') AS queued, "
        "       COUNT(*) FILTER (WHERE state = 'active') AS active "
        "FROM pgboss.job WHERE name = $1",
        queue_name,
    )
    return {"queued": int(row["queued"]), "active": int(row["active"])} if row else {"queued": 0, "active": 0}


def build_app(spec: ServiceSpec) -> FastAPI:
    entry = WORKER_BUILDERS.get(spec.name)
    queue_name = entry[1] if entry else None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Only the service that owns a queue registers it, so a partial
        # deployment does not silently create queues nothing consumes.
        if queue_name:
            await queue.create_queue(queue_name)
        else:
            await queue.ensure_queues()

        worker_task = None
        if entry:
            module = __import__(entry[0], fromlist=["build_worker"])
            worker = module.build_worker()
            app.state.worker = worker
            worker_task = asyncio.create_task(supervise(worker))
            print(f"[*] {spec.name}: worker consuming {queue_name!r}")
        else:
            print(f"[*] {spec.name}: serving the public API (no worker loop)")

        try:
            yield
        finally:
            if entry:
                app.state.worker.stop()
                worker_task.cancel()
                await asyncio.gather(worker_task, return_exceptions=True)
            await close_redis_client()
            await close_pool()

    app = FastAPI(
        title=f"Dockier SAST — {spec.name}",
        description=spec.description,
        version="1.0.0",
        lifespan=lifespan,
    )
    register_error_handlers(app)

    ops = APIRouter(tags=["Service"])

    @ops.get("/info")
    async def info() -> Dict[str, Any]:
        return {
            "service": spec.name,
            "description": spec.description,
            "queue": queue_name,
            "port": spec.port,
        }

    @ops.get("/health")
    async def health() -> Dict[str, Any]:
        try:
            depth = await _queue_depth(queue_name) if queue_name else {}
            return {"status": "ok", "service": spec.name, "database": True, "queue": depth}
        except Exception as e:
            print(f"[!] {spec.name}: health check failed: {e}")
            return {"status": "degraded", "service": spec.name, "database": False, "queue": {}}

    if queue_name:
        @ops.post("/trigger")
        async def trigger(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
            """Enqueue a job onto this service's queue.

            For manual testing. It enqueues rather than running inline, so a
            triggered job obeys the same concurrency cap, retries and expiry as
            any other.
            """
            job_id = await queue.send(queue_name, payload or {})
            return {"status": "queued", "service": spec.name, "queue": queue_name, "jobId": job_id}

    app.include_router(ops)

    if spec.name == "api":
        from src.api.routes import router as sast_router
        app.include_router(sast_router)

    return app

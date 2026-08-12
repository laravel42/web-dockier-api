import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.services.gateway.api import router as gateway_router
from src.services.aggregator.api import router as aggregator_router
from src.services.semgrep.api import router as semgrep_router
from src.services.regex.api import router as regex_router
from src.services.sonarqube.api import router as sonarqube_router
from src.services.codeql.api import router as codeql_router

from src.services.gateway.worker import build_worker as build_gateway_worker
from src.services.aggregator.worker import build_worker as build_aggregator_worker
from src.services.semgrep.worker import build_worker as build_semgrep_worker
from src.services.regex.worker import build_worker as build_regex_worker
from src.services.sonarqube.worker import build_worker as build_sonarqube_worker
from src.services.codeql.worker import build_worker as build_codeql_worker
from src.services.worker_runtime import supervise

from src.infrastructure import queue
from src.infrastructure.db_client import close_pool
from src.infrastructure.redis_client import close_redis_client

WORKER_BUILDERS = (
    build_gateway_worker,
    build_aggregator_worker,
    build_semgrep_worker,
    build_regex_worker,
    build_sonarqube_worker,
    build_codeql_worker,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the six workers, and stop them cleanly.

    Replaces @app.on_event, deprecated since FastAPI 0.109. Worker tasks are
    retained on the app so they are not garbage-collected mid-flight, and each
    runs under `supervise`, which restarts a crashed loop instead of letting the
    engine go permanently silent.
    """
    print("[*] Dockier SAST API starting. Registering queues...")
    await queue.ensure_queues()

    workers = [build() for build in WORKER_BUILDERS]
    app.state.workers = workers
    app.state.worker_tasks = [asyncio.create_task(supervise(w)) for w in workers]
    print(f"[*] {len(workers)} workers running.")

    try:
        yield
    finally:
        print("[*] Shutting down workers...")
        for worker in workers:
            worker.stop()
        for task in app.state.worker_tasks:
            task.cancel()
        await asyncio.gather(*app.state.worker_tasks, return_exceptions=True)
        await close_redis_client()
        await close_pool()
        print("[*] Shutdown complete.")


app = FastAPI(title="Dockier SAST Workers", version="1.0.0", lifespan=lifespan)

app.include_router(gateway_router)
app.include_router(aggregator_router)
app.include_router(semgrep_router)
app.include_router(regex_router)
app.include_router(sonarqube_router)
app.include_router(codeql_router)


@app.get("/")
def read_root():
    return {"message": "Dockier SAST Workers API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)

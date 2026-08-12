from fastapi import APIRouter

from src.infrastructure import queue
from src.models.schemas import ScanMessage

router = APIRouter(prefix="/codeql", tags=["codeql Engine"])


@router.post("/scan")
async def trigger_scan(request: ScanMessage):
    """Enqueue a scan on this engine's queue.

    Previously this ran the job inline as a FastAPI BackgroundTask, bypassing the
    concurrency cap and retry semantics that every queued job gets.
    """
    job_id = await queue.send(queue.ENGINE_QUEUES["codeql"], request.model_dump())
    return {"status": "accepted", "engine": "codeql", "job_id": job_id}

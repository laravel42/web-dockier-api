from fastapi import APIRouter

from src.infrastructure import queue
from src.models.schemas import ScanMessage

router = APIRouter(prefix="/bearer", tags=["bearer Engine"])


@router.post("/scan")
async def enqueue_scan(request: ScanMessage):
    job_id = await queue.send(queue.ENGINE_QUEUES["bearer"], request.model_dump())
    return {"status": "accepted", "engine": "bearer", "job_id": job_id}

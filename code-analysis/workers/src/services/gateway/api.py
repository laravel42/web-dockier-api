from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Dict, Optional

from src.infrastructure import queue

router = APIRouter(prefix="/gateway", tags=["Gateway"])


class ScanRequest(BaseModel):
    scan_id: str
    tenant_id: str
    options: Optional[Dict[str, Any]] = None


@router.post("/scan")
async def trigger_scan(request: ScanRequest):
    """Manual trigger for a scan.

    Enqueues onto the same `security-scan` queue the backend uses rather than
    running inline: a manual scan must obey the same concurrency cap, retry and
    reaper behaviour as every other job.
    """
    job_id = await queue.send(queue.SECURITY_SCAN_QUEUE, {
        "scanId": request.scan_id,
        "tenantId": request.tenant_id,
        "options": request.options or {},
    })
    return {"status": "accepted", "job_id": job_id, "scan_id": request.scan_id}

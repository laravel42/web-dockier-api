from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from src.services.gateway.service import GatewayService

router = APIRouter(prefix="/gateway", tags=["Gateway"])

class ScanRequest(BaseModel):
    job_id: str
    scan_id: str
    cloneUrl: str
    commitSha: str

@router.post("/scan")
async def trigger_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """
    MVC Endpoint to trigger a scan manually without pgboss.
    """
    service = GatewayService()
    # Execute as a background task to return 200 OK immediately
    background_tasks.add_task(
        service.process_job,
        request.job_id,
        {
            "scanId": request.scan_id,
            "cloneUrl": request.cloneUrl,
            "commitSha": request.commitSha
        }
    )
    return {"status": "accepted", "job_id": request.job_id}

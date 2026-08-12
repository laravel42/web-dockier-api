from fastapi import APIRouter, BackgroundTasks
from src.models.schemas import ScanMessage
from src.services.semgrep.service import SemgrepService

router = APIRouter(prefix="/semgrep", tags=["Semgrep Engine"])

@router.post("/scan")
async def trigger_scan(request: ScanMessage, background_tasks: BackgroundTasks):
    """
    MVC Endpoint to trigger a semgrep scan directly.
    """
    service = SemgrepService()
    background_tasks.add_task(service.process_job, request.model_dump())
    return {"status": "accepted", "engine": "semgrep", "job_id": request.job_id}

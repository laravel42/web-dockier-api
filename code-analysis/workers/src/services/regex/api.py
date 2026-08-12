from fastapi import APIRouter, BackgroundTasks
from src.models.schemas import ScanMessage
from src.services.regex.service import RegexService

router = APIRouter(prefix="/regex", tags=["Regex Engine"])

@router.post("/scan")
async def trigger_scan(request: ScanMessage, background_tasks: BackgroundTasks):
    """
    MVC Endpoint to trigger a regex scan directly.
    """
    service = RegexService()
    background_tasks.add_task(service.process_job, request.model_dump())
    return {"status": "accepted", "engine": "regex", "job_id": request.job_id}

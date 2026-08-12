from fastapi import APIRouter, BackgroundTasks
from src.models.schemas import ScanMessage
from src.services.codeql.service import CodeQLService

router = APIRouter(prefix="/codeql", tags=["CodeQL Engine"])

@router.post("/scan")
async def trigger_scan(request: ScanMessage, background_tasks: BackgroundTasks):
    """
    MVC Endpoint to trigger a codeql scan directly.
    """
    service = CodeQLService()
    background_tasks.add_task(service.process_job, request.model_dump())
    return {"status": "accepted", "engine": "codeql", "job_id": request.job_id}

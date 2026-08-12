from fastapi import APIRouter, BackgroundTasks
from src.models.schemas import ScanMessage
from src.services.sonarqube.service import SonarQubeService

router = APIRouter(prefix="/sonarqube", tags=["SonarQube Engine"])

@router.post("/scan")
async def trigger_scan(request: ScanMessage, background_tasks: BackgroundTasks):
    """
    MVC Endpoint to trigger a sonarqube scan directly.
    """
    service = SonarQubeService()
    background_tasks.add_task(service.process_job, request.model_dump())
    return {"status": "accepted", "engine": "sonarqube", "job_id": request.job_id}

from fastapi import APIRouter
from src.services.aggregator.service import AggregatorService

router = APIRouter(prefix="/aggregator", tags=["Aggregator"])

@router.get("/status")
async def get_status():
    """
    MVC Endpoint to check the status of the aggregator service.
    """
    return {"status": "ok", "service": "aggregator"}

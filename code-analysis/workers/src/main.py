import asyncio
from fastapi import FastAPI


from src.services.gateway.api import router as gateway_router
from src.services.aggregator.api import router as aggregator_router
from src.services.semgrep.api import router as semgrep_router
from src.services.regex.api import router as regex_router
from src.services.sonarqube.api import router as sonarqube_router
from src.services.codeql.api import router as codeql_router

from src.services.gateway.worker import start_gateway_worker
from src.services.aggregator.worker import start_aggregator_worker
from src.services.semgrep.worker import start_semgrep_worker
from src.services.regex.worker import start_regex_worker
from src.services.sonarqube.worker import start_sonarqube_worker
from src.services.codeql.worker import start_codeql_worker

from src.infrastructure.db_client import close_pool

app = FastAPI(title="Dockier SAST Workers", version="1.0.0")

# Mount Routers
app.include_router(gateway_router)
app.include_router(aggregator_router)
app.include_router(semgrep_router)
app.include_router(regex_router)
app.include_router(sonarqube_router)
app.include_router(codeql_router)

@app.on_event("startup")
async def startup_event():
    print("[*] Dockier SAST API started. Launching background workers...")
    asyncio.create_task(start_gateway_worker())
    asyncio.create_task(start_aggregator_worker())
    asyncio.create_task(start_semgrep_worker())
    asyncio.create_task(start_regex_worker())
    asyncio.create_task(start_sonarqube_worker())
    asyncio.create_task(start_codeql_worker())

@app.on_event("shutdown")
async def shutdown_event():
    print("[*] Shutting down, cleaning up DB pool...")
    await close_pool()

@app.get("/")
def read_root():
    return {"message": "Dockier SAST Workers API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)

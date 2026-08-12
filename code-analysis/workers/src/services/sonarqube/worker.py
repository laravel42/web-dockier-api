import asyncio

from src.infrastructure import queue
from src.services.worker_runtime import QueueWorker, supervise
from src.services.sonarqube.service import SonarQubeService


def build_worker() -> QueueWorker:
    service = SonarQubeService()
    return QueueWorker(
        queue.ENGINE_QUEUES["sonarqube"],
        lambda job_id, data: service.process_job({**data, "job_id": data.get("job_id") or job_id}),
        label="sonarqube",
    )


async def start_sonarqube_worker():
    await supervise(build_worker())


if __name__ == "__main__":
    asyncio.run(start_sonarqube_worker())

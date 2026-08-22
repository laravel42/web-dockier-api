import asyncio

from src.infrastructure import queue
from src.services.worker_runtime import QueueWorker, supervise
from src.services.bearer.service import BearerService


def build_worker() -> QueueWorker:
    service = BearerService()
    return QueueWorker(
        queue.ENGINE_QUEUES["bearer"],
        lambda job_id, data: service.process_job({**data, "job_id": data.get("job_id") or job_id}),
        label="bearer",
    )


async def start_bearer_worker():
    await supervise(build_worker())


if __name__ == "__main__":
    asyncio.run(start_bearer_worker())

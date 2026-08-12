import asyncio

from src.infrastructure import queue
from src.services.worker_runtime import QueueWorker, supervise
from src.services.semgrep.service import SemgrepService


def build_worker() -> QueueWorker:
    service = SemgrepService()
    return QueueWorker(
        queue.ENGINE_QUEUES["semgrep"],
        lambda job_id, data: service.process_job({**data, "job_id": data.get("job_id") or job_id}),
        label="semgrep",
    )


async def start_semgrep_worker():
    await supervise(build_worker())


if __name__ == "__main__":
    asyncio.run(start_semgrep_worker())

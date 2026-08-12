import asyncio

from src.infrastructure import queue
from src.services.worker_runtime import QueueWorker, supervise
from src.services.regex.service import RegexService


def build_worker() -> QueueWorker:
    service = RegexService()
    return QueueWorker(
        queue.ENGINE_QUEUES["regex"],
        lambda job_id, data: service.process_job({**data, "job_id": data.get("job_id") or job_id}),
        label="regex",
    )


async def start_regex_worker():
    await supervise(build_worker())


if __name__ == "__main__":
    asyncio.run(start_regex_worker())

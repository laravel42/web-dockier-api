import asyncio

from src.infrastructure import queue
from src.services.worker_runtime import QueueWorker, supervise
from src.services.codeql.service import CodeQLService


def build_worker() -> QueueWorker:
    service = CodeQLService()
    return QueueWorker(
        queue.ENGINE_QUEUES["codeql"],
        lambda job_id, data: service.process_job({**data, "job_id": data.get("job_id") or job_id}),
        label="codeql",
    )


async def start_codeql_worker():
    await supervise(build_worker())


if __name__ == "__main__":
    asyncio.run(start_codeql_worker())

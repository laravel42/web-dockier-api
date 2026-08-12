import asyncio

from src.infrastructure import queue
from src.services.worker_runtime import QueueWorker, supervise
from src.services.aggregator.service import AggregatorService


def build_worker() -> QueueWorker:
    service = AggregatorService()
    return QueueWorker(queue.RESULTS_QUEUE, lambda job_id, data: service.process_result(data),
                       label="aggregator")


async def start_aggregator_worker():
    await supervise(build_worker())


if __name__ == "__main__":
    asyncio.run(start_aggregator_worker())

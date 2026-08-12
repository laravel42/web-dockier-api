import asyncio

from src.infrastructure import queue
from src.services.worker_runtime import QueueWorker, supervise
from src.services.gateway.service import GatewayService


def build_worker() -> QueueWorker:
    service = GatewayService()
    return QueueWorker(queue.SECURITY_SCAN_QUEUE, service.process_job, label="gateway")


async def start_gateway_worker():
    await supervise(build_worker())


if __name__ == "__main__":
    asyncio.run(start_gateway_worker())

import asyncio
import pytest
from unittest.mock import patch, AsyncMock

from src.services.worker_runtime import QueueWorker, supervise


def _job(job_id="j1", data=None):
    return {"id": job_id, "data": data or {"scan_id": "s1"}, "retry_count": 0, "retry_limit": 2}


@pytest.mark.asyncio
async def test_successful_job_is_completed():
    handled = []

    async def handler(job_id, data):
        handled.append((job_id, data))

    worker = QueueWorker("q", handler)
    with patch("src.services.worker_runtime.queue.complete", new_callable=AsyncMock) as done, \
         patch("src.services.worker_runtime.queue.fail", new_callable=AsyncMock) as failed:
        await worker._run_job(_job())

    assert handled == [("j1", {"scan_id": "s1"})]
    done.assert_awaited_once()
    failed.assert_not_awaited()


@pytest.mark.asyncio
async def test_failing_job_is_failed_not_completed():
    async def handler(job_id, data):
        raise RuntimeError("engine exploded")

    worker = QueueWorker("q", handler)
    with patch("src.services.worker_runtime.queue.complete", new_callable=AsyncMock) as done, \
         patch("src.services.worker_runtime.queue.fail", new_callable=AsyncMock) as failed:
        failed.return_value = True
        await worker._run_job(_job())

    done.assert_not_awaited()
    assert "engine exploded" in failed.await_args[0][2]


@pytest.mark.asyncio
async def test_concurrency_is_capped():
    """
    MAX_WORKERS sat in config.py unreferenced while every message spawned an
    unbounded task, so a burst could start any number of concurrent clones.
    """
    running = 0
    peak = 0

    async def handler(job_id, data):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1

    worker = QueueWorker("q", handler, max_concurrency=2)
    with patch("src.services.worker_runtime.queue.complete", new_callable=AsyncMock), \
         patch("src.services.worker_runtime.queue.fail", new_callable=AsyncMock):
        await asyncio.gather(*[worker._run_job(_job(f"j{i}")) for i in range(8)])

    assert peak <= 2, f"cap of 2 exceeded: {peak} ran concurrently"


@pytest.mark.asyncio
async def test_tasks_are_retained_until_done():
    """An unretained task can be garbage-collected mid-flight."""
    started = asyncio.Event()
    release = asyncio.Event()

    async def handler(job_id, data):
        started.set()
        await release.wait()

    worker = QueueWorker("q", handler)
    with patch("src.services.worker_runtime.queue.complete", new_callable=AsyncMock):
        worker._spawn(_job())
        await started.wait()
        assert len(worker._tasks) == 1
        release.set()
        await asyncio.sleep(0)
        await asyncio.gather(*list(worker._tasks), return_exceptions=True)
    assert worker._tasks == set()


@pytest.mark.asyncio
async def test_supervisor_restarts_a_crashed_loop():
    """
    A dropped connection used to kill a worker silently and permanently, after
    which every scan hung at the aggregator barrier with no log line.
    """
    calls = []

    class Flaky(QueueWorker):
        def __init__(self):
            super().__init__("q", AsyncMock(), label="flaky")

        async def run(self):
            calls.append(1)
            if len(calls) < 3:
                raise ConnectionResetError("redis went away")
            return

    with patch("src.services.worker_runtime.RESTART_BACKOFF_SECONDS", 0):
        await supervise(Flaky())

    assert len(calls) == 3, "supervisor should have restarted twice then exited cleanly"


@pytest.mark.asyncio
async def test_worker_claims_only_what_it_can_run():
    fetched = []

    async def fake_fetch(name, limit=1):
        fetched.append(limit)
        worker.stop()
        return []

    async def handler(job_id, data):
        pass

    worker = QueueWorker("q", handler, max_concurrency=3)
    with patch("src.services.worker_runtime.queue.fetch", side_effect=fake_fetch), \
         patch("src.services.worker_runtime.POLL_INTERVAL", 0):
        await worker.run()

    assert fetched and fetched[0] == 3

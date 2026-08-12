"""
Shared runtime for every queue consumer.

Replaces six hand-rolled `async for message in pubsub.listen()` loops that each
had the same three defects (§4.5, §4.7, §4.8):

  * the gateway held one pool connection for the entire process lifetime;
  * every message spawned an unbounded `asyncio.create_task`, so a burst could
    start any number of concurrent clones and `codeql database create` runs
    while MAX_WORKERS sat in config.py unreferenced;
  * tasks were never retained and carried no done-callback, so a dropped
    connection killed a worker silently and permanently — and every subsequent
    scan then hung at the aggregator barrier with no log line to explain it.
"""

import asyncio
import traceback
from typing import Any, Awaitable, Callable, Dict, Optional

from src.infrastructure import queue
from src.infrastructure.config import MAX_WORKERS, POLL_INTERVAL

# Stuck-job sweeps are cheap but pointless to run every poll.
REAP_INTERVAL_SECONDS = 300

# How long a crashed supervisor waits before restarting, so a permanently
# broken worker cannot spin the CPU.
RESTART_BACKOFF_SECONDS = 5


class QueueWorker:
    """Claims jobs from one pg-boss queue and runs them with bounded concurrency."""

    def __init__(
        self,
        queue_name: str,
        handler: Callable[[str, Dict[str, Any]], Awaitable[None]],
        label: Optional[str] = None,
        max_concurrency: int = MAX_WORKERS,
    ):
        self.queue_name = queue_name
        self.handler = handler
        self.label = label or queue_name
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self._tasks: set = set()
        self._stopped = asyncio.Event()

    def stop(self) -> None:
        self._stopped.set()

    async def _run_job(self, job: Dict[str, Any]) -> None:
        job_id = job["id"]
        async with self.semaphore:
            try:
                await self.handler(job_id, job["data"] or {})
                await queue.complete(self.queue_name, job_id)
            except Exception as e:
                traceback.print_exc()
                retrying = await queue.fail(self.queue_name, job_id, str(e))
                print(f"[!] {self.label}: job {job_id} failed ({e}); "
                      f"{'scheduled for retry' if retrying else 'no retries left'}")

    def _spawn(self, job: Dict[str, Any]) -> None:
        task = asyncio.create_task(self._run_job(job))
        # Retained so the task is not garbage-collected mid-flight, and
        # discarded on completion so the set does not grow without bound.
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def run(self) -> None:
        print(f"[*] {self.label}: consuming pg-boss queue {self.queue_name!r}")
        ticks_since_reap = 0

        while not self._stopped.is_set():
            # Only claim what there is capacity to run; leaving jobs in the
            # queue is the whole point of having one.
            free = max(0, self.semaphore._value)
            jobs = await queue.fetch(self.queue_name, limit=free) if free else []

            for job in jobs:
                self._spawn(job)

            ticks_since_reap += POLL_INTERVAL
            if ticks_since_reap >= REAP_INTERVAL_SECONDS:
                ticks_since_reap = 0
                reaped = await queue.reap_expired(self.queue_name)
                if reaped:
                    print(f"[*] {self.label}: returned {reaped} expired job(s) to the queue")

            if not jobs:
                await asyncio.sleep(POLL_INTERVAL)

        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)


async def supervise(worker: QueueWorker) -> None:
    """Restart a worker whose loop raises, instead of losing it silently."""
    while True:
        try:
            await worker.run()
            return  # clean stop
        except asyncio.CancelledError:
            raise
        except Exception:
            traceback.print_exc()
            print(f"[!] {worker.label}: loop crashed, restarting in {RESTART_BACKOFF_SECONDS}s")
            await asyncio.sleep(RESTART_BACKOFF_SECONDS)

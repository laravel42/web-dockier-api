"""Shared result-publishing for the analysis engines."""

from typing import Any, Dict, List, Optional

from src.models.schemas import ScanFinding, ScanResult

RESULTS_CHANNEL = "scan:results"


class EnginePublisher:
    """Mixin giving an engine one way to report its outcome.

    Every engine published the same two payloads by hand, which is how the
    success and failure paths drifted apart. Keeping it in one place also means
    the eventual move off Redis Pub/Sub touches a single call site.

    Subclasses set `engine_name` and provide `self.redis`.
    """

    engine_name: str = "unknown"

    async def _publish(
        self,
        job_id: str,
        scan_id: str,
        findings: List[Dict[str, Any]],
        status: str = "ok",
        error: Optional[str] = None,
    ) -> None:
        result = ScanResult(
            job_id=job_id,
            scan_id=scan_id,
            engine=self.engine_name,
            findings=[ScanFinding.model_validate(f) for f in findings],
            status=status,
            error=error,
        )
        await self.redis.publish(RESULTS_CHANNEL, result.model_dump_json())

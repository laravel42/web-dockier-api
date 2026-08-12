import json
import pytest
from unittest.mock import patch, AsyncMock

from src.services.aggregator.service import AggregatorService, EXPECTED_ENGINES


def _service(fake_redis, llm=None):
    with patch("src.services.aggregator.service.get_redis_client", return_value=fake_redis), \
         patch("src.services.aggregator.service.get_llm_provider") as mock_llm:
        mock_llm.return_value = llm or AsyncMock(
            judge=AsyncMock(side_effect=lambda f: [
                {**x, "suppressed_by_llm": False, "suppression_reason": None} for x in f
            ])
        )
        return AggregatorService()


def _result(engine, findings, job_id="job-1", scan_id="scan-1", status="ok", error=None):
    return {
        "job_id": job_id,
        "scan_id": scan_id,
        "engine": engine,
        "findings": findings,
        "status": status,
        "error": error,
    }


@pytest.mark.asyncio
async def test_findings_survive_the_redis_round_trip(fake_redis, finding):
    """
    Regression guard for the fan-in serialization bug: findings were written as
    JSON objects and read back with list.extend(), which iterates a dict's keys
    and reduced every finding to ['rule_id', 'severity', ...].
    """
    service = _service(fake_redis)
    captured = {}

    async def capture(job_id, scan_id, all_findings, engine_status):
        captured["findings"] = all_findings
        captured["engine_status"] = engine_status

    service.complete_job = capture

    for i, engine in enumerate(sorted(EXPECTED_ENGINES)):
        await service.process_result(_result(engine, [finding(rule_id=f"rule-{i}", line=i + 1)]))

    assert len(captured["findings"]) == len(EXPECTED_ENGINES)
    for item in captured["findings"]:
        assert isinstance(item, dict), f"expected finding object, got {item!r}"
        assert set(item) == {"rule_id", "severity", "message", "file_path", "line"}
    assert {f["rule_id"] for f in captured["findings"]} == {"rule-0", "rule-1", "rule-2", "rule-3"}


@pytest.mark.asyncio
async def test_barrier_waits_for_all_engines(fake_redis, finding):
    service = _service(fake_redis)
    service.complete_job = AsyncMock()

    await service.process_result(_result("semgrep", [finding()]))
    await service.process_result(_result("regex", []))
    await service.process_result(_result("sonarqube", []))

    service.complete_job.assert_not_called()

    await service.process_result(_result("codeql", []))
    service.complete_job.assert_awaited_once()


@pytest.mark.asyncio
async def test_duplicate_engine_result_is_ignored(fake_redis, finding):
    service = _service(fake_redis)
    service.complete_job = AsyncMock()

    await service.process_result(_result("semgrep", [finding()]))
    await service.process_result(_result("semgrep", [finding()]))  # redelivery

    stored = await fake_redis.lrange("job:job-1:findings", 0, -1)
    assert len(stored) == 1, "duplicate delivery must not double-count findings"


@pytest.mark.asyncio
async def test_only_one_caller_finalizes(fake_redis, finding):
    """The SET NX claim must let exactly one caller finalize a completed job."""
    service = _service(fake_redis)
    service.complete_job = AsyncMock()

    for engine in EXPECTED_ENGINES:
        await service.process_result(_result(engine, [finding()]))
    assert service.complete_job.await_count == 1

    # A late duplicate that re-populates the set must not finalize a second time.
    await service.process_result(_result("semgrep", [finding()]))
    await service.process_result(_result("regex", []))
    await service.process_result(_result("sonarqube", []))
    await service.process_result(_result("codeql", []))
    assert service.complete_job.await_count == 1


@pytest.mark.asyncio
async def test_malformed_result_is_discarded(fake_redis):
    service = _service(fake_redis)
    service.complete_job = AsyncMock()

    await service.process_result({"job_id": "job-1", "engine": "semgrep"})  # no scan_id

    assert fake_redis.sets == {}
    service.complete_job.assert_not_called()


@pytest.mark.asyncio
async def test_failed_engine_yields_partial_status(fake_redis, finding):
    service = _service(fake_redis)

    with patch("src.services.aggregator.service.persist_scan_results", new_callable=AsyncMock) as persist:
        await service.process_result(_result("semgrep", [finding()]))
        await service.process_result(_result("regex", []))
        await service.process_result(_result("sonarqube", []))
        await service.process_result(
            _result("codeql", [], status="failed", error="codeql CLI not found on PATH")
        )

        persist.assert_awaited_once()
        scan_id, judged, engine_status = persist.await_args[0]
        assert scan_id == "scan-1"
        assert engine_status["codeql"]["status"] == "failed"
        assert engine_status["semgrep"]["status"] == "ok"


@pytest.mark.asyncio
async def test_all_engines_ok_persists_every_finding(fake_redis, finding):
    service = _service(fake_redis)

    with patch("src.services.aggregator.service.persist_scan_results", new_callable=AsyncMock) as persist:
        for engine in EXPECTED_ENGINES:
            await service.process_result(_result(engine, [finding()]))

        _, judged, engine_status = persist.await_args[0]
        assert len(judged) == len(EXPECTED_ENGINES)
        assert all(s["status"] == "ok" for s in engine_status.values())


@pytest.mark.asyncio
async def test_suppressed_findings_are_still_persisted(fake_redis, finding):
    """
    Decision: suppression is a marked state, never a deletion. The aggregator
    must hand every finding to the persistence layer, flagged, not a filtered
    subset.
    """
    llm = AsyncMock()
    llm.judge = AsyncMock(side_effect=lambda f: [
        {**x, "suppressed_by_llm": True, "suppression_reason": "looks synthetic"} for x in f
    ])
    service = _service(fake_redis, llm=llm)

    with patch("src.services.aggregator.service.persist_scan_results", new_callable=AsyncMock) as persist:
        for engine in EXPECTED_ENGINES:
            await service.process_result(_result(engine, [finding()]))

        _, judged, _ = persist.await_args[0]
        assert len(judged) == len(EXPECTED_ENGINES), "suppressed findings must not be dropped"
        assert all(f["suppressed_by_llm"] for f in judged)
        assert all(f["suppression_reason"] == "looks synthetic" for f in judged)


@pytest.mark.asyncio
async def test_persistence_failure_does_not_crash_the_worker(fake_redis, finding):
    service = _service(fake_redis)

    with patch("src.services.aggregator.service.persist_scan_results", new_callable=AsyncMock) as persist:
        persist.side_effect = Exception("connection reset")
        for engine in EXPECTED_ENGINES:
            await service.process_result(_result(engine, [finding()]))


@pytest.mark.asyncio
async def test_keys_are_cleaned_up_after_completion(fake_redis, finding):
    service = _service(fake_redis)
    service.complete_job = AsyncMock()

    for engine in EXPECTED_ENGINES:
        await service.process_result(_result(engine, [finding()]))

    assert "job:job-1:findings" not in fake_redis.lists
    assert "job:job-1:engines_done" not in fake_redis.sets
    assert "job:job-1:engine_status" not in fake_redis.hashes

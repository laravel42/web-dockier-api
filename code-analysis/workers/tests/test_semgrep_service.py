import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.semgrep.service import SemgrepService


def _service(fake_redis):
    with patch("src.services.semgrep.service.get_redis_client", return_value=fake_redis):
        return SemgrepService()


@patch("src.services.semgrep.service.subprocess.run")
def test_run_scan_parses_semgrep_json(mock_run):
    mock_run.return_value = MagicMock(stdout=json.dumps({
        "results": [{
            "check_id": "rule-1",
            "extra": {"severity": "ERROR", "message": "msg"},
            "path": "/tmp/repo/file.py",
            "start": {"line": 10},
        }]
    }))

    with patch("src.services.semgrep.service.get_redis_client", return_value=MagicMock()):
        findings = SemgrepService().run_scan("/tmp/repo")

    assert len(findings) == 1
    assert findings[0]["rule_id"] == "rule-1"
    assert findings[0]["severity"] == "error"
    assert findings[0]["line"] == 10


@pytest.mark.asyncio
@patch("src.services.semgrep.service.asyncio.to_thread")
async def test_process_job_publishes_ok_result(mock_to_thread, fake_redis, finding):
    async def runner(func, *args, **kwargs):
        return [finding()] if func.__name__ == "run_scan" else None
    mock_to_thread.side_effect = runner

    service = _service(fake_redis)
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    assert len(fake_redis.published) == 1
    channel, payload = fake_redis.published[0]
    assert channel == "scan:results"
    body = json.loads(payload)
    assert body["engine"] == "semgrep"
    assert body["status"] == "ok"
    assert body["error"] is None
    assert len(body["findings"]) == 1
    assert body["findings"][0]["rule_id"] == "rule-1"


@pytest.mark.asyncio
@patch("src.services.semgrep.service.asyncio.to_thread")
async def test_process_job_publishes_failed_status_on_error(mock_to_thread, fake_redis):
    mock_to_thread.side_effect = Exception("download exploded")

    service = _service(fake_redis)
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = json.loads(fake_redis.published[0][1])
    assert body["status"] == "failed"
    assert "download exploded" in body["error"]
    assert body["findings"] == []

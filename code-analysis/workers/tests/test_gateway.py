import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.gateway.service import GatewayService


def _service(fake_redis):
    with patch("src.services.gateway.service.get_redis_client", return_value=fake_redis):
        return GatewayService()


@pytest.mark.asyncio
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_process_job_fans_out_to_every_engine(mock_to_thread, fake_redis):
    async def runner(func, *args, **kwargs):
        return "s3://test-uri/code.zip" if func.__name__ == "upload_codebase" else None
    mock_to_thread.side_effect = runner

    service = _service(fake_redis)
    await service.process_job("job-1", {
        "cloneUrl": "https://github.com/test/repo",
        "commitSha": "abc1234",
        "scanId": "scan-1",
    })

    channels = [c for c, _ in fake_redis.published]
    assert set(channels) == {"scan:semgrep", "scan:regex", "scan:sonarqube", "scan:codeql"}

    body = json.loads(fake_redis.published[0][1])
    assert body["job_id"] == "job-1"
    assert body["scan_id"] == "scan-1"
    assert body["uri"] == "s3://test-uri/code.zip"
    assert body["commit_sha"] == "abc1234"


@pytest.mark.asyncio
@patch("src.services.gateway.service.execute_query", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_process_job_marks_failure_and_publishes_nothing(mock_to_thread, mock_exec, fake_redis):
    mock_to_thread.side_effect = Exception("Clone failed")

    service = _service(fake_redis)
    await service.process_job("job-1", {"scanId": "scan-1"})

    assert fake_redis.published == []
    assert mock_exec.await_count == 2

    job_sql, job_payload, job_id = mock_exec.await_args_list[0][0]
    assert "failed" in job_sql
    assert "Clone failed" in job_payload
    assert job_id == "job-1"

    scan_sql = mock_exec.await_args_list[1][0][0]
    assert "security_scans" in scan_sql


def test_detect_language_by_manifest(tmp_path):
    (tmp_path / "package.json").write_text("{}")
    with patch("src.services.gateway.service.get_redis_client", return_value=MagicMock()):
        assert GatewayService()._detect_language(str(tmp_path)) == "javascript"


def test_detect_language_falls_back_to_unknown(tmp_path):
    (tmp_path / "notes.txt").write_text("nothing to detect")
    with patch("src.services.gateway.service.get_redis_client", return_value=MagicMock()):
        assert GatewayService()._detect_language(str(tmp_path)) == "unknown"

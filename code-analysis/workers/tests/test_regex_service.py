import json
import re
import pytest
from unittest.mock import patch, MagicMock

from src.services.regex.service import RegexService


def _service(fake_redis):
    with patch("src.services.regex.service.get_redis_client", return_value=fake_redis):
        return RegexService()


def test_run_scan_reports_matching_line(tmp_path):
    (tmp_path / "test_file.py").write_text("import hashlib\nmd5 = hashlib.md5()\n")

    with patch("src.services.regex.service.get_compiled_rules") as mock_rules, \
         patch("src.services.regex.service.get_redis_client", return_value=MagicMock()):
        mock_rules.return_value = [("MD5_USED", re.compile(r"hashlib\.md5"), "MD5 is weak", "high")]
        findings = RegexService().run_scan(str(tmp_path))

    assert len(findings) == 1
    assert findings[0]["rule_id"] == "MD5_USED"
    assert findings[0]["line"] == 2
    assert "test_file.py" in findings[0]["file_path"]


@pytest.mark.asyncio
@patch("src.services.regex.service.asyncio.to_thread")
async def test_process_job_publishes_ok_result(mock_to_thread, fake_redis, finding):
    async def runner(func, *args, **kwargs):
        return [finding(rule_id="rule-regex")] if func.__name__ == "run_scan" else None
    mock_to_thread.side_effect = runner

    service = _service(fake_redis)
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = json.loads(fake_redis.published[0][1])
    assert body["engine"] == "regex"
    assert body["job_id"] == "job-1"
    assert body["status"] == "ok"
    assert len(body["findings"]) == 1


@pytest.mark.asyncio
@patch("src.services.regex.service.asyncio.to_thread")
async def test_process_job_publishes_failed_status_on_error(mock_to_thread, fake_redis):
    mock_to_thread.side_effect = Exception("boom")

    service = _service(fake_redis)
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = json.loads(fake_redis.published[0][1])
    assert body["status"] == "failed"
    assert "boom" in body["error"]

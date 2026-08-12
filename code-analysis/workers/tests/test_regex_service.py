import json
import re
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.regex.service import RegexService


def _service(fake_redis):
    with patch("src.services.regex.service.get_redis_client", return_value=fake_redis):
        return RegexService()


def _rules(pattern=r"hashlib\.md5", rule_id="MD5_USED", extensions=None):
    return [(rule_id, re.compile(pattern, re.I), "MD5 is weak", "high", extensions or [])]


def test_run_scan_reports_matching_line_with_snippet(tmp_path):
    (tmp_path / "test_file.py").write_text("import hashlib\nmd5 = hashlib.md5()\n")

    with patch("src.services.regex.service.get_redis_client", return_value=MagicMock()):
        findings = RegexService().run_scan(str(tmp_path), _rules())

    assert len(findings) == 1
    assert findings[0]["rule_id"] == "MD5_USED"
    assert findings[0]["line"] == 2
    assert findings[0]["end_line"] == 2
    assert findings[0]["snippet"] == "md5 = hashlib.md5()"
    assert findings[0]["file_path"] == "test_file.py"


def test_extension_scoped_rules_skip_other_files(tmp_path):
    (tmp_path / "a.py").write_text("hashlib.md5()\n")
    (tmp_path / "b.js").write_text("hashlib.md5()\n")

    with patch("src.services.regex.service.get_redis_client", return_value=MagicMock()):
        findings = RegexService().run_scan(str(tmp_path), _rules(extensions=[".js"]))

    assert [f["file_path"] for f in findings] == ["b.js"]


def test_dependency_and_generated_files_are_skipped(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "node_modules" / "pkg").mkdir(parents=True)
    (tmp_path / "public").mkdir()
    (tmp_path / "src" / "app.py").write_text("hashlib.md5()\n")
    (tmp_path / "node_modules" / "pkg" / "i.js").write_text("hashlib.md5()\n")
    (tmp_path / "public" / "v.min.js").write_text("hashlib.md5()\n")

    with patch("src.services.regex.service.get_redis_client", return_value=MagicMock()):
        findings = RegexService().run_scan(str(tmp_path), _rules())

    assert [f["file_path"] for f in findings] == ["src/app.py"]


@pytest.mark.asyncio
@patch("src.services.regex.service.load_custom_rules", new_callable=AsyncMock)
@patch("src.services.regex.service.asyncio.to_thread")
async def test_process_job_publishes_ok_result(mock_to_thread, mock_rules, fake_redis, finding):
    mock_rules.return_value = []

    async def runner(func, *args, **kwargs):
        return [finding(rule_id="rule-regex")] if func.__name__ == "run_scan" else None
    mock_to_thread.side_effect = runner

    service = _service(fake_redis)
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = json.loads(fake_redis.published[0][1])
    assert body["engine"] == "regex"
    assert body["status"] == "ok"
    assert len(body["findings"]) == 1


@pytest.mark.asyncio
@patch("src.services.regex.service.load_custom_rules", new_callable=AsyncMock)
async def test_disabled_custom_rules_skip_rule_loading(mock_rules, fake_redis):
    service = _service(fake_redis)
    with patch("src.services.regex.service.asyncio.to_thread", new_callable=AsyncMock) as t:
        t.return_value = []
        await service.process_job({
            "uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1",
            "options": {"enable_custom_rules": False},
        })

    mock_rules.assert_not_awaited()
    assert json.loads(fake_redis.published[0][1])["status"] == "ok"


@pytest.mark.asyncio
@patch("src.services.regex.service.load_custom_rules", new_callable=AsyncMock)
@patch("src.services.regex.service.asyncio.to_thread")
async def test_process_job_publishes_failed_status_on_error(mock_to_thread, mock_rules, fake_redis):
    mock_rules.return_value = []
    mock_to_thread.side_effect = Exception("boom")

    service = _service(fake_redis)
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = json.loads(fake_redis.published[0][1])
    assert body["status"] == "failed"
    assert "boom" in body["error"]

import json
import re
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.regex.service import RegexService


@pytest.fixture(autouse=True)
def _stubbed_settings():
    """process_job reads per-tenant engine settings; give it the defaults."""
    from src.infrastructure.engine_settings import DEFAULTS
    with patch("src.services.regex.service.get_settings", new_callable=AsyncMock) as g:
        g.return_value = dict(DEFAULTS["regex"])
        yield g


def _service():
    return RegexService()


def _rules(pattern=r"hashlib\.md5", rule_id="MD5_USED", extensions=None):
    return [(rule_id, re.compile(pattern, re.I), "MD5 is weak", "high", extensions or [])]


def test_run_scan_reports_matching_line_with_snippet(tmp_path):
    (tmp_path / "test_file.py").write_text("import hashlib\nmd5 = hashlib.md5()\n")

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

    findings = RegexService().run_scan(str(tmp_path), _rules(extensions=[".js"]))

    assert [f["file_path"] for f in findings] == ["b.js"]


def test_dependency_and_generated_files_are_skipped(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "node_modules" / "pkg").mkdir(parents=True)
    (tmp_path / "public").mkdir()
    (tmp_path / "src" / "app.py").write_text("hashlib.md5()\n")
    (tmp_path / "node_modules" / "pkg" / "i.js").write_text("hashlib.md5()\n")
    (tmp_path / "public" / "v.min.js").write_text("hashlib.md5()\n")

    findings = RegexService().run_scan(str(tmp_path), _rules())

    assert [f["file_path"] for f in findings] == ["src/app.py"]


@pytest.mark.asyncio
@patch("src.services.regex.service.load_custom_rules", new_callable=AsyncMock)
@patch("src.services.regex.service.asyncio.to_thread")
async def test_process_job_publishes_ok_result(mock_to_thread, mock_rules, published, finding):
    mock_rules.return_value = []

    async def runner(func, *args, **kwargs):
        return [finding(rule_id="rule-regex")] if func.__name__ == "run_scan" else None
    mock_to_thread.side_effect = runner

    service = _service()
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = published[0][1]
    assert body["engine"] == "regex"
    assert body["status"] == "ok"
    assert len(body["findings"]) == 1


@pytest.mark.asyncio
@patch("src.services.regex.service.load_custom_rules", new_callable=AsyncMock)
async def test_disabled_custom_rules_skip_rule_loading(mock_rules, published):
    service = _service()
    with patch("src.services.regex.service.asyncio.to_thread", new_callable=AsyncMock) as t:
        t.return_value = []
        await service.process_job({
            "uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1",
            "options": {"enable_custom_rules": False},
        })

    mock_rules.assert_not_awaited()
    assert published[0][1]["status"] == "ok"


@pytest.mark.asyncio
@patch("src.services.regex.service.load_custom_rules", new_callable=AsyncMock)
@patch("src.services.regex.service.asyncio.to_thread")
async def test_process_job_publishes_failed_status_on_error(mock_to_thread, mock_rules, published):
    mock_rules.return_value = []
    mock_to_thread.side_effect = Exception("boom")

    service = _service()
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = published[0][1]
    assert body["status"] == "failed"
    assert "boom" in body["error"]


@pytest.mark.asyncio
async def test_disabled_in_settings_reports_ok(published, _stubbed_settings):
    _stubbed_settings.return_value = {"enabled": False}
    await _service().process_job({"uri": "s3://t/t.zip", "job_id": "j", "scan_id": "s"})
    body = published[0][1]
    assert body["status"] == "ok" and body["findings"] == []


def test_tenant_excludes_narrow_the_walk(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "fixtures").mkdir()
    (tmp_path / "src" / "a.py").write_text("hashlib.md5()\n")
    (tmp_path / "fixtures" / "b.py").write_text("hashlib.md5()\n")

    findings = RegexService().run_scan(
        str(tmp_path), _rules(), scan_sensitive=False, extra_excludes=["fixtures/*"])

    assert [f["file_path"] for f in findings] == ["src/a.py"]


def test_file_size_cap_is_honoured(tmp_path):
    (tmp_path / "big.py").write_text("hashlib.md5()\n" + "x" * 5000)
    assert RegexService().run_scan(str(tmp_path), _rules(), False, max_file_bytes=100) == []


@pytest.mark.asyncio
@patch("src.services.regex.service.load_custom_rules", new_callable=AsyncMock)
@patch("src.services.regex.service.asyncio.to_thread")
async def test_sensitive_data_can_be_switched_off_alone(mock_thread, mock_rules, published,
                                                        _stubbed_settings):
    """The two pattern scanners share a walk but are independently switchable."""
    _stubbed_settings.return_value = {"enabled": True, "customRules": True,
                                      "sensitiveData": False, "maxFileBytes": 1000,
                                      "extraExcludes": []}
    mock_rules.return_value = []
    captured = {}

    async def runner(func, *args, **kwargs):
        if getattr(func, "__name__", "") == "run_scan":
            captured["scan_sensitive"] = args[2]
            return []
        return None
    mock_thread.side_effect = runner

    await _service().process_job({"uri": "s3://t/t.zip", "job_id": "j", "scan_id": "s"})
    assert captured["scan_sensitive"] is False

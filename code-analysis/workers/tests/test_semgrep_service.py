import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.semgrep.service import SemgrepService


def _service():
    return SemgrepService()


@patch("src.services.semgrep.service.subprocess.run")
def test_run_scan_parses_semgrep_json(mock_run, tmp_path):
    mock_run.return_value = MagicMock(stdout=json.dumps({
        "results": [{
            "check_id": "rule-1",
            "extra": {"severity": "ERROR", "message": "msg"},
            "path": str(tmp_path / "file.py"),
            "start": {"line": 10},
            "end": {"line": 14},
        }]
    }))

    findings = SemgrepService().run_scan(str(tmp_path))

    assert len(findings) == 1
    assert findings[0]["rule_id"] == "rule-1"
    assert findings[0]["severity"] == "error"
    assert findings[0]["line"] == 10
    assert findings[0]["end_line"] == 14, "the reported span must survive"
    assert findings[0]["file_path"] == "file.py", "scratch path must not leak into findings"

    # excludes are passed to the CLI and .semgrepignore is written into the repo
    argv = mock_run.call_args[0][0]
    assert "--exclude" in argv and "node_modules/" in argv
    assert (tmp_path / ".semgrepignore").exists()


@pytest.mark.asyncio
@patch("src.services.semgrep.service.asyncio.to_thread")
async def test_process_job_publishes_ok_result(mock_to_thread, published, finding):
    async def runner(func, *args, **kwargs):
        return [finding()] if func.__name__ == "run_scan" else None
    mock_to_thread.side_effect = runner

    service = _service()
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    assert len(published) == 1
    channel, body = published[0]
    assert channel == "scan-results"
    assert body["engine"] == "semgrep"
    assert body["status"] == "ok"
    assert body["error"] is None
    assert len(body["findings"]) == 1
    assert body["findings"][0]["rule_id"] == "rule-1"


@pytest.mark.asyncio
@patch("src.services.semgrep.service.asyncio.to_thread")
async def test_process_job_publishes_failed_status_on_error(mock_to_thread, published):
    mock_to_thread.side_effect = Exception("download exploded")

    service = _service()
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = published[0][1]
    assert body["status"] == "failed"
    assert "download exploded" in body["error"]
    assert body["findings"] == []


@patch("src.services.semgrep.service.subprocess.run")
def test_crashed_semgrep_raises_instead_of_reporting_clean(mock_run, tmp_path):
    """
    A blanket `except: return []` made a crashed scanner indistinguishable from
    a clean repository — silent under-reporting.
    """
    mock_run.return_value = MagicMock(stdout="", stderr="Segmentation fault", returncode=139)

    with pytest.raises(RuntimeError, match="no output"):
        SemgrepService().run_scan(str(tmp_path))


@patch("src.services.semgrep.service.subprocess.run")
def test_fatal_semgrep_errors_raise(mock_run, tmp_path):
    mock_run.return_value = MagicMock(stdout=json.dumps({
        "results": [], "errors": [{"level": "error", "message": "invalid rule file"}],
    }), stderr="", returncode=1)

    with pytest.raises(RuntimeError, match="invalid rule file"):
        SemgrepService().run_scan(str(tmp_path))


@patch("src.services.semgrep.service.subprocess.run")
def test_clean_repo_returns_no_findings(mock_run, tmp_path):
    mock_run.return_value = MagicMock(stdout=json.dumps({"results": [], "errors": []}),
                                      stderr="", returncode=0)
    assert SemgrepService().run_scan(str(tmp_path)) == []


@patch("src.services.semgrep.service.subprocess.run")
def test_rule_ids_are_normalized(mock_run, tmp_path):
    """
    `--config <abs dir>` namespaces rule ids with the scanning machine's path, so
    they never matched the catalogue ids overrides are written against. This is
    the bug migration 0062 repaired in stored rows.
    """
    noisy = ("Users.someone.projects.web-dockier-api.code-analysis.rules.opengrep"
             ".javascript.browser.security.insecure-document-method")
    mock_run.return_value = MagicMock(stdout=json.dumps({"results": [{
        "check_id": noisy, "extra": {"severity": "WARNING", "message": "m", "lines": "x"},
        "path": str(tmp_path / "a.js"), "start": {"line": 1}, "end": {"line": 1},
    }]}), stderr="", returncode=0)

    findings = SemgrepService().run_scan(str(tmp_path))
    assert findings[0]["rule_id"] == "javascript.browser.security.insecure-document-method"


@patch("src.services.semgrep.service.subprocess.run")
def test_disabled_rules_are_dropped_in_either_id_form(mock_run, tmp_path):
    noisy = ("x.code-analysis.rules.opengrep.javascript.a")
    mock_run.return_value = MagicMock(stdout=json.dumps({"results": [{
        "check_id": noisy, "extra": {"severity": "WARNING", "message": "m"},
        "path": str(tmp_path / "a.js"), "start": {"line": 1}, "end": {"line": 1},
    }]}), stderr="", returncode=0)

    assert SemgrepService().run_scan(str(tmp_path), {"javascript.a"}) == []
    assert SemgrepService().run_scan(str(tmp_path), {noisy}) == []


@patch("src.services.semgrep.service.subprocess.run")
def test_scan_is_configured_and_bounded(mock_run, tmp_path):
    mock_run.return_value = MagicMock(stdout=json.dumps({"results": []}), stderr="", returncode=0)
    SemgrepService().run_scan(str(tmp_path))

    argv = mock_run.call_args[0][0]
    assert "--config" in argv, "without --config semgrep falls back to the registry"
    assert "--timeout" in argv and "--max-target-bytes" in argv
    assert mock_run.call_args[1]["timeout"] > 0

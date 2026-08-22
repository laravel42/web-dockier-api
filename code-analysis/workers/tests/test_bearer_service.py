import json
import pytest
from unittest.mock import patch, AsyncMock

from src.services.bearer.service import BearerService, tag_bearer_rule_ids


@pytest.fixture(autouse=True)
def _stubbed_settings():
    from src.infrastructure.engine_settings import DEFAULTS
    with patch("src.services.bearer.service.get_settings", new_callable=AsyncMock) as g:
        g.return_value = dict(DEFAULTS["bearer"])
        yield g


def _service():
    return BearerService()


def test_parse_bearer_json(tmp_path):
    report = tmp_path / "report.json"
    report.write_text(json.dumps({
        "critical": [{
            "id": "javascript_lang_hardcoded_secret",
            "title": "Usage of hard-coded secret",
            "line_number": 1,
            "filename": "app.js",
            "code_extract": 'const x = "secret";',
        }],
        "high": [],
    }))
    findings = _service().parse_bearer_json(str(report))
    assert len(findings) == 1
    assert findings[0]["rule_id"] == "javascript_lang_hardcoded_secret"
    assert findings[0]["severity"] == "error"
    assert findings[0]["file_path"] == "app.js"


def test_parse_bearer_json_int_source_lines(tmp_path):
    report = tmp_path / "report.json"
    report.write_text(json.dumps({
        "high": [{
            "id": "ruby_lang_rule",
            "title": "Issue",
            "filename": "app.rb",
            "source": {"start": 12, "end": 14},
        }],
    }))
    findings = _service().parse_bearer_json(str(report))
    assert findings[0]["line"] == 12
    assert findings[0]["end_line"] == 14


def test_parse_bearer_json_source_line_numbers(tmp_path):
    report = tmp_path / "report.json"
    report.write_text(json.dumps({
        "medium": [{
            "id": "javascript_lang_rule",
            "title": "Issue",
            "filename": "app.ts",
            "source": {
                "start_line_number": 22,
                "end_line_number": 24,
                "content": "const email = user.email",
            },
        }],
    }))
    findings = _service().parse_bearer_json(str(report))
    assert findings[0]["line"] == 22
    assert findings[0]["end_line"] == 24


def test_tag_bearer_rule_ids():
    tagged = tag_bearer_rule_ids([{"rule_id": "js/rule"}])
    assert tagged[0]["rule_id"] == "bearer.js/rule"


@patch("src.services.bearer.service.shutil.which")
@patch("src.services.bearer.service.subprocess.run")
def test_run_bearer_invokes_cli(mock_run, mock_which, tmp_path):
    mock_which.return_value = "/opt/homebrew/bin/bearer"
    out = tmp_path / "out.json"
    _service().run_bearer(str(tmp_path), str(out), scanners=["sast"])
    mock_run.assert_called_once()
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "bearer"
    assert "--scanner" in cmd
    assert "sast" in cmd


@patch("src.services.bearer.service.shutil.which", return_value=None)
def test_run_bearer_missing_cli(mock_which):
    with pytest.raises(RuntimeError, match="bearer CLI not found"):
        _service().run_bearer("/tmp/repo", "/tmp/out.json")


@pytest.mark.asyncio
@patch("src.services.bearer.service.asyncio.to_thread")
async def test_process_job_disabled(mock_to_thread):
    svc = _service()
    svc._publish = AsyncMock()
    await svc.process_job({
        "job_id": "j1",
        "scan_id": "s1",
        "uri": "file://x",
        "options": {"enableBearer": False},
    })
    mock_to_thread.assert_not_called()
    svc._publish.assert_awaited_once()

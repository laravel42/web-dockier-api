import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.codeql.service import CodeQLService


def _service():
    return CodeQLService()


def _bare_service():
    return CodeQLService()


def test_parse_sarif(tmp_path):
    sarif_file = tmp_path / "test.sarif"
    sarif_file.write_text(json.dumps({
        "runs": [{
            "results": [{
                "ruleId": "js/sql-injection",
                "message": {"text": "SQL injection vulnerability."},
                "locations": [{
                    "physicalLocation": {
                        "artifactLocation": {"uri": "app.js"},
                        "region": {"startLine": 12},
                    }
                }],
            }]
        }]
    }))

    findings = _bare_service().parse_codeql_sarif(str(sarif_file))
    assert len(findings) == 1
    assert findings[0]["rule_id"] == "js/sql-injection"
    assert findings[0]["file_path"] == "app.js"
    assert findings[0]["line"] == 12


@patch("src.services.codeql.service.shutil.which")
@patch("src.services.codeql.service.subprocess.run")
def test_run_codeql_invokes_create_then_analyze(mock_run, mock_which):
    mock_which.return_value = "/usr/bin/codeql"

    _bare_service().run_codeql("/tmp/repo", "javascript")

    assert mock_run.call_count == 2
    create_call = mock_run.call_args_list[0][0][0]
    analyze_call = mock_run.call_args_list[1][0][0]
    assert "create" in create_call
    assert "--language=javascript" in create_call
    assert "analyze" in analyze_call


@patch("src.services.codeql.service.shutil.which", return_value=None)
def test_missing_cli_raises_instead_of_fabricating_findings(mock_which):
    """
    The service previously wrote a mock SARIF containing a fake 'mock-sqli'
    finding whenever the CLI was absent, reporting an invented SQL injection on
    every scan run from an image without codeql installed.
    """
    with pytest.raises(RuntimeError, match="codeql CLI not found"):
        _bare_service().run_codeql("/tmp/repo", "javascript")


@pytest.mark.asyncio
@patch("src.services.codeql.service.shutil.which", return_value=None)
@patch("src.services.codeql.service.asyncio.to_thread")
async def test_missing_cli_publishes_failed_not_clean(mock_to_thread, mock_which, published):
    async def runner(func, *args, **kwargs):
        return func(*args, **kwargs)
    mock_to_thread.side_effect = runner

    service = _service()
    with patch("src.services.codeql.service.download_codebase"):
        await service.process_job({
            "uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1", "language": "javascript",
        })

    body = published[0][1]
    assert body["status"] == "failed"
    assert body["findings"] == []
    assert "codeql CLI not found" in body["error"]
    assert "mock-sqli" not in str(published[0][1])


@pytest.mark.asyncio
@patch("src.services.codeql.service.asyncio.to_thread")
async def test_process_job_publishes_ok_result(mock_to_thread, published, finding):
    async def runner(func, *args, **kwargs):
        return "/tmp/repo/codeql-results.sarif" if func.__name__ == "run_codeql" else None
    mock_to_thread.side_effect = runner

    service = _service()
    with patch.object(service, "parse_codeql_sarif", return_value=[finding(rule_id="js/sql-injection")]):
        await service.process_job({
            "uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1", "language": "javascript",
        })

    body = published[0][1]
    assert body["engine"] == "codeql"
    assert body["status"] == "ok"
    assert len(body["findings"]) == 1


@pytest.mark.asyncio
async def test_unknown_language_is_skipped_not_failed(published):
    service = _service()
    await service.process_job({
        "uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1", "language": "unknown",
    })

    body = published[0][1]
    assert body["engine"] == "codeql"
    assert body["status"] == "ok"
    assert body["findings"] == []

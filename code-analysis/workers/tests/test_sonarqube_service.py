import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.sonarqube.service import SonarQubeService


def _service():
    return SonarQubeService()


def _bare_service():
    return SonarQubeService()


@pytest.mark.asyncio
@patch("src.services.sonarqube.service.httpx.AsyncClient")
async def test_fetch_sonar_issues(mock_client_cls):
    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "issues": [{
            "rule": "sonar-rule",
            "severity": "MAJOR",
            "message": "bug",
            "component": "my_proj:file.py",
            "line": 10,
        }]
    }
    mock_client.get.return_value = mock_resp
    mock_client_cls.return_value.__aenter__.return_value = mock_client

    with patch("src.services.sonarqube.service.asyncio.sleep", new_callable=AsyncMock):
        findings = await _bare_service().fetch_sonar_issues("http://localhost", "token", "my_proj")

    assert len(findings) == 1
    assert findings[0]["rule_id"] == "sonar-rule"
    assert findings[0]["file_path"] == "file.py"
    assert findings[0]["severity"] == "major"


@patch("src.services.sonarqube.service.shutil.which", return_value="/usr/bin/sonar-scanner")
@patch("src.services.sonarqube.service.subprocess.run")
def test_run_sonar_scanner(mock_run, mock_which):
    _bare_service().run_sonar_scanner("/tmp/repo", "my_proj", "http://localhost", "token")
    mock_run.assert_called_once()
    assert "sonar-scanner" in mock_run.call_args[0][0]


@pytest.mark.asyncio
@patch("src.services.sonarqube.service.asyncio.to_thread")
@patch("src.services.sonarqube.service.get_cloudflare_secret")
async def test_process_job_publishes_ok_result(mock_secret, mock_to_thread, published, finding):
    mock_secret.side_effect = ["http://localhost", "token"]
    mock_to_thread.return_value = None

    service = _service()
    with patch.object(service, "fetch_sonar_issues", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = [finding(rule_id="sonar-rule")]
        await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = published[0][1]
    assert body["engine"] == "sonarqube"
    assert body["status"] == "ok"
    assert len(body["findings"]) == 1


@pytest.mark.asyncio
@patch("src.services.sonarqube.service.get_cloudflare_secret")
async def test_process_job_publishes_failed_status_on_error(mock_secret, published):
    mock_secret.side_effect = ValueError("Secret 'SONAR_TOKEN' not found")

    service = _service()
    await service.process_job({"uri": "s3://t/t.zip", "job_id": "job-1", "scan_id": "scan-1"})

    body = published[0][1]
    assert body["status"] == "failed"
    assert "SONAR_TOKEN" in body["error"]

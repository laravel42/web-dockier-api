import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.sonarqube.service import SonarQubeService


@pytest.fixture(autouse=True)
def _stubbed_settings():
    """process_job reads per-tenant engine settings; give it the defaults."""
    from src.infrastructure.engine_settings import DEFAULTS
    with patch("src.services.sonarqube.service.get_settings", new_callable=AsyncMock) as g:
        g.return_value = dict(DEFAULTS["sonarqube"])
        yield g


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


def test_token_is_not_passed_on_the_command_line(tmp_path):
    """`-Dsonar.login=<token>` is visible to every process on the host."""
    with patch("src.services.sonarqube.service.shutil.which", return_value="/usr/bin/sonar-scanner"), \
         patch("src.services.sonarqube.service.subprocess.run") as mock_run:
        _bare_service().run_sonar_scanner(str(tmp_path), "k", "https://sonar", "tok-secret")

    argv = mock_run.call_args[0][0]
    assert not any("tok-secret" in a for a in argv), argv
    assert not any("sonar.login" in a for a in argv), "sonar.login is deprecated"
    assert mock_run.call_args[1]["env"]["SONAR_TOKEN"] == "tok-secret"


def test_missing_scanner_raises(tmp_path):
    with patch("src.services.sonarqube.service.shutil.which", return_value=None):
        with pytest.raises(RuntimeError, match="not found"):
            _bare_service().run_sonar_scanner(str(tmp_path), "k", "https://sonar", "t")


def test_ce_task_id_is_read_from_report_task(tmp_path):
    work = tmp_path / ".scannerwork"
    work.mkdir()
    (work / "report-task.txt").write_text(
        "projectKey=k\nceTaskId=AXbc123\nserverUrl=https://sonar\n")
    assert _bare_service()._read_ce_task_id(str(tmp_path)) == "AXbc123"


def test_missing_report_task_yields_no_task_id(tmp_path):
    assert _bare_service()._read_ce_task_id(str(tmp_path)) is None


@pytest.mark.asyncio
@patch("src.services.sonarqube.service.httpx.AsyncClient")
async def test_wait_polls_until_success(mock_cls):
    """
    The old code slept 5 seconds and queried anyway, so on any non-trivial repo
    it read the issues API before the report existed and reported zero findings.
    """
    client = AsyncMock()
    responses = [MagicMock(), MagicMock(), MagicMock()]
    for r, status in zip(responses, ["PENDING", "IN_PROGRESS", "SUCCESS"]):
        r.json.return_value = {"task": {"status": status}}
    client.get.side_effect = responses
    mock_cls.return_value.__aenter__.return_value = client

    with patch("src.services.sonarqube.service.asyncio.sleep", new_callable=AsyncMock):
        await _bare_service().wait_for_analysis("https://sonar", "t", "task-1")

    assert client.get.await_count == 3


@pytest.mark.asyncio
@patch("src.services.sonarqube.service.httpx.AsyncClient")
async def test_failed_analysis_raises(mock_cls):
    client = AsyncMock()
    resp = MagicMock()
    resp.json.return_value = {"task": {"status": "FAILED"}}
    client.get.return_value = resp
    mock_cls.return_value.__aenter__.return_value = client

    with pytest.raises(RuntimeError, match="failed"):
        await _bare_service().wait_for_analysis("https://sonar", "t", "task-1")


@pytest.mark.asyncio
@patch("src.services.sonarqube.service.httpx.AsyncClient")
async def test_unreachable_sonar_is_an_engine_failure(mock_cls):
    """An unreachable server is not a repository with no issues."""
    client = AsyncMock()
    client.get.side_effect = Exception("connection refused")
    mock_cls.return_value.__aenter__.return_value = client

    with pytest.raises(RuntimeError, match="failed to fetch"):
        await _bare_service().fetch_sonar_issues("https://sonar", "t", "k")


def test_tenant_exclusions_are_appended_not_substituted(tmp_path):
    """A tenant must not be able to un-exclude node_modules by supplying a list."""
    with patch("src.services.sonarqube.service.shutil.which", return_value="/usr/bin/sonar-scanner"), \
         patch("src.services.sonarqube.service.subprocess.run") as mock_run:
        _bare_service().run_sonar_scanner(str(tmp_path), "k", "https://sonar", "t",
                                          ["**/legacy/**"], "Sonar way")

    argv = mock_run.call_args[0][0]
    exclusions = next(a for a in argv if a.startswith("-Dsonar.exclusions="))
    assert "**/node_modules/**" in exclusions, "built-in exclusions must survive"
    assert "**/legacy/**" in exclusions, "tenant exclusions must be added"
    assert "-Dsonar.profile=Sonar way" in argv


@pytest.mark.asyncio
async def test_disabled_in_settings_reports_ok(published, _stubbed_settings):
    _stubbed_settings.return_value = {"enabled": False}
    await _service().process_job({"uri": "s3://t/t.zip", "job_id": "j", "scan_id": "s"})
    body = published[0][1]
    assert body["status"] == "ok" and body["findings"] == []

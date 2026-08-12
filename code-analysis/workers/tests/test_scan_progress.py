import json
import pytest
from unittest.mock import patch, AsyncMock

from src.infrastructure.scan_progress import (
    PHASES, PROGRESS_CHANNEL, ScanCancelled, assert_not_cancelled, make_progress,
    publish_progress,
)


def test_progress_payload_shape():
    p = make_progress("scanning", files_scanned=3, files_in_repo=10,
                      findings_count=2, scanner="semgrep", current_file="a.py")
    assert p == {
        "phase": "scanning", "filesScanned": 3, "filesInRepo": 10,
        "findingsCount": 2, "scanner": "semgrep", "currentFile": "a.py",
    }


def test_optional_fields_are_omitted_when_absent():
    assert set(make_progress("done")) == {"phase", "filesScanned", "filesInRepo", "findingsCount"}


@pytest.mark.parametrize("phase", PHASES)
def test_all_phases_are_representable(phase):
    assert make_progress(phase)["phase"] == phase


@pytest.mark.asyncio
@patch("src.infrastructure.scan_progress.execute_query", new_callable=AsyncMock)
async def test_progress_merges_into_summary_rather_than_replacing_it(mock_exec):
    """The summary also carries finding counts; a progress update must not blank them."""
    await publish_progress("scan-1", make_progress("scanning"))

    update_sql = mock_exec.await_args_list[0][0][0]
    assert "||" in update_sql and "jsonb_build_object('progress'" in update_sql
    assert "SET summary = COALESCE(summary" in update_sql


@pytest.mark.asyncio
@patch("src.infrastructure.scan_progress.execute_query", new_callable=AsyncMock)
async def test_progress_emits_a_notify(mock_exec):
    await publish_progress("scan-1", make_progress("cloning"))

    notify = mock_exec.await_args_list[1][0]
    assert "pg_notify" in notify[0]
    assert notify[1] == PROGRESS_CHANNEL
    assert json.loads(notify[2])["scanId"] == "scan-1"


@pytest.mark.asyncio
@patch("src.infrastructure.scan_progress.execute_query", new_callable=AsyncMock)
async def test_notify_payload_is_truncated(mock_exec):
    """pg_notify rejects payloads over 8000 bytes."""
    await publish_progress("s", make_progress("scanning", current_file="x" * 20_000))
    assert len(mock_exec.await_args_list[1][0][2]) <= 7999


@pytest.mark.asyncio
@patch("src.infrastructure.scan_progress.fetch_row", new_callable=AsyncMock)
async def test_running_scan_is_not_cancelled(mock_fetch):
    mock_fetch.return_value = {"status": "running"}
    await assert_not_cancelled("scan-1")


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["cancelled", "canceled"])
@patch("src.infrastructure.scan_progress.fetch_row", new_callable=AsyncMock)
async def test_cancelled_scan_aborts(mock_fetch, status):
    mock_fetch.return_value = {"status": status}
    with pytest.raises(ScanCancelled, match="cancelled"):
        await assert_not_cancelled("scan-1")


@pytest.mark.asyncio
@patch("src.infrastructure.scan_progress.fetch_row", new_callable=AsyncMock)
async def test_deleted_scan_aborts(mock_fetch):
    """A scan whose row is gone has nowhere to write results."""
    mock_fetch.return_value = None
    with pytest.raises(ScanCancelled, match="no longer exists"):
        await assert_not_cancelled("scan-1")


@pytest.mark.asyncio
@patch("src.services.gateway.service.fail_scan", new_callable=AsyncMock)
@patch("src.services.gateway.service.assert_not_cancelled", new_callable=AsyncMock)
@patch("src.services.gateway.service.publish_progress", new_callable=AsyncMock)
@patch("src.services.gateway.service.start_scan", new_callable=AsyncMock)
@patch("src.services.gateway.service.resolve_clone_url", new_callable=AsyncMock)
@patch("src.services.gateway.service.get_scan_target", new_callable=AsyncMock)
@patch("src.services.gateway.service.asyncio.to_thread")
async def test_cancellation_does_not_fail_the_job(mock_thread, mock_scan, mock_url,
                                                  mock_start, mock_prog, mock_cancel,
                                                  mock_fail, published):
    """
    Cancellation is what the user asked for, not an error: the job completes
    quietly so pg-boss does not retry work nobody wants.
    """
    from src.services.gateway.service import GatewayService
    from src.infrastructure.scan_progress import ScanCancelled

    mock_scan.return_value = {"id": "scan-1", "connection_id": "c", "repo": "a/b",
                              "branch": "main", "commit_sha": "abc"}
    mock_url.return_value = "https://github.com/a/b.git"
    mock_cancel.side_effect = ScanCancelled("scan 'scan-1' was cancelled")

    async def runner(func, *args, **kwargs):
        return None
    mock_thread.side_effect = runner

    await GatewayService().process_job("job-1", {"scanId": "scan-1", "tenantId": "o", "options": {}})

    assert published == [], "a cancelled scan must not fan out"
    mock_fail.assert_not_awaited()

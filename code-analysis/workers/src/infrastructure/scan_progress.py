"""
Live scan progress and cancellation.

The TypeScript worker writes progress into `scans.summary.progress` and pushes it
to websocket subscribers held in its own process. A separate Python process
cannot reach those sockets directly, so it does the half that crosses process
boundaries: persist the progress and emit a Postgres NOTIFY that the backend can
LISTEN on.

Wiring the backend's websocket layer to that channel is a backend-side change and
is not made here — until it is, progress is visible in `scans.summary.progress`
(which the websocket `snapshot` message already reads) but does not stream live.
"""

import json
from typing import Any, Dict, Optional

from src.infrastructure.db_client import execute_query, fetch_row

PROGRESS_CHANNEL = "dockier_scan_progress"

# Phases mirror ScanProgressPayload in scan-events.ts.
PHASES = ("cloning", "scanning", "persisting", "done")


class ScanCancelled(Exception):
    """Raised when a scan was cancelled or deleted while it was running."""


async def publish_progress(scan_id: str, progress: Dict[str, Any]) -> None:
    """Merge progress into scans.summary and notify listeners.

    Merged rather than overwritten: the summary also carries the finding counts,
    and a progress update must not blank them.
    """
    await execute_query(
        "UPDATE scans "
        "SET summary = COALESCE(summary, '{}'::jsonb) || jsonb_build_object('progress', $1::jsonb), "
        "    updated_at = NOW() "
        "WHERE id = $2",
        progress, scan_id,
    )
    await execute_query(
        "SELECT pg_notify($1, $2)",
        PROGRESS_CHANNEL,
        json.dumps({"scanId": scan_id, "progress": progress})[:7999],
    )


def make_progress(phase: str, files_scanned: int = 0, files_in_repo: int = 0,
                  findings_count: int = 0, scanner: Optional[str] = None,
                  current_file: Optional[str] = None) -> Dict[str, Any]:
    payload = {
        "phase": phase,
        "filesScanned": files_scanned,
        "filesInRepo": files_in_repo,
        "findingsCount": findings_count,
    }
    if scanner:
        payload["scanner"] = scanner
    if current_file:
        payload["currentFile"] = current_file
    return payload


async def assert_not_cancelled(scan_id: str) -> None:
    """Abort the job if the scan was cancelled or deleted underneath it.

    Checked between phases rather than continuously: a scan cancelled during a
    twenty-minute CodeQL run should not keep burning CPU, and one whose row has
    been deleted has nowhere to write results.
    """
    row = await fetch_row("SELECT status FROM scans WHERE id = $1", scan_id)
    if row is None:
        raise ScanCancelled(f"scan {scan_id!r} no longer exists")
    if row["status"] in ("cancelled", "canceled"):
        raise ScanCancelled(f"scan {scan_id!r} was cancelled")

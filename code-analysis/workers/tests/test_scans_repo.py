import json
import pytest
from unittest.mock import patch, AsyncMock

from src.infrastructure.scans_repo import (
    normalize_severity, build_summary, persist_scan_results, fail_scan,
)


@pytest.mark.parametrize("raw,expected", [
    ("error", "error"), ("ERROR", "error"), ("critical", "error"),
    ("blocker", "error"), ("high", "error"),
    ("warning", "warning"), ("major", "warning"), ("medium", "warning"),
    ("info", "info"), ("minor", "info"), ("note", "info"), ("low", "info"),
])
def test_normalize_severity_maps_engine_dialects(raw, expected):
    """findings.severity is a strict error|warning|info vocabulary."""
    assert normalize_severity(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "  ", "banana", "sev-9"])
def test_unknown_severity_defaults_to_warning(raw):
    """An unrecognized severity from a security engine must not be the quietest option."""
    assert normalize_severity(raw) == "warning"


def test_build_summary_excludes_suppressed_from_counts():
    findings = [
        {"severity": "error", "suppressed_by_llm": False},
        {"severity": "major", "suppressed_by_llm": False},
        {"severity": "info", "suppressed_by_llm": False},
        {"severity": "error", "suppressed_by_llm": True},
    ]
    summary = build_summary(findings, files_scanned=12, files_in_repo=30)

    assert summary == {
        "totalFindings": 3, "errors": 1, "warnings": 1, "infos": 1,
        "filesScanned": 12, "filesInRepo": 30,
    }


def test_build_summary_on_empty_findings():
    assert build_summary([]) == {
        "totalFindings": 0, "errors": 0, "warnings": 0, "infos": 0,
        "filesScanned": 0, "filesInRepo": 0,
    }


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_many", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_persist_writes_normalized_finding_rows(mock_fetch, mock_exec, mock_many):
    mock_fetch.return_value = {"id": "scan-1", "organization_id": "org-9"}

    findings = [
        {"rule_id": "py/sqli", "severity": "blocker", "message": "m",
         "file_path": "app.py", "line": 12, "suppressed_by_llm": False,
         "suppression_reason": None},
        {"rule_id": "js/xss", "severity": "minor", "message": "m2",
         "file_path": "web.js", "line": 3, "suppressed_by_llm": True,
         "suppression_reason": "template literal is constant"},
    ]
    status = await persist_scan_results("scan-1", findings, {"semgrep": {"status": "ok"}})

    assert status == "success"
    rows = mock_many.await_args[0][1]
    assert len(rows) == 2

    org, scan_id, rule_id, severity = rows[0][1], rows[0][2], rows[0][3], rows[0][4]
    assert (org, scan_id, rule_id, severity) == ("org-9", "scan-1", "py/sqli", "error")
    assert rows[0][7] == 12 and rows[0][8] == 12, "line maps to start_line and end_line"
    assert rows[0][10] is False

    assert rows[1][4] == "info"
    assert rows[1][10] is True
    assert rows[1][11] == "template literal is constant"


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_many", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_failed_engine_yields_partial_not_success(mock_fetch, mock_exec, mock_many):
    mock_fetch.return_value = {"id": "scan-1", "organization_id": "org-9"}

    status = await persist_scan_results(
        "scan-1", [], {"semgrep": {"status": "ok"}, "codeql": {"status": "failed", "error": "no cli"}}
    )

    assert status == "partial", "an engine failure must never read as a clean scan"
    update = [c for c in mock_exec.await_args_list if "UPDATE scans" in c[0][0]][0]
    assert update[0][1] == "partial"
    assert json.loads(update[0][3])["codeql"]["status"] == "failed"


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_many", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_rerun_replaces_previous_findings(mock_fetch, mock_exec, mock_many):
    mock_fetch.return_value = {"id": "scan-1", "organization_id": "org-9"}
    await persist_scan_results("scan-1", [], {})

    deletes = [c for c in mock_exec.await_args_list if "DELETE FROM findings" in c[0][0]]
    assert len(deletes) == 1 and deletes[0][0][1] == "scan-1"


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_unknown_scan_id_raises(mock_fetch):
    mock_fetch.return_value = None
    with pytest.raises(ValueError, match="not found"):
        await persist_scan_results("nope", [], {})


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
async def test_fail_scan_preserves_reason(mock_exec):
    await fail_scan("scan-1", "clone failed")
    sql, reason, scan_id = mock_exec.await_args[0]
    assert "status = 'failed'" in sql
    assert reason == "clone failed"
    assert scan_id == "scan-1"

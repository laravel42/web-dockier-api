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
    mock_fetch.side_effect = [{"id": "scan-1", "organization_id": "org-9"}, None]

    findings = [
        {"rule_id": "py/sqli", "severity": "blocker", "message": "m",
         "file_path": "app.py", "line": 12, "suppressed_by_llm": False,
         "suppression_reason": None},
        {"rule_id": "js/xss", "severity": "minor", "message": "m2",
         "file_path": "web.js", "line": 3, "suppressed_by_llm": True,
         "suppression_reason": "template literal is constant"},
    ]
    status = await persist_scan_results("scan-1", findings, {"semgrep": {"status": "ok"}})

    assert status == "completed"
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
    mock_fetch.side_effect = [{"id": "scan-1", "organization_id": "org-9"}, None]

    status = await persist_scan_results(
        "scan-1", [], {"semgrep": {"status": "ok"}, "codeql": {"status": "failed", "error": "no cli"}}
    )

    assert status == "partial", "the caller must be told the scan was degraded"
    update = [c for c in mock_exec.await_args_list if "UPDATE scans" in c[0][0]][0]
    # scans.status is a closed enum in the API schema; degradation is recorded
    # in the summary instead of inventing a status the API would reject.
    assert update[0][1] == "completed"
    assert update[0][2]["partial"] is True
    assert update[0][2]["failedEngines"] == ["codeql"]
    assert update[0][3]["codeql"]["status"] == "failed"


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_many", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_rerun_replaces_previous_findings(mock_fetch, mock_exec, mock_many):
    mock_fetch.side_effect = [{"id": "scan-1", "organization_id": "org-9"}, None]
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


# --- quality gates --------------------------------------------------------

from src.infrastructure.scans_repo import evaluate_quality_gate


def test_gate_fails_when_a_condition_matches():
    """A matching condition means failure: "errors > 0" reads as "fail on any error"."""
    summary = {"errors": 2, "warnings": 0, "infos": 0, "totalFindings": 2}
    assert evaluate_quality_gate(summary, [{"metric": "errors", "operator": ">", "threshold": 0}]) == "failed"


def test_gate_passes_when_no_condition_matches():
    summary = {"errors": 0, "warnings": 5, "infos": 0, "totalFindings": 5}
    assert evaluate_quality_gate(summary, [{"metric": "errors", "operator": ">", "threshold": 0}]) == "passed"


def test_gate_with_no_conditions_passes():
    assert evaluate_quality_gate({"errors": 99}, []) == "passed"
    assert evaluate_quality_gate({"errors": 99}, None) == "passed"


@pytest.mark.parametrize("operator,threshold,errors,expected", [
    (">", 0, 1, "failed"), (">", 0, 0, "passed"),
    (">=", 1, 1, "failed"), ("<", 1, 0, "failed"),
    ("<=", 0, 0, "failed"), ("==", 3, 3, "failed"), ("!=", 0, 1, "failed"),
])
def test_gate_operators(operator, threshold, errors, expected):
    summary = {"errors": errors}
    conditions = [{"metric": operator and "errors", "operator": operator, "threshold": threshold}]
    assert evaluate_quality_gate(summary, conditions) == expected


def test_malformed_conditions_are_ignored_not_fatal():
    """One bad condition must not block every scan in the organization."""
    summary = {"errors": 0}
    conditions = [
        {"metric": "nonexistent", "operator": ">", "threshold": 0},
        {"metric": "errors", "operator": "~~", "threshold": 0},
        {"metric": "errors", "operator": ">", "threshold": "not-a-number"},
    ]
    assert evaluate_quality_gate(summary, conditions) == "passed"


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_many", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_partial_scan_is_not_gated(mock_fetch, mock_exec, mock_many):
    """
    A scan whose engine failed cannot pass a gate it was never fully evaluated
    against — the engine that died is exactly the one that might have found the error.
    """
    mock_fetch.side_effect = [{"id": "scan-1", "organization_id": "org-9"}, None]
    await persist_scan_results("scan-1", [], {"codeql": {"status": "failed", "error": "x"}})

    update = [c for c in mock_exec.await_args_list if "UPDATE scans" in c[0][0]][0]
    assert update[0][4] is None, "a partial scan must not record a gate verdict"


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_many", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_gate_verdict_is_recorded_on_success(mock_fetch, mock_exec, mock_many):
    mock_fetch.side_effect = [
        {"id": "scan-1", "organization_id": "org-9"},
        {"conditions": [{"metric": "errors", "operator": ">", "threshold": 0}]},
    ]
    findings = [{"rule_id": "r", "severity": "error", "message": "m",
                 "file_path": "a.py", "line": 1, "suppressed_by_llm": False}]
    await persist_scan_results("scan-1", findings, {"semgrep": {"status": "ok"}})

    update = [c for c in mock_exec.await_args_list if "UPDATE scans" in c[0][0]][0]
    assert update[0][4] == "failed"


from src.infrastructure.scans_repo import SCAN_STATUSES


@pytest.mark.asyncio
@patch("src.infrastructure.scans_repo.execute_many", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.execute_query", new_callable=AsyncMock)
@patch("src.infrastructure.scans_repo.fetch_row", new_callable=AsyncMock)
async def test_persisted_status_is_always_api_valid(mock_fetch, mock_exec, mock_many):
    """
    scans.status is validated against z.enum(["pending","running","completed","failed"]).
    A status outside it makes the scan unreadable through the API.
    """
    for engine_status in ({}, {"semgrep": {"status": "ok"}}, {"codeql": {"status": "failed"}}):
        mock_exec.reset_mock()
        mock_fetch.side_effect = [{"id": "s", "organization_id": "o"}, None]
        await persist_scan_results("s", [], engine_status)
        written = [c for c in mock_exec.await_args_list if "UPDATE scans" in c[0][0]][0][0][1]
        assert written in SCAN_STATUSES, written

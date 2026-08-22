"""
Persistence against the canonical `scans` / `findings` tables.

The SAST workers previously wrote to a `security_scans` table with a `findings`
JSONB blob. That table does not exist in supabase/migrations/ — the real schema
is `scans` (0015) plus a normalized `findings` table (0016), which is what the
API, dashboard and findings filters already read.
"""

import json
import uuid
from typing import Any, Dict, List, Optional

from src.infrastructure.db_client import execute_query, execute_many, fetch_row

# findings.severity is exactly this three-value vocabulary
# (backend/src/services/code-analysis/domain/scan-analysis.ts). The engines speak
# wider dialects — SonarQube emits blocker/critical/major/minor, CodeQL emits
# SARIF levels — so everything is funnelled through one mapping rather than
# reaching the column raw and fragmenting the UI's severity filters.
SEVERITY_MAP = {
    "error": "error",
    "critical": "error",
    "blocker": "error",
    "high": "error",
    "fatal": "error",
    "warning": "warning",
    "major": "warning",
    "medium": "warning",
    "moderate": "warning",
    "info": "info",
    "note": "info",
    "minor": "info",
    "low": "info",
    "unknown": "info",
}

DEFAULT_SEVERITY = "warning"

# scans.status is validated by the API against
# z.enum(["pending", "running", "completed", "failed"])
# (backend/src/services/code-analysis/schemas.ts). Inventing "success" or
# "partial" here would make the scan unreadable through the API, so a degraded
# scan is "completed" with the degradation recorded in summary.partial /
# summary.failedEngines and in scans.engine_status.
SCAN_STATUSES = frozenset({"pending", "running", "completed", "failed"})


def normalize_severity(raw: Optional[str]) -> str:
    """Map an engine's severity onto the canonical vocabulary.

    Unrecognized values become 'warning' rather than 'info': an unknown severity
    from a security engine should not be quieter than the things around it.
    """
    if not raw:
        return DEFAULT_SEVERITY
    return SEVERITY_MAP.get(str(raw).strip().lower(), DEFAULT_SEVERITY)


def build_summary(findings: List[Dict[str, Any]], files_scanned: int = 0,
                  files_in_repo: int = 0, failed_engines: Optional[List[str]] = None) -> Dict[str, Any]:
    """Compute scans.summary in the shape mappers.ts expects.

    Suppressed findings are excluded from the counts: the summary drives the KPI
    cards, which should reflect what a human is being asked to act on. The rows
    themselves are still persisted and still queryable.
    """
    active = [f for f in findings if not f.get("suppressed_by_llm")]
    counts = {"error": 0, "warning": 0, "info": 0}
    for f in active:
        counts[normalize_severity(f.get("severity"))] += 1

    summary = {
        "totalFindings": len(active),
        "errors": counts["error"],
        "warnings": counts["warning"],
        "infos": counts["info"],
        "filesScanned": files_scanned,
        "filesInRepo": files_in_repo,
    }
    if failed_engines:
        # The status enum has no room for "degraded", so it lives here: an
        # engine that crashed found nothing, and nothing is not the same as
        # clean.
        summary["partial"] = True
        summary["failedEngines"] = sorted(failed_engines)
    return summary


# A condition that MATCHES means the gate FAILED: "errors > 0" reads as
# "fail when there is any error", which is how the seeded default is written.
GATE_OPERATORS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def evaluate_quality_gate(summary: Dict[str, Any], conditions: List[Dict[str, Any]]) -> str:
    """'failed' when any condition matches, else 'passed'.

    An unknown metric or operator is ignored rather than failing the gate: a
    malformed condition should not block every scan in the organization.
    """
    for condition in conditions or []:
        metric = condition.get("metric")
        op = GATE_OPERATORS.get(condition.get("operator"))
        if metric not in summary or op is None:
            print(f"[!] quality gate: ignoring unusable condition {condition!r}")
            continue
        try:
            if op(summary[metric], condition.get("threshold")):
                return "failed"
        except TypeError:
            print(f"[!] quality gate: ignoring condition with bad threshold {condition!r}")
    return "passed"


async def get_default_quality_gate(organization_id: str):
    """The tenant's default gate, falling back to the system one."""
    return await fetch_row(
        "SELECT conditions FROM quality_gates "
        "WHERE is_default AND organization_id IN ('', COALESCE($1, '')) "
        "ORDER BY organization_id DESC LIMIT 1",
        organization_id,
    )


async def get_scan_row(scan_id: str):
    return await fetch_row(
        "SELECT id, organization_id, project_id, connection_id, repo, branch, commit_sha "
        "FROM scans WHERE id = $1",
        scan_id,
    )


def _coerce_summary_object(raw: Any) -> Dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw if isinstance(raw, dict) else {}


async def resolve_file_counts(scan_id: str, findings: List[Dict[str, Any]]) -> tuple[int, int]:
    """Best-effort file totals for scans.summary.

    Prefer counts published during the gateway scan phase; fall back to distinct
    finding paths when older scans never recorded a walk total.
    """
    row = await fetch_row("SELECT summary FROM scans WHERE id = $1", scan_id)
    summary = _coerce_summary_object(row.get("summary") if row else None)
    progress = _coerce_summary_object(summary.get("progress"))

    files_in_repo = int(
        summary.get("filesInRepo")
        or summary.get("files_in_repo")
        or progress.get("filesInRepo")
        or progress.get("files_in_repo")
        or 0
    )
    files_scanned = int(
        summary.get("filesScanned")
        or summary.get("files_scanned")
        or progress.get("filesScanned")
        or progress.get("files_scanned")
        or 0
    )

    if files_in_repo == 0:
        unique_paths = {f.get("file_path") for f in findings if f.get("file_path")}
        if unique_paths:
            files_in_repo = len(unique_paths)

    if files_scanned == 0 and files_in_repo > 0:
        files_scanned = files_in_repo

    return files_scanned, files_in_repo


async def persist_scan_results(
    scan_id: str,
    findings: List[Dict[str, Any]],
    engine_status: Dict[str, Any],
    files_scanned: int = 0,
    files_in_repo: int = 0,
) -> str:
    """Write findings rows and finalize the scan. Returns the scan status written.

    A scan where any engine failed is stored as 'partial', never 'success' — an
    empty result from a crashed engine must not present as a clean bill of health.
    """
    scan_row = await get_scan_row(scan_id)
    if scan_row is None:
        raise ValueError(f"scan {scan_id!r} not found")

    organization_id = scan_row["organization_id"]

    if files_scanned == 0 and files_in_repo == 0:
        files_scanned, files_in_repo = await resolve_file_counts(scan_id, findings)

    # Re-running a scan replaces its findings rather than accumulating duplicates.
    await execute_query("DELETE FROM findings WHERE scan_id = $1", scan_id)

    rows = [
        (
            str(uuid.uuid4()),
            organization_id,
            scan_id,
            f.get("rule_id") or "unknown",
            normalize_severity(f.get("severity")),
            f.get("message") or "",
            f.get("file_path") or "",
            int(f.get("line") or 0),
            int(f.get("end_line") or f.get("line") or 0),
            f.get("snippet") or "",
            bool(f.get("suppressed_by_llm")),
            f.get("suppression_reason"),
        )
        for f in findings
    ]

    await execute_many(
        "INSERT INTO findings (id, organization_id, scan_id, rule_id, severity, message, "
        "file_path, start_line, end_line, snippet, suppressed_by_llm, suppression_reason) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        rows,
    )

    failed = [e for e, s in (engine_status or {}).items() if s.get("status") != "ok"]
    status = "completed"
    summary = build_summary(findings, files_scanned, files_in_repo, failed)

    # A partial scan cannot pass a gate it was never fully evaluated against:
    # the engine that failed is exactly the one that might have found the error.
    gate_status = None
    if not failed:
        gate = await get_default_quality_gate(organization_id)
        if gate is not None:
            gate_status = evaluate_quality_gate(summary, gate["conditions"])

    await execute_query(
        "UPDATE scans SET status = $1, summary = $2, engine_status = $3, "
        "quality_gate_status = $4, updated_at = NOW() WHERE id = $5",
        status,
        summary,
        engine_status or {},
        gate_status,
        scan_id,
    )
    return "partial" if failed else "completed"


async def start_scan(scan_id: str) -> None:
    """Mark a scan running, so the UI does not show it as pending while it works."""
    await execute_query(
        "UPDATE scans SET status = 'running', updated_at = NOW() WHERE id = $1", scan_id
    )


async def fail_scan(scan_id: str, error: str) -> None:
    """Mark a scan failed, preserving the reason in summary.error as the TS worker does."""
    await execute_query(
        "UPDATE scans SET status = 'failed', summary = jsonb_set("
        "  COALESCE(summary, '{}'::jsonb), '{error}', to_jsonb($1::text), true"
        "), updated_at = NOW() WHERE id = $2",
        error,
        scan_id,
    )

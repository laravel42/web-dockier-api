"""Public SAST API.

Every route is tenant-scoped: a scan is looked up by id **and** organization, so
a caller holding a valid token for one organization cannot read or trigger scans
belonging to another by guessing an id. A mismatch returns 404 rather than 403 —
confirming that an id exists is itself a disclosure.
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Path, Query

from src.api.auth import AuthContext, require_auth
from src.api.errors import ApiError
from src.api.schemas import (
    FindingCounts, FindingItem, FindingsResponse, HealthResponse, QueueDepth,
    RunScanRequest, RunScanResponse, ScanStatusResponse,
)
from src.infrastructure import queue
from src.infrastructure.db_client import fetch_all, fetch_row

router = APIRouter(prefix="/sast", tags=["SAST"])

MAX_PAGE_SIZE = 200


async def _get_owned_scan(scan_id: str, tenant_id: str):
    row = await fetch_row(
        "SELECT id, organization_id, status, summary, engine_status, quality_gate_status, updated_at "
        "FROM scans WHERE id = $1 AND organization_id = $2",
        scan_id, tenant_id,
    )
    if row is None:
        raise ApiError("Scan not found.", "NOT_FOUND", 404)
    return row


@router.post("/scans/{scan_id}/run", response_model=RunScanResponse)
async def run_scan(
    body: RunScanRequest,
    scan_id: str = Path(min_length=1, max_length=128),
    auth: AuthContext = Depends(require_auth),
) -> RunScanResponse:
    """Enqueue a scan. Returns as soon as the job is durably queued."""
    await _get_owned_scan(scan_id, auth.tenant_id)

    job_id = await queue.send(queue.SECURITY_SCAN_QUEUE, {
        "scanId": scan_id,
        "tenantId": auth.tenant_id,
        "options": body.options.model_dump(),
    })
    return RunScanResponse(job_id=job_id, scan_id=scan_id, status="queued")


@router.get("/scans/{scan_id}", response_model=ScanStatusResponse)
async def get_scan(
    scan_id: str = Path(min_length=1, max_length=128),
    auth: AuthContext = Depends(require_auth),
) -> ScanStatusResponse:
    row = await _get_owned_scan(scan_id, auth.tenant_id)

    summary = dict(row["summary"] or {})
    progress = summary.pop("progress", None)

    return ScanStatusResponse.model_validate({
        "scanId": row["id"],
        "status": row["status"] or "pending",
        "summary": {
            "totalFindings": summary.get("totalFindings", 0),
            "errors": summary.get("errors", 0),
            "warnings": summary.get("warnings", 0),
            "infos": summary.get("infos", 0),
            "filesScanned": summary.get("filesScanned", 0),
            "filesInRepo": summary.get("filesInRepo", 0),
            "partial": bool(summary.get("partial", False)),
            "failedEngines": summary.get("failedEngines", []),
        },
        "engineStatus": row["engine_status"] or {},
        "qualityGateStatus": row["quality_gate_status"],
        "progress": progress,
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
    })


@router.get("/scans/{scan_id}/findings", response_model=FindingsResponse)
async def list_findings(
    scan_id: str = Path(min_length=1, max_length=128),
    severity: Optional[Literal["error", "warning", "info"]] = Query(default=None),
    include_suppressed: bool = Query(default=False, alias="includeSuppressed"),
    limit: int = Query(default=50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_auth),
) -> FindingsResponse:
    """Findings for a scan.

    Suppressed findings are excluded unless asked for. They are never deleted —
    `includeSuppressed=true` is how a reviewer audits what the LLM filtered out.
    """
    await _get_owned_scan(scan_id, auth.tenant_id)

    filters = ["scan_id = $1"]
    args = [scan_id]
    if not include_suppressed:
        filters.append("NOT suppressed_by_llm")
    if severity:
        args.append(severity)
        filters.append(f"severity = ${len(args)}")
    where = " AND ".join(filters)

    counts_row = await fetch_row(
        "SELECT "
        "  COUNT(*) FILTER (WHERE severity = 'error'   AND NOT suppressed_by_llm) AS error, "
        "  COUNT(*) FILTER (WHERE severity = 'warning' AND NOT suppressed_by_llm) AS warning, "
        "  COUNT(*) FILTER (WHERE severity = 'info'    AND NOT suppressed_by_llm) AS info, "
        "  COUNT(*) FILTER (WHERE suppressed_by_llm) AS suppressed "
        "FROM findings WHERE scan_id = $1",
        scan_id,
    )
    total_row = await fetch_row(f"SELECT COUNT(*) AS n FROM findings WHERE {where}", *args)
    total = int(total_row["n"]) if total_row else 0

    rows = await fetch_all(
        f"SELECT id, rule_id, severity, message, file_path, start_line, end_line, snippet, "
        f"       suppressed_by_llm, suppression_reason, created_at "
        f"FROM findings WHERE {where} "
        f"ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, "
        f"         file_path, start_line "
        f"LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}",
        *args, limit, offset,
    )

    findings = [
        FindingItem.model_validate({
            "id": r["id"],
            "ruleId": r["rule_id"],
            "severity": r["severity"],
            "message": r["message"],
            "filePath": r["file_path"],
            "startLine": r["start_line"],
            "endLine": r["end_line"],
            "snippet": r["snippet"] or "",
            "suppressedByLlm": r["suppressed_by_llm"],
            "suppressionReason": r["suppression_reason"],
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
        })
        for r in rows
    ]

    return FindingsResponse(
        findings=findings,
        total=total,
        has_more=offset + len(findings) < total,
        counts=FindingCounts.model_validate({
            "error": int(counts_row["error"]) if counts_row else 0,
            "warning": int(counts_row["warning"]) if counts_row else 0,
            "info": int(counts_row["info"]) if counts_row else 0,
            "suppressed": int(counts_row["suppressed"]) if counts_row else 0,
        }),
    )


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Unauthenticated liveness probe — reports reachability, never scan data."""
    try:
        rows = await fetch_all(
            "SELECT name, "
            "  COUNT(*) FILTER (WHERE state < 'active') AS queued, "
            "  COUNT(*) FILTER (WHERE state = 'active') AS active "
            "FROM pgboss.job WHERE name = ANY($1::text[]) GROUP BY name ORDER BY name",
            queue.ALL_QUEUES,
        )
        depths = [
            QueueDepth(name=r["name"], queued=int(r["queued"]), active=int(r["active"]))
            for r in rows
        ]
        return HealthResponse(status="ok", database=True, queues=depths)
    except Exception as e:
        print(f"[!] health check failed: {e}")
        return HealthResponse(status="degraded", database=False, queues=[])

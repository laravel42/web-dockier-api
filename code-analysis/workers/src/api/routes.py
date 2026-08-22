"""Public SAST API.

Every route is tenant-scoped: a scan is looked up by id **and** organization, so
a caller holding a valid token for one organization cannot read or trigger scans
belonging to another by guessing an id. A mismatch returns 404 rather than 403 —
confirming that an id exists is itself a disclosure.
"""

import json
from datetime import datetime
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, Path, Query
from pydantic import ValidationError

from src.api.auth import AuthContext, require_auth
from src.api.errors import ApiError
from src.api.schemas import (
    AllEngineSettingsResponse, BearerSettings, CodeQLSettings, EngineSettingsResponse, FindingCounts,
    FindingItem, FindingsResponse, HealthResponse, QueueDepth, RegexSettings,
    RunScanRequest, RunScanResponse, ScanStatusResponse, SemgrepSettings,
)
from src.infrastructure import engine_settings
from src.infrastructure import queue
from src.infrastructure.db_client import fetch_all, fetch_row

router = APIRouter(prefix="/sast", tags=["SAST"])

MAX_PAGE_SIZE = 200


def _coerce_json_object(value: Any) -> Optional[Dict[str, Any]]:
    """Some writers store JSON objects as strings inside jsonb; normalize for the API."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return None
    return value if isinstance(value, dict) else None


def _summary_int(summary: Dict[str, Any], *keys: str) -> int:
    for key in keys:
        raw = summary.get(key)
        if raw is not None:
            return int(raw)
    return 0


def _normalize_engine_status(raw: Any) -> Dict[str, Dict[str, Any]]:
    data = _coerce_json_object(raw) or {}
    normalized: Dict[str, Dict[str, Any]] = {}
    for engine, status in data.items():
        if not isinstance(status, dict):
            continue
        state = status.get("status")
        if state not in ("ok", "failed"):
            continue
        err = status.get("error")
        normalized[str(engine)] = {
            "status": state,
            "error": str(err) if err else None,
        }
    return normalized


def _format_updated_at(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return str(value)


def _rule_id_engine(rule_id: str) -> str:
    """Map a persisted rule id to the engine that produced it."""
    rid = rule_id or ""
    if rid.startswith("bearer.") or rid.startswith("sonar."):
        return "bearer"
    if rid.startswith("custom.") or rid.startswith("sensitive-data."):
        return "regex"
    if rid.startswith("codeql."):
        return "codeql"
    return "semgrep"


_ENGINE_ALIASES = {"sonarqube": "bearer", "custom": "regex"}


async def _infer_engine_status(scan_id: str, row: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Backfill engine outcomes for scans persisted before engine_status was written."""
    summary = row.get("summary") or {}
    failed_raw = summary.get("failedEngines") or summary.get("failed_engines") or []
    failed = {_ENGINE_ALIASES.get(str(e), str(e)) for e in failed_raw}

    rows = await fetch_all(
        "SELECT DISTINCT rule_id FROM findings WHERE scan_id = $1",
        scan_id,
    )
    seen = {_rule_id_engine(r["rule_id"]) for r in rows}

    if not seen and not failed:
        return {}

    inferred: Dict[str, Dict[str, Any]] = {}
    for engine in ("semgrep", "regex", "bearer", "codeql"):
        if engine in failed:
            inferred[engine] = {"status": "failed", "error": None}
        elif engine in seen:
            inferred[engine] = {"status": "ok", "error": None}
    return inferred


async def _scan_status_payload_async(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = _scan_status_payload(row)
    if not payload["engineStatus"] and payload["status"] in ("completed", "failed"):
        payload["engineStatus"] = await _infer_engine_status(row["id"], row)
    return payload


def _scan_status_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    summary = dict(row.get("summary") or {})
    progress = _coerce_json_object(summary.pop("progress", None))

    scan_status = row.get("status") or "pending"
    if scan_status not in ("pending", "running", "completed", "failed"):
        scan_status = "failed" if scan_status else "pending"

    gate = row.get("quality_gate_status")
    if gate not in (None, "passed", "failed"):
        gate = None

    return {
        "scanId": row["id"],
        "status": scan_status,
        "summary": {
            "totalFindings": _summary_int(summary, "totalFindings", "total_findings"),
            "errors": _summary_int(summary, "errors"),
            "warnings": _summary_int(summary, "warnings"),
            "infos": _summary_int(summary, "infos"),
            "filesScanned": _summary_int(summary, "filesScanned", "files_scanned"),
            "filesInRepo": _summary_int(summary, "filesInRepo", "files_in_repo"),
            "partial": bool(summary.get("partial", False)),
            "failedEngines": summary.get("failedEngines") or summary.get("failed_engines") or [],
        },
        "engineStatus": _normalize_engine_status(row.get("engine_status")),
        "qualityGateStatus": gate,
        "progress": progress,
        "updatedAt": _format_updated_at(row.get("updated_at")),
    }


async def _get_owned_scan(scan_id: str, tenant_id: str):
    row = await fetch_row(
        "SELECT id, organization_id, status, summary, engine_status, quality_gate_status, updated_at "
        "FROM scans WHERE id = $1 AND organization_id = $2",
        scan_id, tenant_id,
    )
    if row is None:
        raise ApiError("Scan not found.", "NOT_FOUND", 404)
    return row


@router.post(
    "/scans/{scan_id}/run",
    response_model=RunScanResponse,
    summary="Enqueue a scan",
    responses={
        401: {"description": "Missing, expired or wrongly-signed token"},
        404: {"description": "No such scan for this tenant"},
        422: {"description": "Unknown option key, or a malformed body"},
    },
)
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


@router.get(
    "/scans/{scan_id}",
    response_model=ScanStatusResponse,
    summary="Scan status, summary and progress",
    responses={401: {"description": "Unauthenticated"},
               404: {"description": "No such scan for this tenant"}},
)
async def get_scan(
    scan_id: str = Path(min_length=1, max_length=128),
    auth: AuthContext = Depends(require_auth),
) -> ScanStatusResponse:
    row = await _get_owned_scan(scan_id, auth.tenant_id)

    try:
        return ScanStatusResponse.model_validate(await _scan_status_payload_async(row))
    except ValidationError as exc:
        raise ApiError(f"Scan status is malformed: {exc.errors()[0]['msg']}", "INVALID_SCAN_STATE", 422) from exc


@router.get(
    "/scans/{scan_id}/findings",
    response_model=FindingsResponse,
    summary="Findings for a scan",
    responses={401: {"description": "Unauthenticated"},
               404: {"description": "No such scan for this tenant"},
               422: {"description": "Invalid severity, limit or offset"}},
)
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


# ── Engine settings ────────────────────────────────────────────────────────

SETTINGS_MODELS = {
    "semgrep": SemgrepSettings,
    "regex": RegexSettings,
    "bearer": BearerSettings,
    "codeql": CodeQLSettings,
}


@router.get(
    "/settings",
    response_model=AllEngineSettingsResponse,
    summary="Configuration for every engine",
    description="A tenant with nothing stored gets fully-populated defaults, "
                "never a partial object.",
    responses={401: {"description": "Unauthenticated"}},
)
async def get_all_settings(auth: AuthContext = Depends(require_auth)) -> AllEngineSettingsResponse:
    stored = await engine_settings.get_all_settings(auth.tenant_id)
    return AllEngineSettingsResponse.model_validate(
        {engine: stored[engine] for engine in SETTINGS_MODELS}
    )


@router.put(
    "/settings/{engine}",
    response_model=EngineSettingsResponse,
    summary="Replace one engine's configuration",
    description="The body is validated against that engine's schema, and "
                "credential-shaped keys are rejected — tokens belong in the "
                "secret store, not in a settings row.",
    responses={
        401: {"description": "Unauthenticated"},
        404: {"description": "No such engine"},
        422: {"description": "Invalid configuration for this engine"},
    },
)
async def put_settings(
    body: Dict[str, Any],
    engine: str = Path(min_length=1, max_length=32),
    auth: AuthContext = Depends(require_auth),
) -> EngineSettingsResponse:
    model = SETTINGS_MODELS.get(engine)
    if model is None:
        raise ApiError(
            f"Unknown engine {engine!r}. Configurable: {', '.join(SETTINGS_MODELS)}.",
            "NOT_FOUND", 404,
        )

    rejected = sorted(set(body) & engine_settings.SECRET_KEYS)
    if rejected:
        raise ApiError(
            f"{', '.join(rejected)} cannot be stored here. Credentials belong in the "
            f"secret store; this endpoint records configuration only.",
            "SECRET_NOT_ALLOWED", 422,
        )

    # Validated then dumped by alias, so what reaches the database is exactly
    # the camelCase document the frontend reads back. Validating by hand means
    # the ValidationError is ours to translate: unconverted, it would reach the
    # catch-all handler and surface as an opaque 500.
    try:
        validated = model.model_validate(body).model_dump(by_alias=True)
    except ValidationError as e:
        first = (e.errors() or [{}])[0]
        field = ".".join(str(x) for x in first.get("loc", ()))
        detail = first.get("msg", "Invalid configuration")
        raise ApiError(f"{field}: {detail}" if field else detail, "VALIDATION_ERROR", 422)
    stored = await engine_settings.save_settings(auth.tenant_id, engine, validated)
    return EngineSettingsResponse(engine=engine, config=stored)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness and queue depth",
    description="Unauthenticated. Reports reachability and queue depth, never scan data.",
)
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

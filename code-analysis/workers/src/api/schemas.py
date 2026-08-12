"""Request and response models for the public SAST API.

Response models are attached to every route via `response_model=`, so FastAPI
validates what goes *out* as well as what comes in. That matters here because the
frontend is typed against these shapes: a field silently going missing would
surface as `undefined` in the UI rather than as an error at the boundary.

Field names are camelCase to match the rest of the platform's API surface
(snake_case in the database, camelCase on the wire).
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(word.capitalize() for word in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True, extra="forbid")


# ── Requests ───────────────────────────────────────────────────────────────

class ScanOptionsInput(ApiModel):
    """Engine toggles. Omitted means enabled, matching the backend's behaviour."""
    enable_semgrep: bool = True
    enable_sonarqube: bool = True
    enable_codeql: bool = True
    enable_custom_rules: bool = True
    enable_sensitive_data: bool = True


class RunScanRequest(ApiModel):
    options: ScanOptionsInput = Field(default_factory=ScanOptionsInput)


# ── Responses ──────────────────────────────────────────────────────────────

class RunScanResponse(ApiModel):
    job_id: str
    scan_id: str
    status: Literal["queued"]


class EngineStatus(ApiModel):
    status: Literal["ok", "failed"]
    error: Optional[str] = None


class ScanSummary(ApiModel):
    total_findings: int = 0
    errors: int = 0
    warnings: int = 0
    infos: int = 0
    files_scanned: int = 0
    files_in_repo: int = 0
    # Set when an engine failed. scans.status is a closed enum with no room for
    # "degraded", so the UI has to read it from here.
    partial: bool = False
    failed_engines: List[str] = Field(default_factory=list)


class ScanProgress(ApiModel):
    phase: Literal["cloning", "scanning", "persisting", "done"]
    files_scanned: int = 0
    files_in_repo: int = 0
    findings_count: int = 0
    scanner: Optional[str] = None
    current_file: Optional[str] = None


class ScanStatusResponse(ApiModel):
    scan_id: str
    status: Literal["pending", "running", "completed", "failed"]
    summary: ScanSummary
    engine_status: Dict[str, EngineStatus] = Field(default_factory=dict)
    quality_gate_status: Optional[Literal["passed", "failed"]] = None
    progress: Optional[ScanProgress] = None
    updated_at: Optional[str] = None


class FindingItem(ApiModel):
    id: str
    rule_id: str
    severity: Literal["error", "warning", "info"]
    message: str
    file_path: str
    start_line: int
    end_line: int
    snippet: str = ""
    suppressed_by_llm: bool = False
    suppression_reason: Optional[str] = None
    created_at: Optional[str] = None


class FindingCounts(ApiModel):
    error: int = 0
    warning: int = 0
    info: int = 0
    suppressed: int = 0


class FindingsResponse(ApiModel):
    findings: List[FindingItem]
    total: int
    has_more: bool
    counts: FindingCounts


class QueueDepth(ApiModel):
    name: str
    queued: int
    active: int


class HealthResponse(ApiModel):
    status: Literal["ok", "degraded"]
    database: bool
    queues: List[QueueDepth] = Field(default_factory=list)

"""Request and response models for the public SAST API.

Response models are attached to every route via `response_model=`, so FastAPI
validates what goes *out* as well as what comes in. That matters here because the
frontend is typed against these shapes: a field silently going missing would
surface as `undefined` in the UI rather than as an error at the boundary.

Field names are camelCase to match the rest of the platform's API surface
(snake_case in the database, camelCase on the wire).
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(word.capitalize() for word in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True, extra="forbid")


# ── Requests ───────────────────────────────────────────────────────────────

class ScanOptionsInput(ApiModel):
    """Engine toggles. Omitted keys use server defaults (Semgrep off unless enabled)."""
    enable_semgrep: bool = False
    enable_bearer: bool = Field(
        default=True,
        validation_alias=AliasChoices("enable_bearer", "enableBearer", "enable_sonarqube", "enableSonarqube"),
    )
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


class SemgrepSettings(ApiModel):
    enabled: bool = False
    rule_timeout_seconds: int = Field(default=30, ge=5, le=600)
    scan_timeout_seconds: int = Field(default=1800, ge=60, le=21600)
    max_target_bytes: int = Field(default=2_000_000, ge=10_000, le=50_000_000)
    # Appended to the built-in dependency and build globs, never instead of them.
    extra_excludes: List[str] = Field(default_factory=list, max_length=100)


class RegexSettings(ApiModel):
    """The engine that runs custom rules and sensitive-data classification in
    one pass over the tree. Either half can be switched off independently."""
    enabled: bool = True
    custom_rules: bool = True
    sensitive_data: bool = True
    max_file_bytes: int = Field(default=2 * 1024 * 1024, ge=10_000, le=50_000_000)
    extra_excludes: List[str] = Field(default_factory=list, max_length=100)


class BearerSettings(ApiModel):
    enabled: bool = True
    scanners: List[Literal["sast", "secrets"]] = Field(default_factory=lambda: ["sast", "secrets"])
    severities: str = "critical,high,medium,low,warning"
    skip_test: bool = True
    skip_paths: List[str] = Field(default_factory=list, max_length=100)
    timeout_seconds: int = Field(default=1800, ge=60, le=21600)


class CodeQLSettings(ApiModel):
    enabled: bool = True
    languages: List[Literal["python", "javascript", "go", "ruby", "java", "csharp", "cpp"]] = Field(
        default_factory=lambda: ["python", "javascript", "go", "ruby"]
    )
    query_suite: Literal["security-and-quality", "security-extended", "code-scanning"] = \
        "security-and-quality"
    build_mode: Literal["none", "autobuild"] = "none"
    timeout_seconds: int = Field(default=3600, ge=60, le=21600)


class EngineSettingsResponse(ApiModel):
    engine: Literal["semgrep", "regex", "bearer", "codeql"]
    config: Dict[str, Any]


class AllEngineSettingsResponse(ApiModel):
    semgrep: SemgrepSettings
    regex: RegexSettings
    bearer: BearerSettings
    codeql: CodeQLSettings


class QueueDepth(ApiModel):
    name: str
    queued: int
    active: int


class HealthResponse(ApiModel):
    status: Literal["ok", "degraded"]
    database: bool
    queues: List[QueueDepth] = Field(default_factory=list)

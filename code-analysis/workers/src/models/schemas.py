from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class ScanFinding(BaseModel):
    """A single issue located in the scanned tree.

    `line` is the start of the span; `end_line` defaults to it for engines that
    only report a point. Both are persisted (findings.start_line / end_line) and
    both participate in the cross-engine dedupe key, so an engine that reports a
    range must not silently collapse it to a point.
    """
    rule_id: str
    severity: str
    message: str
    file_path: str
    line: int
    end_line: Optional[int] = None
    snippet: str = ""


class ScanOptions(BaseModel):
    """Per-scan engine toggles, mirroring RunScanOptions in the TS worker.

    Defaults are permissive: a scan enqueued without options runs everything,
    which is what the API does today when the caller omits them.
    """
    enable_semgrep: bool = True
    enable_sonarqube: bool = True
    enable_custom_rules: bool = True
    enable_sensitive_data: bool = True
    enable_codeql: bool = True


class ScanMessage(BaseModel):
    job_id: str
    scan_id: str
    uri: str
    language: str
    commit_sha: str
    # Rules and overrides are per-tenant; an engine cannot load its
    # configuration without knowing whose scan this is.
    tenant_id: Optional[str] = None
    options: ScanOptions = Field(default_factory=ScanOptions)


class ScanResult(BaseModel):
    """
    The contract every engine publishes on `scan:results`.

    `status` distinguishes a genuinely clean scan from a failed engine: both
    carry an empty `findings` list, and conflating them silently under-reports
    vulnerabilities. Engines that fail must publish status="failed" with the
    reason in `error` so the aggregator never presents a broken scan as a
    clean bill of health.
    """
    job_id: str
    scan_id: str
    engine: str
    findings: List[ScanFinding] = Field(default_factory=list)
    status: Literal["ok", "failed"] = "ok"
    error: Optional[str] = None

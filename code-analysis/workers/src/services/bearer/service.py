import json
import os
import shutil
import tempfile
import subprocess
import asyncio
from typing import Any, Dict, List, Optional

from src.models.schemas import ScanOptions
from src.services.base import EnginePublisher
from src.infrastructure.engine_settings import get_settings
from src.infrastructure.storage import download_codebase

BEARER_TIMEOUT_SECONDS = 1800

SEVERITY_BUCKETS = ("critical", "high", "medium", "low", "warning")

# Bearer severities → canonical scan vocabulary (error / warning / info).
SEVERITY_MAP = {
    "critical": "error",
    "high": "error",
    "medium": "warning",
    "low": "info",
    "warning": "warning",
}


def _line_span(source: Any, item: Dict[str, Any]) -> tuple[int, int]:
    """Bearer reports line numbers as ints, line_number fields, or {line,column} objects."""
    line = int(item.get("line_number") or item.get("start_line_number") or 0)
    end_line = int(item.get("end_line") or item.get("end_line_number") or 0)

    def _from_point(value: Any) -> int:
        if isinstance(value, int):
            return value
        if isinstance(value, dict):
            return int(
                value.get("line")
                or value.get("start_line_number")
                or value.get("start")
                or 0
            )
        return 0

    if isinstance(source, dict):
        if not line:
            line = _from_point(source.get("start")) or int(source.get("start_line_number") or 0)
        if not end_line:
            end_line = (
                _from_point(source.get("end"))
                or int(source.get("end_line_number") or 0)
                or line
            )

    if not end_line:
        end_line = line
    return line, end_line


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(word.capitalize() for word in rest)


def tag_bearer_rule_ids(findings: list) -> list:
    tagged = []
    for finding in findings:
        rule_id = finding.get("rule_id") or "unknown"
        if not rule_id.startswith("bearer."):
            finding = {**finding, "rule_id": f"bearer.{rule_id}"}
        tagged.append(finding)
    return tagged


class BearerService(EnginePublisher):
    engine_name = "bearer"

    def parse_bearer_json(self, report_path: str) -> list:
        if not os.path.exists(report_path):
            return []

        try:
            with open(report_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"[!] Bearer: failed to read report: {e}")
            return []

        findings: List[Dict[str, Any]] = []
        for bucket in SEVERITY_BUCKETS:
            severity = SEVERITY_MAP.get(bucket, "warning")
            for item in data.get(bucket) or []:
                if not isinstance(item, dict):
                    continue
                source = item.get("source") or {}
                line, end_line = _line_span(source, item)
                file_path = item.get("filename") or item.get("full_filename") or ""
                if file_path.startswith("/"):
                    file_path = os.path.basename(file_path)
                message = (item.get("title") or item.get("description") or "").strip()
                if len(message) > 500:
                    message = message.split("\n", 1)[0].strip()
                findings.append({
                    "rule_id": item.get("id") or "unknown",
                    "severity": severity,
                    "message": message or item.get("id") or "Bearer finding",
                    "file_path": file_path,
                    "line": line,
                    "end_line": end_line,
                    "snippet": (item.get("code_extract") or "").strip(),
                })
        return findings

    def run_bearer(
        self,
        repo_path: str,
        output_path: str,
        *,
        scanners: Optional[List[str]] = None,
        severities: str = "critical,high,medium,low,warning",
        skip_test: bool = True,
        skip_paths: Optional[List[str]] = None,
        timeout_seconds: int = BEARER_TIMEOUT_SECONDS,
    ) -> None:
        if not shutil.which("bearer"):
            raise RuntimeError("bearer CLI not found on PATH — install with: brew install bearer/tap/bearer")

        scanner_list = scanners or ["sast", "secrets"]
        cmd = [
            "bearer", "scan", repo_path,
            "--format", "json",
            "--quiet",
            "--output", output_path,
            "--scanner", ",".join(scanner_list),
            "--severity", severities,
            "--exit-code", "0",
        ]
        if skip_test:
            cmd.append("--skip-test")
        for path in skip_paths or []:
            if path.strip():
                cmd.extend(["--skip-path", path.strip()])

        try:
            subprocess.run(
                cmd, capture_output=True, text=True, check=True,
                timeout=timeout_seconds,
            )
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"bearer scan failed: {(e.stderr or e.stdout or '')[:400]}") from None

    async def process_job(self, message: dict):
        uri = message.get("uri")
        job_id = message.get("job_id")
        scan_id = message.get("scan_id")

        print(f"[*] Bearer Service: Processing {job_id}")
        scratch_dir = tempfile.mkdtemp()

        try:
            options = message.get("options") or {}
            opts = ScanOptions.model_validate(options)
            if opts.enable_bearer is False:
                print(f"[*] Bearer Service: disabled for {job_id}, reporting no findings")
                await self._publish(job_id, scan_id, [], "ok", None)
                return

            settings = await get_settings(message.get("tenant_id") or "", "bearer")
            if not settings.get("enabled", True):
                print(f"[*] Bearer Service: disabled in settings for {job_id}")
                await self._publish(job_id, scan_id, [], "ok")
                return

            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            report_path = os.path.join(scratch_dir, "bearer-report.json")
            await asyncio.to_thread(
                self.run_bearer,
                scratch_dir,
                report_path,
                scanners=settings.get("scanners") or ["sast", "secrets"],
                severities=settings.get("severities") or "critical,high,medium,low,warning",
                skip_test=settings.get("skipTest", True),
                skip_paths=settings.get("skipPaths") or [],
                timeout_seconds=settings.get("timeoutSeconds", BEARER_TIMEOUT_SECONDS),
            )
            findings = await asyncio.to_thread(self.parse_bearer_json, report_path)
            await self._publish(job_id, scan_id, tag_bearer_rule_ids(findings), "ok")
            print(f"[*] Bearer Service: Finished {job_id} with {len(findings)} findings.")

        except Exception as e:
            print(f"[!] Bearer Service Error on {job_id}: {e}")
            await self._publish(job_id, scan_id, [], "failed", str(e))
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

import json
import shutil
import tempfile
import subprocess
import asyncio

from src.infrastructure.paths import get_rules_dir
from src.services.base import EnginePublisher
from src.infrastructure.scan_analysis import normalize_semgrep_rule_id, to_repo_relative_path
from src.infrastructure.scan_skip import semgrep_exclude_args, write_semgrep_ignore
from src.infrastructure.rules_repo import load_disabled_rule_ids
from src.infrastructure.storage import download_codebase

# A single pathological rule/file pair can hang for minutes; bound both the
# per-rule and the whole-scan time so one repository cannot occupy a worker slot
# indefinitely.
RULE_TIMEOUT_SECONDS = 30
SCAN_TIMEOUT_SECONDS = 1800
MAX_TARGET_BYTES = 2_000_000


class SemgrepService(EnginePublisher):
    engine_name = "semgrep"

    def run_scan(self, repo_path: str, disabled_rule_ids: set = frozenset()) -> list:
        """Run semgrep and parse its JSON. Raises when semgrep itself failed.

        The blanket `except: return []` this replaces made a crashed scanner
        indistinguishable from a clean repository — silent under-reporting, which
        is the worst failure mode a security product has.
        """
        # Dependency and build directories are excluded twice over: via
        # .semgrepignore (which semgrep honours for target selection) and via
        # explicit --exclude flags. Scanning a vendored bundle produces findings
        # the user cannot act on.
        write_semgrep_ignore(repo_path)

        # Without --config, `semgrep scan` falls back to the registry, which
        # needs network and a login; offline it silently finds nothing.
        cmd = [
            "semgrep", "scan", "--json", "--quiet",
            "--config", get_rules_dir(),
            "--timeout", str(RULE_TIMEOUT_SECONDS),
            "--max-target-bytes", str(MAX_TARGET_BYTES),
            *semgrep_exclude_args(),
            repo_path,
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=False, timeout=SCAN_TIMEOUT_SECONDS
        )

        if not result.stdout.strip():
            raise RuntimeError(
                f"semgrep produced no output (exit {result.returncode}): "
                f"{(result.stderr or '').strip()[:400]}"
            )

        data = json.loads(result.stdout)

        fatal = [e for e in data.get("errors", []) if e.get("level") == "error"]
        if fatal and not data.get("results"):
            raise RuntimeError(f"semgrep failed: {fatal[0].get('message', 'unknown error')}")

        findings = []
        for match in data.get("results", []):
            rule_id = normalize_semgrep_rule_id(match.get("check_id") or "")
            # Compare both forms: an override written before normalization landed
            # still carries the catalogue id, and nothing should start firing again.
            if rule_id in disabled_rule_ids or match.get("check_id") in disabled_rule_ids:
                continue

            start_line = match.get("start", {}).get("line", 0)
            findings.append({
                "rule_id": rule_id,
                "severity": (match.get("extra", {}).get("severity") or "WARNING").lower(),
                "message": match.get("extra", {}).get("message") or "",
                "file_path": to_repo_relative_path(match.get("path", ""), repo_path),
                "line": start_line,
                "end_line": match.get("end", {}).get("line", start_line),
                "snippet": (match.get("extra", {}).get("lines") or "").strip(),
            })
        return findings

    async def process_job(self, message: dict):
        uri = message.get("uri")
        job_id = message.get("job_id")
        scan_id = message.get("scan_id")
        
        print(f"[*] SemgrepService: Processing {job_id} from {uri}")
        scratch_dir = tempfile.mkdtemp()
        
        try:
            options = message.get("options") or {}
            if options.get("enable_semgrep") is False:
                print(f"[*] SemgrepService: disabled for {job_id}, reporting no findings")
                await self._publish(job_id, scan_id, [], "ok", None)
                return

            disabled = await load_disabled_rule_ids(message.get("tenant_id"), "semgrep")
            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            findings = await asyncio.to_thread(self.run_scan, scratch_dir, disabled)
            
            await self._publish(job_id, scan_id, findings, "ok")
            print(f"[*] SemgrepService: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] SemgrepService Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            await self._publish(job_id, scan_id, [], "failed", str(e))
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

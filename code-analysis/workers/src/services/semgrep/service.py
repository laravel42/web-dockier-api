import json
import shutil
import tempfile
import subprocess
import asyncio
from src.services.base import EnginePublisher
from src.infrastructure.scan_analysis import to_repo_relative_path
from src.infrastructure.scan_skip import semgrep_exclude_args, write_semgrep_ignore
from src.infrastructure.rules_repo import load_disabled_rule_ids
from src.infrastructure.storage import download_codebase

class SemgrepService(EnginePublisher):
    engine_name = "semgrep"

    def run_scan(self, repo_path: str, disabled_rule_ids: set = frozenset()) -> list:
        try:
            # Dependency and build directories are excluded twice over: via
            # .semgrepignore (which semgrep honours for target selection) and via
            # explicit --exclude flags. Scanning a vendored bundle produces
            # findings the user cannot act on.
            write_semgrep_ignore(repo_path)
            cmd = ["semgrep", "scan", "--json", "--quiet", *semgrep_exclude_args(), repo_path]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            
            if not result.stdout.strip():
                return []
                
            data = json.loads(result.stdout)
            findings = []
            for match in data.get("results", []):
                # Tenants disable rules from the catalogue; a disabled rule must
                # not keep firing just because semgrep still ships it.
                if match.get("check_id") in disabled_rule_ids:
                    continue

                start_line = match.get("start", {}).get("line", 0)
                findings.append({
                    "rule_id": match.get("check_id"),
                    "severity": match.get("extra", {}).get("severity", "WARNING").lower(),
                    "message": match.get("extra", {}).get("message"),
                    "file_path": to_repo_relative_path(match.get("path", ""), repo_path),
                    "line": start_line,
                    "end_line": match.get("end", {}).get("line", start_line),
                    "snippet": (match.get("extra", {}).get("lines") or "").strip(),
                })
            return findings
        except Exception as e:
            print(f"[SemgrepService Error]: {e}")
            return []

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

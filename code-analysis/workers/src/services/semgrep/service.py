import json
import shutil
import tempfile
import subprocess
import asyncio
from src.models.schemas import ScanFinding, ScanResult
from src.infrastructure.storage import download_codebase
from src.infrastructure.redis_client import get_redis_client

class SemgrepService:
    def __init__(self):
        self.redis = get_redis_client()

    def run_scan(self, repo_path: str) -> list:
        try:
            cmd = ["semgrep", "scan", "--json", "--quiet", repo_path]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            
            if not result.stdout.strip():
                return []
                
            data = json.loads(result.stdout)
            findings = []
            for match in data.get("results", []):
                findings.append({
                    "rule_id": match.get("check_id"),
                    "severity": match.get("extra", {}).get("severity", "WARNING").lower(),
                    "message": match.get("extra", {}).get("message"),
                    "file_path": match.get("path", "").replace(repo_path + "/", ""),
                    "line": match.get("start", {}).get("line", 0)
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
            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            findings = await asyncio.to_thread(self.run_scan, scratch_dir)
            
            result = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="semgrep",
                findings=[ScanFinding.model_validate(f) for f in findings],
                status="ok",
            )
            await self.redis.publish("scan:results", result.model_dump_json())
            print(f"[*] SemgrepService: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] SemgrepService Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            failure = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="semgrep",
                findings=[],
                status="failed",
                error=str(e),
            )
            await self.redis.publish("scan:results", failure.model_dump_json())
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

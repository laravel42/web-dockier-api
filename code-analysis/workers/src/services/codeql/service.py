import os
import json
import shutil
import tempfile
import subprocess
import asyncio
from src.models.schemas import ScanFinding, ScanResult
from src.infrastructure.storage import download_codebase
from src.infrastructure.redis_client import get_redis_client

class CodeQLService:
    def __init__(self):
        self.redis = get_redis_client()

    def parse_codeql_sarif(self, sarif_path: str) -> list:
        if not os.path.exists(sarif_path):
            return []
            
        try:
            with open(sarif_path, "r") as f:
                data = json.load(f)
                
            findings = []
            for run in data.get("runs", []):
                for result in run.get("results", []):
                    rule_id = result.get("ruleId", "unknown")
                    message = result.get("message", {}).get("text", "")
                    
                    severity = "medium"
                    
                    locations = result.get("locations", [])
                    if locations:
                        phys_loc = locations[0].get("physicalLocation", {})
                        file_path = phys_loc.get("artifactLocation", {}).get("uri", "")
                        line = phys_loc.get("region", {}).get("startLine", 0)
                    else:
                        file_path = ""
                        line = 0
                        
                    findings.append({
                        "rule_id": rule_id,
                        "severity": severity,
                        "message": message,
                        "file_path": file_path,
                        "line": line
                    })
            return findings
        except Exception as e:
            print(f"[!] Error parsing SARIF: {e}")
            return []

    def run_codeql(self, repo_path: str, language: str) -> str:
        db_path = os.path.join(repo_path, "codeql-db")
        sarif_path = os.path.join(repo_path, "codeql-results.sarif")
        
        create_cmd = [
            "codeql", "database", "create", db_path,
            f"--language={language}",
            f"--source-root={repo_path}"
        ]
        
        analyze_cmd = [
            "codeql", "database", "analyze", db_path,
            f"{language}-security-and-quality.qls",
            "--format=sarif-latest",
            f"--output={sarif_path}"
        ]
        
        if not shutil.which("codeql"):
            # A missing engine binary is an engine failure, not a clean scan and
            # certainly not a source of synthetic findings.
            raise RuntimeError("codeql CLI not found on PATH")

        try:
            subprocess.run(create_cmd, capture_output=True, text=True, check=True)
            subprocess.run(analyze_cmd, capture_output=True, text=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"[!] CodeQL error: {e.stderr}")
            raise

        return sarif_path

    async def process_job(self, message: dict):
        uri = message.get("uri")
        job_id = message.get("job_id")
        scan_id = message.get("scan_id")
        language = message.get("language")
        
        print(f"[*] CodeQL Service: Processing {job_id} for language {language}")
        scratch_dir = tempfile.mkdtemp()
        
        try:
            findings = []
            if language and language != "unknown":
                await asyncio.to_thread(download_codebase, uri, scratch_dir)
                sarif_path = await asyncio.to_thread(self.run_codeql, scratch_dir, language)
                findings = self.parse_codeql_sarif(sarif_path)
            else:
                print(f"[*] CodeQL Service: Skipping {job_id} because language is unknown or unsupported.")
                
            result = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="codeql",
                findings=[ScanFinding.model_validate(f) for f in findings],
                status="ok",
            )
            await self.redis.publish("scan:results", result.model_dump_json())
            print(f"[*] CodeQL Service: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] CodeQL Service Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            failure = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="codeql",
                findings=[],
                status="failed",
                error=str(e),
            )
            await self.redis.publish("scan:results", failure.model_dump_json())
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

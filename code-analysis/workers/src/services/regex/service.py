import os
import shutil
import tempfile
import asyncio
from src.models.schemas import ScanFinding, ScanResult
from src.infrastructure.storage import download_codebase
from src.infrastructure.redis_client import get_redis_client
from src.services.regex.rules import get_compiled_rules

class RegexService:
    def __init__(self):
        self.redis = get_redis_client()

    def run_scan(self, repo_path: str) -> list:
        findings = []
        rules = get_compiled_rules()
        
        for root, _, files in os.walk(repo_path):
            for file in files:
                file_path = os.path.join(root, file)
                # Skip binary files or large dependencies in a real implementation
                if ".git" in file_path or "node_modules" in file_path:
                    continue
                    
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                        
                    for line_num, line in enumerate(lines, 1):
                        for rule_id, pattern, message, severity in rules:
                            if pattern.search(line):
                                findings.append({
                                    "rule_id": rule_id,
                                    "severity": severity,
                                    "message": message,
                                    "file_path": file_path.replace(repo_path + "/", ""),
                                    "line": line_num
                                })
                except UnicodeDecodeError:
                    pass # Skip binary files
                except Exception as e:
                    print(f"[RegexService] Error reading {file_path}: {e}")
                    
        return findings

    async def process_job(self, message: dict):
        uri = message.get("uri")
        job_id = message.get("job_id")
        scan_id = message.get("scan_id")
        
        print(f"[*] RegexService: Processing {job_id} from {uri}")
        scratch_dir = tempfile.mkdtemp()
        
        try:
            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            findings = await asyncio.to_thread(self.run_scan, scratch_dir)
            
            result = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="regex",
                findings=[ScanFinding.model_validate(f) for f in findings],
                status="ok",
            )
            await self.redis.publish("scan:results", result.model_dump_json())
            print(f"[*] RegexService: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] RegexService Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            failure = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="regex",
                findings=[],
                status="failed",
                error=str(e),
            )
            await self.redis.publish("scan:results", failure.model_dump_json())
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

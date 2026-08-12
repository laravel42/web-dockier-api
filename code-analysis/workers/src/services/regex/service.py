import os
import shutil
import tempfile
import asyncio
from src.models.schemas import ScanFinding, ScanResult
from src.infrastructure.storage import download_codebase
from src.infrastructure.redis_client import get_redis_client
from src.services.regex.rules import get_compiled_rules
from src.infrastructure.scan_skip import (
    MAX_SOURCE_FILE_BYTES,
    is_generated_asset_name,
    is_scan_skipped_dir_name,
    is_scan_skipped_relative_path,
    looks_minified,
)

class RegexService:
    def __init__(self):
        self.redis = get_redis_client()

    def run_scan(self, repo_path: str) -> list:
        findings = []
        rules = get_compiled_rules()

        for root, dirs, files in os.walk(repo_path):
            # Prune in place so os.walk never descends into node_modules, vendor,
            # dist and friends. The previous check was `".git" in file_path`, a
            # substring match that also excluded .gitignore while letting every
            # other dependency directory through.
            dirs[:] = [d for d in dirs if not is_scan_skipped_dir_name(d)]

            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, repo_path)

                if is_scan_skipped_relative_path(rel_path):
                    continue
                # Published vendor bundles live in ordinary directories such as
                # public/, so name-based detection is needed on top of pruning.
                if is_generated_asset_name(file):
                    continue

                try:
                    if os.path.getsize(file_path) > MAX_SOURCE_FILE_BYTES:
                        continue

                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()

                    # Catches minified assets that carry no .min in the name. A
                    # finding on line 2 of a 400 KB line is unusable anyway.
                    if looks_minified(content):
                        continue

                    for line_num, line in enumerate(content.splitlines(), 1):
                        for rule_id, pattern, message, severity in rules:
                            if pattern.search(line):
                                findings.append({
                                    "rule_id": rule_id,
                                    "severity": severity,
                                    "message": message,
                                    "file_path": rel_path,
                                    "line": line_num,
                                    "end_line": line_num,
                                    "snippet": line.strip(),
                                })
                except UnicodeDecodeError:
                    pass  # Skip binary files
                except OSError as e:
                    print(f"[RegexService] Error reading {rel_path}: {e}")

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

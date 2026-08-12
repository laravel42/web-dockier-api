import os
import json
import shutil
import tempfile
import asyncio
from git import Repo

from src.infrastructure.storage import get_store, upload_codebase
from src.infrastructure.redis_client import get_redis_client
from src.infrastructure.db_client import execute_query

SCRATCHPAD_PREFIX = "dockier-gateway-"

class GatewayService:
    def __init__(self):
        self.redis = get_redis_client()

    def _detect_language(self, repo_path: str) -> str:
        if os.path.exists(os.path.join(repo_path, "package.json")):
            return "javascript"
        if os.path.exists(os.path.join(repo_path, "requirements.txt")) or os.path.exists(os.path.join(repo_path, "Pipfile")):
            return "python"
        if os.path.exists(os.path.join(repo_path, "go.mod")):
            return "go"
        if os.path.exists(os.path.join(repo_path, "Gemfile")):
            return "ruby"
            
        for root, _, files in os.walk(repo_path):
            for file in files:
                if file.endswith(".py"): return "python"
                if file.endswith(".js") or file.endswith(".ts"): return "javascript"
                if file.endswith(".go"): return "go"
                if file.endswith(".rb"): return "ruby"
                
        return "unknown"

    def _shallow_clone(self, clone_url: str, commit_sha: str, target_dir: str):
        repo = Repo.clone_from(clone_url, target_dir, depth=1)
        repo.git.checkout(commit_sha)

    async def process_job(self, job_id: str, payload: dict):
        print(f"[*] GatewayService: Processing job {job_id}")
        scratch_dir = tempfile.mkdtemp(prefix=SCRATCHPAD_PREFIX)
        scan_id = payload.get("scanId")
        
        try:
            await asyncio.to_thread(self._shallow_clone, payload.get("cloneUrl"), payload.get("commitSha"), scratch_dir)
            lang = self._detect_language(scratch_dir)
            uri = await asyncio.to_thread(upload_codebase, scratch_dir, scan_id)
            
            scan_msg = {
                "job_id": job_id,
                "scan_id": scan_id,
                "uri": uri,
                "language": lang,
                "commit_sha": payload.get("commitSha")
            }
            
            msg_str = json.dumps(scan_msg)
            await self.redis.publish("scan:semgrep", msg_str)
            await self.redis.publish("scan:regex", msg_str)
            await self.redis.publish("scan:sonarqube", msg_str)
            await self.redis.publish("scan:codeql", msg_str)
            
            print(f"[*] GatewayService: Job {job_id} delegated. URI: {uri}")
            
        except Exception as err:
            print(f"[!] GatewayService Error: {err}")
            error_payload = json.dumps({"error": str(err)})
            await execute_query(
                "UPDATE pgboss.job SET state = 'failed', completedon = now(), output = $1 WHERE id = $2",
                error_payload, job_id
            )
            await execute_query(
                "UPDATE security_scans SET status = 'failed', completed_at = now() WHERE id = $1", 
                scan_id
            )
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

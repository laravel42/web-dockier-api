import shutil
import tempfile
import subprocess
import httpx
import asyncio
from src.models.schemas import ScanFinding, ScanResult
from src.infrastructure.scan_skip import sonar_exclusion_globs
from src.infrastructure.storage import download_codebase
from src.infrastructure.secret_manager import get_cloudflare_secret
from src.infrastructure.redis_client import get_redis_client

class SonarQubeService:
    def __init__(self):
        self.redis = get_redis_client()

    async def fetch_sonar_issues(self, sonar_url: str, sonar_token: str, project_key: str) -> list:
        api_url = f"{sonar_url.rstrip('/')}/api/issues/search"
        params = {
            "componentKeys": project_key,
            "resolved": "false"
        }
        
        await asyncio.sleep(5)
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(api_url, params=params, auth=(sonar_token, ""))
                resp.raise_for_status()
                data = resp.json()
                
                findings = []
                for issue in data.get("issues", []):
                    line = issue.get("line", 0)
                    text_range = issue.get("textRange") or {}
                    findings.append({
                        "rule_id": issue.get("rule"),
                        "severity": issue.get("severity", "WARNING").lower(),
                        "message": issue.get("message"),
                        "file_path": issue.get("component", "").replace(f"{project_key}:", ""),
                        "line": text_range.get("startLine", line),
                        "end_line": text_range.get("endLine", line),
                        # The issues API does not return source text; snippets for
                        # SonarQube findings would need a second /api/sources call.
                        "snippet": "",
                    })
                return findings
            except Exception as e:
                print(f"[!] Failed to fetch SonarQube issues: {e}")
                return []

    def run_sonar_scanner(self, repo_path: str, project_key: str, sonar_url: str, sonar_token: str):
        cmd = [
            "sonar-scanner",
            f"-Dsonar.projectKey={project_key}",
            f"-Dsonar.sources=.",
            f"-Dsonar.exclusions={sonar_exclusion_globs()}",
            f"-Dsonar.host.url={sonar_url}",
            f"-Dsonar.login={sonar_token}"
        ]
        try:
            if shutil.which("sonar-scanner"):
                subprocess.run(cmd, cwd=repo_path, capture_output=True, text=True, check=True)
            else:
                print("[!] sonar-scanner CLI not found. Skipping actual execution.")
        except subprocess.CalledProcessError as e:
            print(f"[!] Sonar scanner error: {e.stderr}")
            raise e

    async def process_job(self, message: dict):
        uri = message.get("uri")
        job_id = message.get("job_id")
        scan_id = message.get("scan_id")
        
        print(f"[*] SonarQube Service: Processing {job_id} from {uri}")
        scratch_dir = tempfile.mkdtemp()
        
        try:
            sonar_url = await get_cloudflare_secret("SONAR_HOST_URL")
            sonar_token = await get_cloudflare_secret("SONAR_TOKEN")
            project_key = f"dockier_{scan_id}"
            
            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            await asyncio.to_thread(self.run_sonar_scanner, scratch_dir, project_key, sonar_url, sonar_token)
            findings = await self.fetch_sonar_issues(sonar_url, sonar_token, project_key)
            
            result = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="sonarqube",
                findings=[ScanFinding.model_validate(f) for f in findings],
                status="ok",
            )
            await self.redis.publish("scan:results", result.model_dump_json())
            print(f"[*] SonarQube Service: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] SonarQube Service Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            failure = ScanResult(
                job_id=job_id,
                scan_id=scan_id,
                engine="sonarqube",
                findings=[],
                status="failed",
                error=str(e),
            )
            await self.redis.publish("scan:results", failure.model_dump_json())
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

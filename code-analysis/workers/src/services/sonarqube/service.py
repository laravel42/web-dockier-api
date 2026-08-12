import shutil
import tempfile
import subprocess
import httpx
import asyncio
from src.services.base import EnginePublisher
from src.infrastructure.scan_skip import sonar_exclusion_globs
from src.infrastructure.rules_repo import load_disabled_rule_ids
from src.infrastructure.storage import download_codebase
from src.infrastructure.secret_manager import get_cloudflare_secret

class SonarQubeService(EnginePublisher):
    engine_name = "sonarqube"

    async def fetch_sonar_issues(self, sonar_url: str, sonar_token: str, project_key: str,
                                 disabled_rule_ids: set = frozenset()) -> list:
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
                    if issue.get("rule") in disabled_rule_ids:
                        continue
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
            options = message.get("options") or {}
            if options.get("enable_sonarqube") is False:
                print(f"[*] SonarQube Service: disabled for {job_id}, reporting no findings")
                await self._publish(job_id, scan_id, [], "ok", None)
                return

            disabled = await load_disabled_rule_ids(message.get("tenant_id"), "sonarqube")
            sonar_url = await get_cloudflare_secret("SONAR_HOST_URL")
            sonar_token = await get_cloudflare_secret("SONAR_TOKEN")
            project_key = f"dockier_{scan_id}"
            
            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            await asyncio.to_thread(self.run_sonar_scanner, scratch_dir, project_key, sonar_url, sonar_token)
            findings = await self.fetch_sonar_issues(sonar_url, sonar_token, project_key, disabled)
            
            await self._publish(job_id, scan_id, findings, "ok")
            print(f"[*] SonarQube Service: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] SonarQube Service Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            await self._publish(job_id, scan_id, [], "failed", str(e))
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

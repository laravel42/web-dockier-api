import os
import shutil
import tempfile
import subprocess
import httpx
import asyncio
from typing import Optional
from src.services.base import EnginePublisher
from src.infrastructure.scan_skip import sonar_exclusion_globs
from src.infrastructure.rules_repo import load_disabled_rule_ids
from src.infrastructure.engine_settings import get_settings
from src.infrastructure.storage import download_codebase
from src.infrastructure.secret_manager import first_secret

# Sonar analysis is asynchronous server-side: sonar-scanner uploads a report and
# returns, then the Compute Engine processes it. The previous implementation slept
# 5 seconds and queried anyway, so on any non-trivial repo it read the issues API
# before the report existed and reported zero findings.
SCANNER_TIMEOUT_SECONDS = 1800
CE_POLL_INTERVAL_SECONDS = 3
CE_POLL_TIMEOUT_SECONDS = 900


class SonarQubeService(EnginePublisher):
    engine_name = "sonarqube"

    async def fetch_sonar_issues(self, sonar_url: str, sonar_token: str, project_key: str,
                                 disabled_rule_ids: set = frozenset()) -> list:
        api_url = f"{sonar_url.rstrip('/')}/api/issues/search"
        params = {
            "componentKeys": project_key,
            "resolved": "false"
        }
        
        
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
                # Propagate: an unreachable Sonar server is an engine failure,
                # not a repository with no issues.
                raise RuntimeError(f"failed to fetch SonarQube issues: {e}") from None

    def run_sonar_scanner(self, repo_path: str, project_key: str, sonar_url: str,
                          sonar_token: str, extra_exclusions: Optional[list] = None,
                          quality_profile: str = "") -> Optional[str]:
        """Run sonar-scanner and return the Compute Engine task id.

        The token goes in the environment, not argv: `-Dsonar.login=<token>` is
        visible to every process on the host via the process list, and
        sonar.login is deprecated in favour of sonar.token.
        """
        if not shutil.which("sonar-scanner"):
            raise RuntimeError("sonar-scanner CLI not found on PATH")

        # Tenant exclusions are appended, never substituted: the built-in
        # dependency and build globs are not theirs to remove.
        exclusions = ",".join(filter(None, [sonar_exclusion_globs(), *(extra_exclusions or [])]))
        cmd = [
            "sonar-scanner",
            f"-Dsonar.projectKey={project_key}",
            "-Dsonar.sources=.",
            f"-Dsonar.exclusions={exclusions}",
            f"-Dsonar.host.url={sonar_url}",
        ]
        if quality_profile:
            cmd.append(f"-Dsonar.profile={quality_profile}")
        env = {**os.environ, "SONAR_TOKEN": sonar_token}
        try:
            subprocess.run(cmd, cwd=repo_path, capture_output=True, text=True,
                           check=True, env=env, timeout=SCANNER_TIMEOUT_SECONDS)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"sonar-scanner failed: {(e.stderr or '')[:400]}") from None

        return self._read_ce_task_id(repo_path)

    @staticmethod
    def _read_ce_task_id(repo_path: str) -> Optional[str]:
        """Parse ceTaskId out of the report-task.txt the scanner leaves behind."""
        report = os.path.join(repo_path, ".scannerwork", "report-task.txt")
        if not os.path.exists(report):
            return None
        with open(report, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("ceTaskId="):
                    return line.split("=", 1)[1].strip()
        return None

    async def wait_for_analysis(self, sonar_url: str, sonar_token: str, task_id: str,
                                timeout_seconds: int = CE_POLL_TIMEOUT_SECONDS) -> None:
        """Block until the Compute Engine task finishes, or give up loudly."""
        url = f"{sonar_url.rstrip('/')}/api/ce/task"
        waited = 0
        async with httpx.AsyncClient() as client:
            while waited < timeout_seconds:
                resp = await client.get(url, params={"id": task_id}, auth=(sonar_token, ""))
                resp.raise_for_status()
                status = resp.json().get("task", {}).get("status")
                if status == "SUCCESS":
                    return
                if status in ("FAILED", "CANCELED"):
                    raise RuntimeError(f"SonarQube analysis {status.lower()}")
                await asyncio.sleep(CE_POLL_INTERVAL_SECONDS)
                waited += CE_POLL_INTERVAL_SECONDS
        raise RuntimeError(f"SonarQube analysis did not finish within {timeout_seconds}s")

    async def delete_project(self, sonar_url: str, sonar_token: str, project_key: str) -> None:
        """Remove the per-scan project.

        A project per scan is created and never deleted otherwise, so the Sonar
        server accumulates one dead project per scan forever.
        """
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{sonar_url.rstrip('/')}/api/projects/delete",
                    params={"project": project_key}, auth=(sonar_token, ""),
                )
        except Exception as e:
            print(f"[!] SonarQube: could not delete scratch project {project_key}: {e}")

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

            settings = await get_settings(message.get("tenant_id") or "", "sonarqube")
            if not settings.get("enabled", True):
                print(f"[*] SonarQube Service: disabled in settings for {job_id}")
                await self._publish(job_id, scan_id, [], "ok")
                return

            disabled = await load_disabled_rule_ids(message.get("tenant_id"), "sonarqube")
            # A stored host wins over the environment: it is the tenant's own
            # server, and the env value is only a deployment-wide fallback.
            # Same server, historically two namings: this service used SONAR_*
            # and the backend SONARQUBE_*. Both are accepted on both sides now,
            # so one pair configures the whole platform.
            sonar_url = settings.get("hostUrl") or await first_secret(
                "SONARQUBE_URL", "SONAR_HOST_URL")
            sonar_token = await first_secret("SONARQUBE_TOKEN", "SONAR_TOKEN")
            project_key = f"dockier_{scan_id}"
            
            await asyncio.to_thread(download_codebase, uri, scratch_dir)
            task_id = await asyncio.to_thread(
                self.run_sonar_scanner, scratch_dir, project_key, sonar_url, sonar_token,
                settings.get("extraExclusions") or [], settings.get("qualityProfile") or "")
            if task_id:
                await self.wait_for_analysis(
                    sonar_url, sonar_token, task_id,
                    timeout_seconds=settings.get("ceTimeoutSeconds", CE_POLL_TIMEOUT_SECONDS))
            findings = await self.fetch_sonar_issues(sonar_url, sonar_token, project_key, disabled)
            if settings.get("deleteScratchProject", True):
                await self.delete_project(sonar_url, sonar_token, project_key)
            
            await self._publish(job_id, scan_id, findings, "ok")
            print(f"[*] SonarQube Service: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] SonarQube Service Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            await self._publish(job_id, scan_id, [], "failed", str(e))
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

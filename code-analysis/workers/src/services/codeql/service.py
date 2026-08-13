import os
import json
import shutil
import tempfile
import subprocess
import asyncio
from src.services.base import EnginePublisher
from src.infrastructure.storage import download_codebase
from src.infrastructure.engine_settings import get_settings

# CodeQL supports these; anything else is skipped rather than failed, since an
# unsupported language is a property of the repo, not an engine fault.
SUPPORTED_LANGUAGES = {"python", "javascript", "go", "ruby", "java", "csharp", "cpp"}
CODEQL_LANGUAGES = SUPPORTED_LANGUAGES

SARIF_LEVELS = {"error": "error", "warning": "warning", "note": "info", "none": "info"}

CODEQL_TIMEOUT_SECONDS = 3600


class CodeQLService(EnginePublisher):
    engine_name = "codeql"

    @staticmethod
    def _severity_from_rules(run: dict) -> dict:
        """Map ruleId -> severity using the SARIF driver's rule metadata.

        Every finding was previously hardcoded to "medium", discarding both
        `level` and the `security-severity` score CodeQL emits — so a critical
        RCE and a style note landed identically.
        """
        severities = {}
        driver = run.get("tool", {}).get("driver", {})
        for rule in driver.get("rules", []):
            rule_id = rule.get("id")
            if not rule_id:
                continue
            props = rule.get("properties", {}) or {}
            score = props.get("security-severity")
            if score is not None:
                try:
                    score = float(score)
                    severities[rule_id] = (
                        "error" if score >= 7.0 else "warning" if score >= 4.0 else "info"
                    )
                    continue
                except (TypeError, ValueError):
                    pass
            level = (rule.get("defaultConfiguration", {}) or {}).get("level")
            severities[rule_id] = SARIF_LEVELS.get(level, "warning")
        return severities

    def parse_codeql_sarif(self, sarif_path: str) -> list:
        if not os.path.exists(sarif_path):
            return []
            
        try:
            with open(sarif_path, "r") as f:
                data = json.load(f)
                
            findings = []
            for run in data.get("runs", []):
                rule_severities = self._severity_from_rules(run)
                for result in run.get("results", []):
                    rule_id = result.get("ruleId", "unknown")
                    message = result.get("message", {}).get("text", "")

                    severity = rule_severities.get(
                        rule_id, SARIF_LEVELS.get(result.get("level"), "warning")
                    )
                    
                    locations = result.get("locations", [])
                    if locations:
                        phys_loc = locations[0].get("physicalLocation", {})
                        file_path = phys_loc.get("artifactLocation", {}).get("uri", "")
                        region = phys_loc.get("region", {})
                        line = region.get("startLine", 0)
                        end_line = region.get("endLine", line)
                        snippet = (region.get("snippet", {}).get("text") or "").strip()
                    else:
                        file_path = ""
                        line = 0
                        end_line = 0
                        snippet = ""

                    findings.append({
                        "rule_id": rule_id,
                        "severity": severity,
                        "message": message,
                        "file_path": file_path,
                        "line": line,
                        "end_line": end_line,
                        "snippet": snippet,
                    })
            return findings
        except Exception as e:
            print(f"[!] Error parsing SARIF: {e}")
            return []

    def run_codeql(self, repo_path: str, language: str, work_dir: str,
                   suite: str = "security-and-quality", build_mode: str = "none",
                   timeout_seconds: int = CODEQL_TIMEOUT_SECONDS) -> str:
        # The database and SARIF live outside --source-root: writing them inside
        # made CodeQL index its own database as if it were the user's code.
        db_path = os.path.join(work_dir, f"codeql-db-{language}")
        sarif_path = os.path.join(work_dir, f"codeql-results-{language}.sarif")

        create_cmd = [
            "codeql", "database", "create", db_path,
            f"--language={language}",
            f"--source-root={repo_path}",
            # Compiled languages otherwise need a build command and fail outright.
            f"--build-mode={build_mode}",
            "--overwrite",
        ]

        analyze_cmd = [
            "codeql", "database", "analyze", db_path,
            # Pack form: a bare `<lang>-security-and-quality.qls` does not resolve.
            f"codeql/{language}-queries:codeql-suites/{language}-{suite}.qls",
            "--format=sarif-latest",
            f"--output={sarif_path}",
        ]
        
        if not shutil.which("codeql"):
            # A missing engine binary is an engine failure, not a clean scan and
            # certainly not a source of synthetic findings.
            raise RuntimeError("codeql CLI not found on PATH")

        try:
            subprocess.run(create_cmd, capture_output=True, text=True, check=True,
                           timeout=timeout_seconds)
            subprocess.run(analyze_cmd, capture_output=True, text=True, check=True,
                           timeout=timeout_seconds)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(
                f"codeql {language} analysis failed: {(e.stderr or '')[:400]}") from None

        return sarif_path

    async def process_job(self, message: dict):
        uri = message.get("uri")
        job_id = message.get("job_id")
        scan_id = message.get("scan_id")
        language = message.get("language")
        
        print(f"[*] CodeQL Service: Processing {job_id} for language {language}")
        scratch_dir = tempfile.mkdtemp()
        
        try:
            options = message.get("options") or {}
            if options.get("enable_codeql") is False:
                print(f"[*] CodeQL Service: disabled for {job_id}, reporting no findings")
                await self._publish(job_id, scan_id, [], "ok", None)
                return

            settings = await get_settings(message.get("tenant_id") or "", "codeql")
            if not settings.get("enabled", True):
                print(f"[*] CodeQL Service: disabled in settings for {job_id}")
                await self._publish(job_id, scan_id, [], "ok")
                return

            # One database per language: analysing only whichever language the
            # gateway happened to list first silently skipped the rest of a
            # polyglot repo. The tenant's list narrows what was detected; it
            # cannot add a language the repo does not contain.
            allowed = set(settings.get("languages") or CODEQL_LANGUAGES) & SUPPORTED_LANGUAGES
            languages = [
                lang for lang in (message.get("languages") or ([language] if language else []))
                if lang in allowed
            ]

            findings = []
            if languages:
                work_dir = tempfile.mkdtemp(prefix="dockier-codeql-")
                try:
                    await asyncio.to_thread(download_codebase, uri, scratch_dir)
                    for lang in languages:
                        sarif_path = await asyncio.to_thread(
                            self.run_codeql, scratch_dir, lang, work_dir,
                            settings.get("querySuite", "security-and-quality"),
                            settings.get("buildMode", "none"),
                            settings.get("timeoutSeconds", CODEQL_TIMEOUT_SECONDS))
                        # SARIF can be tens of megabytes; parsing it on the event
                        # loop blocks every other worker in the process.
                        findings.extend(
                            await asyncio.to_thread(self.parse_codeql_sarif, sarif_path))
                finally:
                    shutil.rmtree(work_dir, ignore_errors=True)
            else:
                print(f"[*] CodeQL Service: Skipping {job_id}: no supported language "
                      f"(saw {message.get('languages') or language!r})")
                
            await self._publish(job_id, scan_id, findings, "ok")
            print(f"[*] CodeQL Service: Finished {job_id} with {len(findings)} findings.")
            
        except Exception as e:
            print(f"[!] CodeQL Service Error on {job_id}: {e}")
            # Publish so the aggregator barrier still clears, but mark the
            # engine failed so an empty result is never read as "clean".
            await self._publish(job_id, scan_id, [], "failed", str(e))
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)

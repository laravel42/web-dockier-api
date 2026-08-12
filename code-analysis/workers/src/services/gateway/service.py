import os
import re
import json
import shutil
import tempfile
import asyncio
from urllib.parse import urlparse, urlunparse
from git import Repo

from src.infrastructure.storage import get_store, upload_codebase
from src.infrastructure.redis_client import get_redis_client
from src.infrastructure.secret_manager import get_cloudflare_secret
from src.infrastructure.db_client import execute_query

SCRATCHPAD_PREFIX = "dockier-gateway-"

# git treats several URL schemes as executable transports: `ext::` runs an
# arbitrary command, and `file://`/`ssh://` reach local paths and hosts this
# service should never touch. Only https is a fetch of remote content.
ALLOWED_CLONE_SCHEMES = {"https"}

_CREDENTIALS_IN_URL = re.compile(r"(?i)(https?://)[^/\s:@]+(?::[^/\s@]*)?@")


def redact_credentials(text: str) -> str:
    """Strip embedded userinfo from anything about to be logged or persisted.

    A cloneUrl of the form https://user:token@host/repo.git otherwise reaches
    the logs and the pgboss.job.output column verbatim when a clone fails.
    """
    return _CREDENTIALS_IN_URL.sub(r"\1***@", text or "")


def validate_clone_url(clone_url: str) -> str:
    """Reject clone URLs that git would treat as something other than an https fetch.

    Host restriction is opt-in via ALLOWED_CLONE_HOSTS (comma-separated) because
    self-hosted GitLab is in scope; when unset, any https host is accepted.
    """
    if not clone_url or not clone_url.strip():
        raise ValueError("cloneUrl is required")

    clone_url = clone_url.strip()
    if clone_url.startswith("-"):
        # Otherwise git parses it as an option, e.g. --upload-pack=<command>.
        raise ValueError("cloneUrl must not begin with '-'")

    parsed = urlparse(clone_url)
    if parsed.scheme.lower() not in ALLOWED_CLONE_SCHEMES:
        raise ValueError(
            f"cloneUrl scheme {parsed.scheme or '(none)'!r} is not allowed; "
            f"permitted: {sorted(ALLOWED_CLONE_SCHEMES)}"
        )
    if not parsed.hostname:
        raise ValueError("cloneUrl must include a host")

    allowed_hosts = {
        h.strip().lower() for h in os.getenv("ALLOWED_CLONE_HOSTS", "").split(",") if h.strip()
    }
    if allowed_hosts and parsed.hostname.lower() not in allowed_hosts:
        raise ValueError(f"cloneUrl host {parsed.hostname!r} is not in ALLOWED_CLONE_HOSTS")

    return clone_url

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

    async def _resolve_clone_credentials(self, clone_url: str) -> str:
        """Inject a token from the secret manager, per gateway/README.md.

        Returns the URL to hand to git. The token lives only in this value; it
        is never logged, never published in the scan message, and never written
        to the database — every such path goes through redact_credentials().
        Absent a configured token the URL is returned unchanged, which is the
        correct behaviour for public repositories.
        """
        try:
            token = await get_cloudflare_secret("GIT_CLONE_TOKEN")
        except Exception:
            return clone_url

        if not token:
            return clone_url

        parsed = urlparse(clone_url)
        netloc = f"x-access-token:{token}@{parsed.netloc}"
        return urlunparse(parsed._replace(netloc=netloc))

    def _shallow_clone(self, clone_url: str, commit_sha: str, target_dir: str):
        # GIT_TERMINAL_PROMPT=0 makes an auth-required clone fail fast instead
        # of blocking the worker thread on an interactive credential prompt.
        env = {"GIT_TERMINAL_PROMPT": "0"}
        repo = Repo.clone_from(clone_url, target_dir, depth=1, env=env)
        repo.git.checkout(commit_sha)

    async def process_job(self, job_id: str, payload: dict):
        print(f"[*] GatewayService: Processing job {job_id}")
        scratch_dir = tempfile.mkdtemp(prefix=SCRATCHPAD_PREFIX)
        scan_id = payload.get("scanId")
        
        try:
            clone_url = validate_clone_url(payload.get("cloneUrl"))
            authenticated_url = await self._resolve_clone_credentials(clone_url)
            await asyncio.to_thread(
                self._shallow_clone, authenticated_url, payload.get("commitSha"), scratch_dir
            )
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
            # Redact before this reaches stdout or pgboss.job.output: the failing
            # URL may carry an injected or caller-supplied token.
            safe_error = redact_credentials(str(err))
            print(f"[!] GatewayService Error: {safe_error}")
            error_payload = json.dumps({"error": safe_error})
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

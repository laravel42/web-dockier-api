import os
import re
import shutil
import tempfile
import asyncio
from typing import Any, Dict
from urllib.parse import urlparse
from git import Repo

from src.infrastructure import queue
from src.infrastructure.storage import upload_codebase
from src.infrastructure.git_repo import resolve_clone_url, get_scan_target
from src.infrastructure.scan_skip import is_scan_skipped_dir_name
from src.infrastructure.scans_repo import fail_scan
from src.models.schemas import ScanMessage, ScanOptions

SCRATCHPAD_PREFIX = "dockier-gateway-"

# git treats several URL schemes as executable transports: `ext::` runs an
# arbitrary command, and `file://`/`ssh://` reach local paths and hosts this
# service should never touch. Only https is a fetch of remote content.
ALLOWED_CLONE_SCHEMES = {"https"}

_CREDENTIALS_IN_URL = re.compile(r"(?i)(https?://)[^/\s:@]+(?::[^/\s@]*)?@")

# Language detection walks the tree, so it is bounded: the gateway README
# requires lightweight heuristics, and an unbounded walk of a large monorepo on
# the event loop was blocking every other worker in the process.
MAX_DETECT_FILES = 2_000

MANIFEST_LANGUAGES = [
    ("package.json", "javascript"),
    ("requirements.txt", "python"),
    ("Pipfile", "python"),
    ("pyproject.toml", "python"),
    ("go.mod", "go"),
    ("Gemfile", "ruby"),
    ("composer.json", "php"),
    ("pom.xml", "java"),
]

EXTENSION_LANGUAGES = {
    ".py": "python", ".js": "javascript", ".ts": "javascript", ".tsx": "javascript",
    ".jsx": "javascript", ".go": "go", ".rb": "ruby", ".php": "php", ".java": "java",
}


def redact_credentials(text: str) -> str:
    """Strip embedded userinfo from anything about to be logged or persisted."""
    return _CREDENTIALS_IN_URL.sub(r"\1***@", text or "")


def validate_clone_url(clone_url: str) -> str:
    """Reject clone URLs that git would treat as something other than an https fetch."""
    if not clone_url or not clone_url.strip():
        raise ValueError("clone url is required")

    clone_url = clone_url.strip()
    if clone_url.startswith("-"):
        # Otherwise git parses it as an option, e.g. --upload-pack=<command>.
        raise ValueError("clone url must not begin with '-'")

    parsed = urlparse(clone_url)
    if parsed.scheme.lower() not in ALLOWED_CLONE_SCHEMES:
        raise ValueError(
            f"clone url scheme {parsed.scheme or '(none)'!r} is not allowed; "
            f"permitted: {sorted(ALLOWED_CLONE_SCHEMES)}"
        )
    if not parsed.hostname:
        raise ValueError("clone url must include a host")

    allowed_hosts = {
        h.strip().lower() for h in os.getenv("ALLOWED_CLONE_HOSTS", "").split(",") if h.strip()
    }
    if allowed_hosts and parsed.hostname.lower() not in allowed_hosts:
        raise ValueError(f"clone url host {parsed.hostname!r} is not in ALLOWED_CLONE_HOSTS")

    return clone_url


class GatewayService:
    def detect_languages(self, repo_path: str) -> list:
        """Return every language detected, most confident first.

        A single value was wrong twice over: walk order is arbitrary, so a
        polyglot repo got a nondeterministic answer, and CodeQL builds one
        database per language — reporting only the first hit silently skipped
        the rest of the codebase.
        """
        found = []
        for manifest, language in MANIFEST_LANGUAGES:
            if os.path.exists(os.path.join(repo_path, manifest)) and language not in found:
                found.append(language)

        seen_files = 0
        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if not is_scan_skipped_dir_name(d)]
            for file in files:
                seen_files += 1
                if seen_files > MAX_DETECT_FILES:
                    return found
                language = EXTENSION_LANGUAGES.get(os.path.splitext(file)[1].lower())
                if language and language not in found:
                    found.append(language)
        return found

    def _shallow_clone(self, clone_url: str, commit_sha: str, branch: str, target_dir: str):
        # GIT_TERMINAL_PROMPT=0 makes an auth-required clone fail fast instead
        # of blocking the worker thread on an interactive credential prompt.
        env = {"GIT_TERMINAL_PROMPT": "0"}
        kwargs = {"depth": 1, "env": env}
        if branch:
            kwargs["branch"] = branch
        repo = Repo.clone_from(clone_url, target_dir, **kwargs)
        if commit_sha:
            # A shallow clone of a branch may not contain an older sha; fetch it
            # explicitly rather than failing the whole scan.
            try:
                repo.git.checkout(commit_sha)
            except Exception:
                repo.git.fetch("origin", commit_sha, depth=1)
                repo.git.checkout(commit_sha)

    async def process_job(self, job_id: str, payload: Dict[str, Any]) -> None:
        """Handle one `security-scan` job.

        The payload is the backend's ScanJobInput — {scanId, tenantId, options,
        correlationId} — which carries no clone URL. Everything about what to
        clone comes from the database.
        """
        scan_id = payload.get("scanId") or payload.get("scan_id")
        tenant_id = payload.get("tenantId") or payload.get("tenant_id") or ""
        options = ScanOptions.model_validate(payload.get("options") or {})

        print(f"[*] GatewayService: job {job_id} -> scan {scan_id}")
        scratch_dir = tempfile.mkdtemp(prefix=SCRATCHPAD_PREFIX)

        try:
            scan = await get_scan_target(scan_id)
            if scan is None:
                raise ValueError(f"scan {scan_id!r} not found")

            clone_url = validate_clone_url(await resolve_clone_url(scan, tenant_id))

            await asyncio.to_thread(
                self._shallow_clone, clone_url, scan.get("commit_sha") or "",
                scan.get("branch") or "", scratch_dir,
            )
            languages = await asyncio.to_thread(self.detect_languages, scratch_dir)
            uri = await asyncio.to_thread(upload_codebase, scratch_dir, scan_id)

            message = ScanMessage(
                job_id=job_id,
                scan_id=scan_id,
                uri=uri,
                language=languages[0] if languages else "unknown",
                languages=languages,
                commit_sha=scan.get("commit_sha") or "",
                tenant_id=tenant_id,
                options=options,
            )
            body = message.model_dump()

            for engine_queue in queue.ENGINE_QUEUES.values():
                await queue.send(engine_queue, body)

            print(f"[*] GatewayService: scan {scan_id} delegated to "
                  f"{len(queue.ENGINE_QUEUES)} engines. languages={languages} uri={uri}")

        except Exception as err:
            # Redact before this reaches stdout or the job output: the failing
            # URL carries the tenant's git token.
            safe_error = redact_credentials(str(err))
            print(f"[!] GatewayService error on scan {scan_id}: {safe_error}")
            if scan_id:
                await fail_scan(scan_id, safe_error)
            # Re-raised so the worker runtime records the failure on the job and
            # applies pg-boss retry semantics.
            raise RuntimeError(safe_error) from None
        finally:
            shutil.rmtree(scratch_dir, ignore_errors=True)
